/**
 * Documented `ledger_transactions.reference_type` / logical event names used across RPCs.
 * Existing rows may still use legacy names (e.g. wallet_funding); new flows prefer the clearer labels below.
 */
export const LEDGER_REFERENCE_TYPES = [
  "wallet_funding",
  "wallet_topup_instant_release",
  "wallet_funding_release",
  "batch_funded",
  "batch_payout",
  "batch_run",
  "claim_completed",
  "withdrawal_created",
  "stripe_connect_withdrawal",
  "refund_posted",
  "fee_charged",
  "withdrawal_fee",
] as const;

export type LedgerReferenceType = (typeof LEDGER_REFERENCE_TYPES)[number];

/** Logical product events (may map 1:1 to ledger reference_type or audit event_type). */
export const LEDGER_LOGICAL_EVENT_TYPES = [
  "wallet_topup",
  "batch_funded",
  "claim_completed",
  "withdrawal_created",
  "withdrawal_completed",
  "withdrawal_failed",
  "refund_posted",
  "fee_charged",
] as const;

export type LedgerLogicalEventType = (typeof LEDGER_LOGICAL_EVENT_TYPES)[number];
