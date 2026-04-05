import { auth } from "@clerk/nextjs/server";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStripeServerClient } from "@/lib/stripe";
import { ensureWalletForUser } from "@/lib/wallet";
import { normalizeIdempotencyKey } from "@/lib/stripeConnectServer";
import { resolveWithdrawalPricingFromWalletGbp } from "@/lib/payments/pricing";
import { sumGbpPendingMinor } from "@/lib/stripeGbpBalanceSums";
import { planConnectWalletPayout } from "@/lib/stripeConnectPayoutLiquidity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WithdrawBody = {
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
 * Debits the Supabase wallet first, then creates a Stripe Connect payout.
 * On Stripe failure, refunds the wallet via fail_withdrawal_and_refund (idempotent).
 */
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const body = (await req.json()) as WithdrawBody;
    const grossMinor = parseAmountGbpMinor(body.amountGbp);
    if (!grossMinor) {
      return NextResponse.json(
        { error: "Amount must be a valid GBP amount between 1.00 and 100,000.00." },
        { status: 400 }
      );
    }

    const idempotencyKey = normalizeIdempotencyKey(body.idempotencyKey, () => randomUUID());
    const supabase = supabaseAdmin();

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

    const { data: createData, error: createErr } = await supabase.rpc("create_withdrawal_from_wallet", {
      p_idempotency_key: idempotencyKey,
      p_user_id: userId,
      p_wallet_id: wallet.id,
      p_total_debit_minor: wd.totalWalletDebitMinor,
      p_fee_minor: wd.feeMinor,
      p_requested_amount_minor: wd.withdrawalAmountMinor,
      p_net_payout_minor: wd.netPayoutMinor,
    });

    if (createErr) {
      console.error("create_withdrawal_from_wallet RPC error:", createErr);
      const msg = createErr.message ?? "";
      if (msg.includes("Insufficient available balance")) {
        return NextResponse.json(
          {
            error: msg,
            withdrawalFailureKind: "internal_wallet_insufficient" satisfies WithdrawalFailureKind,
          },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: createErr.message }, { status: 500 });
    }

    const created = createData as {
      ok?: boolean;
      duplicate?: boolean;
      error?: string;
      execution_id?: string;
      ledger_transaction_id?: string;
      status?: string;
      total_debit_minor?: number;
      fee_minor?: number;
      net_payout_minor?: number;
      requested_amount_minor?: number;
    } | null;

    if (!created?.ok) {
      return NextResponse.json({ error: created?.error ?? "Could not create withdrawal." }, { status: 400 });
    }

    if (created.duplicate) {
      return NextResponse.json({
        ok: true,
        duplicate: true,
        executionId: created.execution_id,
        ledgerTransactionId: created.ledger_transaction_id,
        status: created.status,
        requestedAmountMinor: created.requested_amount_minor,
        walletDebitMinor: created.total_debit_minor,
        feeMinor: created.fee_minor,
        netPayoutMinor: created.net_payout_minor,
        walletId: wallet.id,
        payoutOnly: true,
      });
    }

    const connectedBalance = await stripe.balance.retrieve(
      {},
      { stripeAccount: stripeAccountId }
    );

    const liquidity = planConnectWalletPayout(connectedBalance, wd.netPayoutMinor, true);
    if (!liquidity.ok) {
      const connectedPendingMinor = sumGbpPendingMinor(connectedBalance);
      await supabase.rpc("fail_withdrawal_and_refund", {
        p_idempotency_key: idempotencyKey,
        p_failure_reason: "connected_stripe_available_insufficient_precheck",
      });
      return NextResponse.json(
        {
          error:
            "Connected account Stripe GBP balance is not enough for this payout. Wait for funds to settle or reduce the amount.",
          withdrawalFailureKind: "connected_stripe_available_insufficient" satisfies WithdrawalFailureKind,
          requiredGbpMinor: wd.netPayoutMinor,
          connectedAvailableGbpMinor: liquidity.availableGbpMinor,
          connectedInstantAvailableGbpMinor: liquidity.instantAvailableGbpMinor,
          connectedPendingGbpMinor: connectedPendingMinor,
        },
        { status: 400 }
      );
    }

    await supabase
      .from("wallet_withdrawal_executions")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("idempotency_key", idempotencyKey);

    let payout: Awaited<ReturnType<typeof stripe.payouts.create>> | null = null;
    try {
      payout = await stripe.payouts.create(
        {
          amount: wd.netPayoutMinor,
          currency: "gbp",
          method: liquidity.payoutMethod,
          metadata: {
            clerk_user_id: userId,
            idempotency_key: idempotencyKey,
            payout_only: "true",
            withdrawal_requested_minor: String(wd.withdrawalAmountMinor),
            withdrawal_fee_minor: String(wd.feeMinor),
            flow: "wallet_withdrawal_execution",
          },
        },
        {
          stripeAccount: stripeAccountId,
          idempotencyKey: `connect-po-${idempotencyKey}`,
        }
      );
    } catch (payoutError) {
      console.error("Stripe payout failed:", payoutError);
      const reason =
        payoutError instanceof Stripe.errors.StripeError
          ? `${payoutError.code ?? "stripe_error"}: ${payoutError.message}`
          : payoutError instanceof Error
            ? payoutError.message
            : "payout_failed";

      const { data: failData, error: failErr } = await supabase.rpc("fail_withdrawal_and_refund", {
        p_idempotency_key: idempotencyKey,
        p_failure_reason: reason,
      });

      if (failErr) {
        console.error("fail_withdrawal_and_refund after Stripe failure:", failErr);
        return NextResponse.json(
          {
            error: failErr.message,
            warning: "Stripe payout failed and wallet refund RPC also failed; reconcile urgently.",
          },
          { status: 500 }
        );
      }

      const failResult = failData as { ok?: boolean; error?: string } | null;
      if (!failResult?.ok) {
        return NextResponse.json(
          { error: failResult?.error ?? "Refund failed after payout error." },
          { status: 500 }
        );
      }

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
            : reason,
          ...(withdrawalFailureKind ? { withdrawalFailureKind } : {}),
          walletRefunded: true,
        },
        { status: 502 }
      );
    }

    const { data: completeData, error: completeErr } = await supabase.rpc("complete_withdrawal", {
      p_idempotency_key: idempotencyKey,
      p_stripe_payout_id: payout.id,
    });

    if (completeErr) {
      console.error("complete_withdrawal RPC failed after Stripe success:", completeErr);
      return NextResponse.json(
        {
          error: completeErr.message,
          stripePayoutId: payout.id,
          warning:
            "Stripe payout succeeded but completion bookkeeping failed; reconcile manually before retrying.",
        },
        { status: 500 }
      );
    }

    const complete = completeData as { ok?: boolean; error?: string; duplicate?: boolean } | null;
    if (!complete?.ok) {
      return NextResponse.json(
        { error: complete?.error ?? "Completion failed", stripePayoutId: payout.id },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      duplicate: Boolean(complete.duplicate),
      requestedAmountMinor: wd.withdrawalAmountMinor,
      walletDebitMinor: wd.totalWalletDebitMinor,
      feeMinor: wd.feeMinor,
      netPayoutMinor: wd.netPayoutMinor,
      feeDeductedFromWithdrawal: wd.feeDeductedFromWithdrawal,
      feeChargedSeparately: !wd.feeDeductedFromWithdrawal,
      feeMode: wd.feeMode,
      stripePayoutMethod: liquidity.payoutMethod,
      stripeTransferId: null,
      stripePayoutId: payout.id,
      ledgerTransactionId: created.ledger_transaction_id,
      executionId: created.execution_id,
      walletId: wallet.id,
      payoutOnly: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/wallet/withdrawals/create:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
