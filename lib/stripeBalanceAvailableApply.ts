import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Sum Stripe Balance `available[]` amounts for GBP (minor units, pence). */
export function sumGbpAvailableMinor(balance: Stripe.Balance | null | undefined): number {
  if (!balance?.available?.length) return 0;
  let sum = 0;
  for (const row of balance.available) {
    if ((row.currency || "").toLowerCase() === "gbp" && typeof row.amount === "number") {
      sum += row.amount;
    }
  }
  return sum;
}

export type BalanceAvailableApplyError = { status: number; message: string };

/**
 * Idempotent: one ledger row per Stripe event id. Moves wallet pending → current in FIFO
 * (see apply_stripe_balance_available_release migration).
 */
export async function applyStripeBalanceAvailableFromEvent(
  supabase: SupabaseClient,
  event: Stripe.BalanceAvailableEvent
): Promise<{ data: unknown; error: BalanceAvailableApplyError | null }> {
  const balance = event.data.object;
  const newMinor = sumGbpAvailableMinor(balance);
  const { data, error } = await supabase.rpc("apply_stripe_balance_available_release", {
    p_stripe_event_id: event.id,
    p_livemode: event.livemode,
    p_new_available_gbp_minor: newMinor,
  });

  if (error) {
    return { data: null, error: { status: 500, message: error.message } };
  }

  return { data, error: null };
}
