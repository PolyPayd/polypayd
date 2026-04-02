import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sum Stripe Balance `available[]` for GBP (minor units). Used only to update the platform
 * reconciliation checkpoint — not to size user wallet pending→available releases.
 */
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

export type BalanceAvailableApplyError = { status: number; message: string };

/**
 * Idempotent: one parent ledger row per Stripe event id. RPC records Stripe available for audit
 * and releases pending → current using intended top-up queue amounts (not Stripe net deltas).
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
