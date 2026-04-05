/**
 * Claim Link batch funding: allowed `batches.status` values before wallet reserve RPC.
 * Keep in sync with `fund_batch_from_wallet` in Supabase.
 */

/** Statuses that may enter the wallet fund RPC on first reserve (not yet live for claims). */
export const BATCH_STATUS_FUNDABLE_FROM_WALLET = ["draft", "ready", "processing"] as const;
export type BatchStatusFundableFromWallet = (typeof BATCH_STATUS_FUNDABLE_FROM_WALLET)[number];

export function isBatchStatusFundableFromWallet(status: string | null | undefined): boolean {
  const s = String(status ?? "").toLowerCase();
  return (BATCH_STATUS_FUNDABLE_FROM_WALLET as readonly string[]).includes(s);
}
