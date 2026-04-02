/**
 * Rules for wallet dashboard totals (ledger-backed, full history — not a recent-rows window).
 *
 * Total funded: intended top-up credits only (pending funding at PI success).
 * Total sent: user wallet debits for bulk send, claim-link batches, and Connect withdrawals only.
 * Excludes: stripe_balance_available / wallet_funding_release, internal platform lines, etc.
 */
export const WALLET_LEDGER_TOTAL_FUNDED_TX_REFERENCE_TYPES = ["wallet_funding"] as const;

export const WALLET_LEDGER_TOTAL_SENT_TX_REFERENCE_TYPES = [
  "batch_run",
  "batch_payout",
  "stripe_connect_withdrawal",
] as const;

export type WalletDashboardLedgerTotals = {
  totalFunded: number;
  totalSent: number;
};
