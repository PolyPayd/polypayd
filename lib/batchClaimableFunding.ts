/**
 * Claim Link batch funding: idempotency key and allowed `batches.status` values.
 * Keep in sync with `fund_batch_from_wallet` and `batches_status_check` in Supabase.
 */

export const BATCH_FUND_IDEMPOTENCY_PREFIX = "batch-fund-" as const;

export function batchFundIdempotencyKey(batchId: string): string {
  return `${BATCH_FUND_IDEMPOTENCY_PREFIX}${batchId}`;
}

/** Statuses that may receive the wallet fund RPC (pre-reserve / pre-claim links). */
export const BATCH_STATUS_FUNDABLE_FROM_WALLET = ["draft", "ready", "processing"] as const;
export type BatchStatusFundableFromWallet = (typeof BATCH_STATUS_FUNDABLE_FROM_WALLET)[number];

/** Statuses after funding has started or the batch run finished — no wallet fund CTA. */
export const BATCH_STATUS_PAST_WALLET_FUND = [
  "funded",
  "claiming",
  "completed",
  "completed_with_errors",
] as const;

export function isBatchStatusFundableFromWallet(status: string | null | undefined): boolean {
  const s = String(status ?? "").toLowerCase();
  return (BATCH_STATUS_FUNDABLE_FROM_WALLET as readonly string[]).includes(s);
}

export function isBatchPastWalletFundStage(status: string | null | undefined): boolean {
  const s = String(status ?? "").toLowerCase();
  return (BATCH_STATUS_PAST_WALLET_FUND as readonly string[]).includes(s);
}
