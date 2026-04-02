import type { TopupChargeBreakdown } from "@/lib/payments/pricing";

/**
 * Stripe PaymentIntent create payload for a direct charge on a Connect account (server passes
 * this object as the first argument and `{ stripeAccount }` as the second).
 */
export function buildConnectedWalletTopupPaymentIntentParams(
  pricing: TopupChargeBreakdown,
  metadata: Record<string, string>
) {
  return {
    amount: pricing.totalChargeMinor,
    currency: "gbp" as const,
    application_fee_amount: pricing.processingFeeMinor,
    automatic_payment_methods: { enabled: true } as const,
    metadata,
  };
}
