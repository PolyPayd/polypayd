/**
 * Gross customer charge for wallet top-up validation against metadata `total_charge_minor`.
 * On Connect direct charges, `amount_received` often reflects net-to-connected (after Stripe fees),
 * not the gross charge — use `amount` for succeeded PaymentIntents.
 */
export function stripeTopupGrossMinorForValidation(pi: {
  status: string;
  amount?: number | null;
  amount_received?: number | null;
}): number {
  if (pi.status === "succeeded" && typeof pi.amount === "number" && pi.amount > 0) {
    return pi.amount;
  }
  return (pi.amount_received ?? pi.amount ?? 0) || 0;
}
