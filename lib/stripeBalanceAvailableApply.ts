import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sumGbpAvailableMinor } from "@/lib/stripeGbpBalanceSums";

export {
  sumGbpAvailableMinor,
  sumGbpPendingMinor,
  sumGbpInstantAvailableMinor,
} from "@/lib/stripeGbpBalanceSums";

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
