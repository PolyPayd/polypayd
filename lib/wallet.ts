import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_CURRENCY = "GBP";

/**
 * Ensure a wallet exists for the user and currency (default GBP).
 * Creates one if missing. Call on first authenticated app access so UI can assume wallet exists.
 */
export async function ensureWalletForUser(
  supabase: SupabaseClient,
  userId: string,
  currency: string = DEFAULT_CURRENCY
): Promise<{ id: string; current_balance: number } | null> {
  const curr = (currency || DEFAULT_CURRENCY).trim() || DEFAULT_CURRENCY;

  const { data: existing } = await supabase
    .from("wallets")
    .select("id, current_balance")
    .eq("user_id", userId)
    .eq("currency", curr)
    .maybeSingle();

  if (existing) {
    return { id: existing.id, current_balance: Number(existing.current_balance ?? 0) };
  }

  const { data: created, error } = await supabase
    .from("wallets")
    .insert({ user_id: userId, currency: curr, current_balance: 0 })
    .select("id, current_balance")
    .single();

  if (error || !created) return null;
  return { id: created.id, current_balance: Number(created.current_balance ?? 0) };
}
