import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

function isUuid(value: string) {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

function getTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export type WalletTopupApplyError = { status: number; message: string };

/**
 * Validates a succeeded PaymentIntent and calls apply_stripe_wallet_topup (idempotent per PI id).
 * Used by Stripe webhook and by the local-dev sync endpoint when webhooks cannot reach localhost.
 */
export async function applyStripeWalletTopupFromPaymentIntent(
  supabase: SupabaseClient,
  paymentIntent: Stripe.PaymentIntent,
  stripeEventIdForAudit: string,
  eventType: string,
  livemode: boolean
): Promise<{ data: unknown; error: WalletTopupApplyError | null }> {
  const currency = (paymentIntent.currency || "").toUpperCase();
  const amountMinor = paymentIntent.amount_received ?? paymentIntent.amount ?? 0;
  const metadata = paymentIntent.metadata ?? {};

  const userId = getTrimmedString(metadata.clerk_user_id);
  const orgId = getTrimmedString(metadata.org_id);
  const walletId = getTrimmedString(metadata.wallet_id);
  const walletCurrency = getTrimmedString(metadata.wallet_currency)?.toUpperCase() ?? "";

  if (!paymentIntent.id || !userId || !orgId || !walletId) {
    return {
      data: null,
      error: { status: 400, message: "Missing required PaymentIntent metadata." },
    };
  }

  if (!isUuid(orgId)) {
    return { data: null, error: { status: 400, message: "Invalid org_id in PaymentIntent metadata." } };
  }

  if (!isUuid(walletId)) {
    return { data: null, error: { status: 400, message: "Invalid wallet_id in PaymentIntent metadata." } };
  }

  if (currency !== "GBP" || walletCurrency !== "GBP") {
    return { data: null, error: { status: 400, message: "Only GBP wallet top-ups are supported." } };
  }

  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    return { data: null, error: { status: 400, message: "Invalid top-up amount." } };
  }

  const { data, error } = await supabase.rpc("apply_stripe_wallet_topup", {
    p_stripe_event_id: stripeEventIdForAudit,
    p_payment_intent_id: paymentIntent.id,
    p_wallet_id: walletId,
    p_user_id: userId,
    p_org_id: orgId,
    p_amount_minor: amountMinor,
    p_currency: "GBP",
    p_event_type: eventType,
    p_livemode: livemode,
  });

  if (error) {
    return { data: null, error: { status: 500, message: error.message } };
  }

  return { data, error: null };
}
