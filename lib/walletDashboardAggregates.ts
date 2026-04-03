/**
 * Rules for wallet dashboard totals (ledger-backed, full history — not a recent-rows window).
 *
 * Total funded: intended top-up credits only (`wallet_funding` at PI success; pending→available via release queue).
 * Total from internal claims: `claim_completed` credits (batch funded internally; lands in current_balance).
 * Total sent: user wallet debits for bulk send, legacy claim payout, Connect withdrawals, reserve-first withdrawals.
 * Excludes: stripe_balance_available / wallet_funding_release, internal platform lines, etc.
 */
export const WALLET_LEDGER_TOTAL_FUNDED_TX_REFERENCE_TYPES = ["wallet_funding"] as const;

export const WALLET_LEDGER_INTERNAL_CLAIM_CREDIT_TYPES = ["claim_completed"] as const;

export const WALLET_LEDGER_TOTAL_SENT_TX_REFERENCE_TYPES = [
  "batch_run",
  "batch_payout",
  "stripe_connect_withdrawal",
  "withdrawal_created",
] as const;

export type WalletDashboardLedgerTotals = {
  totalFunded: number;
  /** Sum of `claim_completed` credits (available immediately; not card top-up). */
  totalFromInternalClaims: number;
  totalSent: number;
};
