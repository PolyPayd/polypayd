import type Stripe from "stripe";

function sumGbpBalanceRows(
  rows: Array<{ amount?: number; currency?: string }> | undefined,
  currency: string
): number {
  if (!rows?.length) return 0;
  let sum = 0;
  const c = currency.toLowerCase();
  for (const row of rows) {
    if ((row.currency || "").toLowerCase() === c && typeof row.amount === "number") {
      sum += row.amount;
    }
  }
  return sum;
}

export function sumGbpAvailableMinor(balance: Stripe.Balance | null | undefined): number {
  return sumGbpBalanceRows(balance?.available, "gbp");
}

export function sumGbpPendingMinor(balance: Stripe.Balance | null | undefined): number {
  return sumGbpBalanceRows(balance?.pending, "gbp");
}

/** GBP minor units in {@link Stripe.Balance.instant_available} (Instant Payout–eligible funds). */
export function sumGbpInstantAvailableMinor(balance: Stripe.Balance | null | undefined): number {
  return sumGbpBalanceRows(balance?.instant_available, "gbp");
}
