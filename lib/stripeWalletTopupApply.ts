import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { shouldImmediateReleaseWalletTopup } from "@/lib/connectedStripeTopup";
import { stripeTopupGrossMinorForValidation } from "@/lib/stripeTopupGrossMinor";

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

function parsePositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const n = parseInt(value, 10);
    if (n > 0) return n;
  }
  return null;
}

export type WalletTopupApplyError = { status: number; message: string };

const TOPUP_APPLY_LOG = process.env.POLYPAYD_STRIPE_WEBHOOK_DEBUG === "1";

/**
 * Validates a succeeded PaymentIntent and calls apply_stripe_wallet_topup (idempotent per PI id).
 * Credits wallet with intended wallet credit from metadata when present.
 */
export async function applyStripeWalletTopupFromPaymentIntent(
  supabase: SupabaseClient,
  paymentIntent: Stripe.PaymentIntent,
  stripeEventIdForAudit: string,
  eventType: string,
  livemode: boolean,
  stripeConnectAccountFromEvent?: string | null
): Promise<{ data: unknown; error: WalletTopupApplyError | null }> {
  const currency = (paymentIntent.currency || "").toUpperCase();
  const grossMinor = stripeTopupGrossMinorForValidation(paymentIntent);
  const amountReceivedMinor = paymentIntent.amount_received ?? 0;
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

  if (!Number.isFinite(grossMinor) || grossMinor <= 0) {
    if (TOPUP_APPLY_LOG) {
      console.info("[stripeWalletTopupApply] invalid gross", {
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount,
        amount_received: paymentIntent.amount_received,
      });
    }
    return { data: null, error: { status: 400, message: "Invalid top-up amount." } };
  }

  const walletCreditMeta = parsePositiveInt(metadata.wallet_credit_minor);
  const totalChargeMeta = parsePositiveInt(metadata.total_charge_minor);

  let walletCreditMinor: number;
  let stripeTotalChargedMinor: number | null;
  let processingFeeMinor: number | null;

  if (walletCreditMeta != null && totalChargeMeta != null) {
    if (grossMinor !== totalChargeMeta) {
      console.error("[stripeWalletTopupApply] total charge mismatch (gross vs metadata)", {
        paymentIntentId: paymentIntent.id,
        paymentIntentAmount: paymentIntent.amount,
        amount_received: amountReceivedMinor,
        grossMinorUsedForValidation: grossMinor,
        metadata_total_charge_minor: totalChargeMeta,
        metadata_wallet_credit_minor: metadata.wallet_credit_minor,
        hint:
          "For Connect, amount_received is often net-of-fees; validation uses paymentIntent.amount (gross).",
      });
      return {
        data: null,
        error: {
          status: 400,
          message: "Payment amount does not match expected total charge; refusing to apply top-up.",
        },
      };
    }
    if (totalChargeMeta < walletCreditMeta) {
      return {
        data: null,
        error: { status: 400, message: "Invalid top-up metadata (total less than wallet credit)." },
      };
    }
    walletCreditMinor = walletCreditMeta;
    stripeTotalChargedMinor = totalChargeMeta;
    processingFeeMinor = totalChargeMeta - walletCreditMeta;
  } else {
    const legacyTopup = parsePositiveInt(metadata.topup_amount_minor);
    if (legacyTopup != null && legacyTopup !== grossMinor) {
      return {
        data: null,
        error: {
          status: 400,
          message: "Legacy top-up metadata does not match amount received.",
        },
      };
    }
    walletCreditMinor = grossMinor;
    stripeTotalChargedMinor = null;
    processingFeeMinor = null;
  }

  const pImmediateRelease = shouldImmediateReleaseWalletTopup(
    metadata as Record<string, string | undefined>
  );

  const metaConnectAcct = getTrimmedString(metadata.stripe_connect_account_id);
  if (
    pImmediateRelease &&
    typeof stripeConnectAccountFromEvent === "string" &&
    stripeConnectAccountFromEvent.length > 0 &&
    metaConnectAcct &&
    stripeConnectAccountFromEvent !== metaConnectAcct
  ) {
    return {
      data: null,
      error: {
        status: 400,
        message: "PaymentIntent Connect account does not match event account.",
      },
    };
  }

  if (TOPUP_APPLY_LOG) {
    console.info("[stripeWalletTopupApply] calling apply_stripe_wallet_topup", {
      paymentIntentId: paymentIntent.id,
      p_immediate_release: pImmediateRelease,
      walletCreditMinor,
      stripeTotalChargedMinor,
      amount: paymentIntent.amount,
      amount_received: paymentIntent.amount_received,
    });
  }

  const { data, error } = await supabase.rpc("apply_stripe_wallet_topup", {
    p_stripe_event_id: stripeEventIdForAudit,
    p_payment_intent_id: paymentIntent.id,
    p_wallet_id: walletId,
    p_user_id: userId,
    p_org_id: orgId,
    p_amount_minor: walletCreditMinor,
    p_currency: "GBP",
    p_event_type: eventType,
    p_livemode: livemode,
    p_stripe_total_charged_minor: stripeTotalChargedMinor,
    p_processing_fee_minor: processingFeeMinor,
    p_immediate_release: pImmediateRelease,
  });

  if (error) {
    console.error("[stripeWalletTopupApply] Supabase RPC apply_stripe_wallet_topup error", {
      message: error.message,
      code: (error as { code?: string }).code,
      details: (error as { details?: string }).details,
      hint: (error as { hint?: string }).hint,
      paymentIntentId: paymentIntent.id,
      p_immediate_release: pImmediateRelease,
    });
    return { data: null, error: { status: 500, message: error.message } };
  }

  if (TOPUP_APPLY_LOG) {
    console.info("[stripeWalletTopupApply] apply_stripe_wallet_topup ok", { data, paymentIntentId: paymentIntent.id });
  }

  return { data, error: null };
}
