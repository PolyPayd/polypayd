import { auth } from "@clerk/nextjs/server";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStripeServerClient } from "@/lib/stripe";
import { ensureWalletForUser } from "@/lib/wallet";
import { normalizeIdempotencyKey } from "@/lib/stripeConnectServer";
import { resolveWithdrawalPricingFromWalletGbp } from "@/lib/payments/pricing";
import { sumGbpAvailableMinor, sumGbpPendingMinor } from "@/lib/stripeBalanceAvailableApply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PayoutBody = {
  amountGbp?: number;
  idempotencyKey?: string;
};

type WithdrawalFailureKind =
  | "internal_wallet_insufficient"
  | "connected_stripe_available_insufficient";

function parseAmountGbpMinor(amount: unknown) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  if (amount < 1 || amount > 100_000) return null;
  const amountMinor = Math.round(amount * 100);
  if (amountMinor < 100) return null;
  return amountMinor;
}

/**
 * Payout from the user's Connect Express GBP balance to their bank (no platform transfer).
 * Debits the Supabase GBP wallet only after Stripe payout succeeds.
 */
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const body = (await req.json()) as PayoutBody;
    const grossMinor = parseAmountGbpMinor(body.amountGbp);
    if (!grossMinor) {
      return NextResponse.json(
        { error: "Amount must be a valid GBP amount between 1.00 and 100,000.00." },
        { status: 400 }
      );
    }

    const idempotencyKey = normalizeIdempotencyKey(body.idempotencyKey, () => randomUUID());
    const supabase = supabaseAdmin();

    const { data: prior, error: priorErr } = await supabase
      .from("stripe_connect_withdrawals")
      .select(
        "amount_minor, fee_minor, net_payout_minor, requested_amount_minor, stripe_transfer_id, stripe_payout_id, ledger_transaction_id, wallet_id, created_at"
      )
      .eq("idempotency_key", idempotencyKey)
      .eq("user_id", userId)
      .maybeSingle();

    if (priorErr) {
      console.error("stripe_connect_withdrawals duplicate check failed:", priorErr);
      return NextResponse.json({ error: priorErr.message }, { status: 500 });
    }

    if (prior) {
      const requested =
        typeof prior.requested_amount_minor === "number" && prior.requested_amount_minor > 0
          ? prior.requested_amount_minor
          : prior.amount_minor;
      const feeDeductedFromWithdrawal = prior.amount_minor === requested;
      return NextResponse.json({
        ok: true,
        duplicate: true,
        requestedAmountMinor: requested,
        walletDebitMinor: prior.amount_minor,
        feeMinor: prior.fee_minor,
        netPayoutMinor: prior.net_payout_minor,
        feeDeductedFromWithdrawal,
        feeChargedSeparately: !feeDeductedFromWithdrawal,
        feeMode: feeDeductedFromWithdrawal ? "deducted_from_withdrawal" : "charged_separately",
        stripeTransferId: prior.stripe_transfer_id,
        stripePayoutId: prior.stripe_payout_id,
        ledgerTransactionId: prior.ledger_transaction_id,
        walletId: prior.wallet_id,
        payoutOnly: prior.stripe_transfer_id == null,
      });
    }

    const { data: connectRow, error: connectErr } = await supabase
      .from("stripe_connect_accounts")
      .select("stripe_account_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (connectErr) {
      console.error("stripe_connect_accounts select failed:", connectErr);
      return NextResponse.json({ error: connectErr.message }, { status: 500 });
    }

    if (!connectRow?.stripe_account_id) {
      return NextResponse.json(
        {
          error:
            "A Stripe Connect account is required. Complete onboarding via Connect setup in your wallet.",
          errorCode: "MISSING_CONNECT_ACCOUNT",
        },
        { status: 400 }
      );
    }

    const stripe = getStripeServerClient();
    const stripeAccountId = connectRow.stripe_account_id;

    const account = await stripe.accounts.retrieve(stripeAccountId);
    if (!account.payouts_enabled) {
      return NextResponse.json(
        {
          error:
            "Stripe payouts are not enabled for this account yet. Finish Connect onboarding and bank setup.",
          errorCode: "PAYOUTS_NOT_ENABLED",
        },
        { status: 400 }
      );
    }

    const wallet = await ensureWalletForUser(supabase, userId, "GBP");
    if (!wallet) {
      return NextResponse.json({ error: "Failed to load wallet." }, { status: 500 });
    }

    let wd: ReturnType<typeof resolveWithdrawalPricingFromWalletGbp>;
    try {
      wd = resolveWithdrawalPricingFromWalletGbp(grossMinor, Number(wallet.current_balance));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Invalid withdrawal amount.";
      if (msg.includes("Insufficient available balance")) {
        return NextResponse.json(
          {
            error:
              "Internal wallet available balance is insufficient for this withdrawal. Pending top-ups must clear first.",
            withdrawalFailureKind: "internal_wallet_insufficient" satisfies WithdrawalFailureKind,
          },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const connectedBalance = await stripe.balance.retrieve({ stripeAccount: stripeAccountId });
    const connectedAvailableMinor = sumGbpAvailableMinor(connectedBalance);
    if (connectedAvailableMinor < wd.netPayoutMinor) {
      const connectedPendingMinor = sumGbpPendingMinor(connectedBalance);
      return NextResponse.json(
        {
          error:
            "Connected account Stripe available GBP is not enough for this payout. Wait for funds to settle or reduce the amount.",
          withdrawalFailureKind: "connected_stripe_available_insufficient" satisfies WithdrawalFailureKind,
          requiredGbpMinor: wd.netPayoutMinor,
          connectedAvailableGbpMinor: connectedAvailableMinor,
          connectedPendingGbpMinor: connectedPendingMinor,
        },
        { status: 400 }
      );
    }

    let payout: Awaited<ReturnType<typeof stripe.payouts.create>> | null = null;
    try {
      payout = await stripe.payouts.create(
        {
          amount: wd.netPayoutMinor,
          currency: "gbp",
          method: "instant",
          metadata: {
            clerk_user_id: userId,
            idempotency_key: idempotencyKey,
            payout_only: "true",
            withdrawal_requested_minor: String(wd.withdrawalAmountMinor),
            withdrawal_fee_minor: String(wd.feeMinor),
          },
        },
        {
          stripeAccount: stripeAccountId,
          idempotencyKey: `connect-po-${idempotencyKey}`,
        }
      );
    } catch (payoutError) {
      console.error("Stripe payout failed:", payoutError);
      const message = payoutError instanceof Error ? payoutError.message : "Payout failed";
      let withdrawalFailureKind: WithdrawalFailureKind | undefined;
      if (payoutError instanceof Stripe.errors.StripeError) {
        if (
          payoutError.code === "balance_insufficient" ||
          payoutError.code === "insufficient_funds"
        ) {
          withdrawalFailureKind = "connected_stripe_available_insufficient";
        }
      }
      return NextResponse.json(
        {
          error: withdrawalFailureKind
            ? "Connected account Stripe available GBP was not enough to complete this payout."
            : message,
          ...(withdrawalFailureKind ? { withdrawalFailureKind } : {}),
        },
        { status: 502 }
      );
    }

    const { data: rpcData, error: rpcErr } = await supabase.rpc("apply_stripe_connect_withdrawal", {
      p_idempotency_key: idempotencyKey,
      p_user_id: userId,
      p_wallet_id: wallet.id,
      p_amount_minor: wd.totalWalletDebitMinor,
      p_stripe_transfer_id: null,
      p_payout_id: payout.id,
      p_fee_minor: wd.feeMinor,
      p_requested_amount_minor: wd.withdrawalAmountMinor,
    });

    if (rpcErr) {
      console.error("apply_stripe_connect_withdrawal RPC failed after Stripe payout:", rpcErr);
      return NextResponse.json(
        {
          error: rpcErr.message,
          stripePayoutId: payout.id,
          warning:
            "Stripe payout succeeded but ledger debit failed; reconcile manually before retrying.",
        },
        { status: 500 }
      );
    }

    const result = rpcData as {
      applied?: boolean;
      duplicate?: boolean;
      reason?: string;
      ledger_transaction_id?: string;
      amount?: number;
    } | null;

    if (!result?.applied) {
      return NextResponse.json(
        { error: result?.reason ?? "Ledger debit failed", rpc: result },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      duplicate: Boolean(result.duplicate),
      requestedAmountMinor: wd.withdrawalAmountMinor,
      walletDebitMinor: wd.totalWalletDebitMinor,
      feeMinor: wd.feeMinor,
      netPayoutMinor: wd.netPayoutMinor,
      feeDeductedFromWithdrawal: wd.feeDeductedFromWithdrawal,
      feeChargedSeparately: !wd.feeDeductedFromWithdrawal,
      feeMode: wd.feeMode,
      stripeTransferId: null,
      stripePayoutId: payout.id,
      ledgerTransactionId: result.ledger_transaction_id,
      walletId: wallet.id,
      payoutOnly: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/stripe/payouts:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
