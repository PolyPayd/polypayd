import { auth } from "@clerk/nextjs/server";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStripeServerClient } from "@/lib/stripe";
import { ensureWalletForUser } from "@/lib/wallet";
import { normalizeIdempotencyKey } from "@/lib/stripeConnectServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PayoutBody = {
  amountGbp?: number;
  idempotencyKey?: string;
};

function parseAmountGbpMinor(amount: unknown) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  if (amount < 1 || amount > 100_000) return null;
  const amountMinor = Math.round(amount * 100);
  if (amountMinor < 100) return null;
  return amountMinor;
}

/**
 * Transfers funds from the platform Stripe balance to the user's Express account,
 * then creates a payout to their bank. Debits the Supabase GBP wallet only after both succeed.
 */
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const body = (await req.json()) as PayoutBody;
    const amountMinor = parseAmountGbpMinor(body.amountGbp);
    if (!amountMinor) {
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
        "amount_minor, stripe_transfer_id, stripe_payout_id, ledger_transaction_id, wallet_id, created_at"
      )
      .eq("idempotency_key", idempotencyKey)
      .eq("user_id", userId)
      .maybeSingle();

    if (priorErr) {
      console.error("stripe_connect_withdrawals duplicate check failed:", priorErr);
      return NextResponse.json({ error: priorErr.message }, { status: 500 });
    }

    if (prior) {
      return NextResponse.json({
        ok: true,
        duplicate: true,
        amountMinor: prior.amount_minor,
        stripeTransferId: prior.stripe_transfer_id,
        stripePayoutId: prior.stripe_payout_id,
        ledgerTransactionId: prior.ledger_transaction_id,
        walletId: prior.wallet_id,
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
        { error: "Connect account required. Complete onboarding via /api/stripe/connect/create-account." },
        { status: 400 }
      );
    }

    const stripe = getStripeServerClient();
    const stripeAccountId = connectRow.stripe_account_id;

    const account = await stripe.accounts.retrieve(stripeAccountId);
    if (!account.payouts_enabled) {
      return NextResponse.json(
        { error: "Stripe payouts are not enabled for this account yet. Finish Connect onboarding." },
        { status: 400 }
      );
    }

    const wallet = await ensureWalletForUser(supabase, userId, "GBP");
    if (!wallet) {
      return NextResponse.json({ error: "Failed to load wallet." }, { status: 500 });
    }

    const amountGbp = amountMinor / 100;
    const available = wallet.current_balance;
    if (available + 1e-9 < amountGbp) {
      return NextResponse.json(
        {
          error:
            "Insufficient available balance. Withdrawals use available funds only; pending top-ups must clear first.",
        },
        { status: 400 }
      );
    }

    const transfer = await stripe.transfers.create(
      {
        amount: amountMinor,
        currency: "gbp",
        destination: stripeAccountId,
        transfer_group: idempotencyKey,
        metadata: {
          clerk_user_id: userId,
          idempotency_key: idempotencyKey,
          wallet_id: wallet.id,
        },
      },
      { idempotencyKey: `connect-xfer-${idempotencyKey}` }
    );

    let payout: Awaited<ReturnType<typeof stripe.payouts.create>> | null = null;
    try {
      payout = await stripe.payouts.create(
        {
          amount: amountMinor,
          currency: "gbp",
          method: "instant",
          metadata: {
            clerk_user_id: userId,
            idempotency_key: idempotencyKey,
            stripe_transfer_id: transfer.id,
          },
        },
        {
          stripeAccount: stripeAccountId,
          idempotencyKey: `connect-po-${idempotencyKey}`,
        }
      );
    } catch (payoutError) {
      console.error("Stripe payout failed after transfer; attempting transfer reversal:", payoutError);
      try {
        await stripe.transfers.createReversal(
          transfer.id,
          {},
          { idempotencyKey: `connect-rev-${idempotencyKey}` }
        );
      } catch (revErr) {
        console.error("Transfer reversal failed:", revErr);
      }
      const message = payoutError instanceof Error ? payoutError.message : "Payout failed";
      return NextResponse.json({ error: message }, { status: 502 });
    }

    const { data: rpcData, error: rpcErr } = await supabase.rpc("apply_stripe_connect_withdrawal", {
      p_idempotency_key: idempotencyKey,
      p_user_id: userId,
      p_wallet_id: wallet.id,
      p_amount_minor: amountMinor,
      p_stripe_transfer_id: transfer.id,
      p_payout_id: payout.id,
    });

    if (rpcErr) {
      console.error("apply_stripe_connect_withdrawal RPC failed after Stripe transfer+payout:", rpcErr);
      return NextResponse.json(
        {
          error: rpcErr.message,
          stripeTransferId: transfer.id,
          stripePayoutId: payout.id,
          warning:
            "Stripe transfer and payout succeeded but ledger debit failed; reconcile manually before retrying.",
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
      amountMinor,
      stripeTransferId: transfer.id,
      stripePayoutId: payout.id,
      ledgerTransactionId: result.ledger_transaction_id,
      walletId: wallet.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/stripe/payouts:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
