/**
 * User-facing copy and sanitization for batch funding — never expose raw DB/RPC internals.
 */

export const BATCH_FUND_TRY_AGAIN = "Something went wrong, please try again.";
export const BATCH_FUND_NOT_NOW = "This batch can't be funded right now.";
export const BATCH_FUND_INSUFFICIENT_WALLET =
  "Your wallet doesn't have enough available balance to fund this batch (including any fees).";

const DB_LEAK_SUBSTRINGS = [
  "violates",
  "constraint",
  "relation ",
  "duplicate key",
  "foreign key",
  "unique constraint",
  "null value",
  "syntax error",
  "postgres",
  "postgresql",
  "42703",
  "23505",
  "23503",
  "22p02",
];

function looksLikeLeakedDatabaseMessage(message: string): boolean {
  const m = message.toLowerCase();
  return DB_LEAK_SUBSTRINGS.some((s) => m.includes(s));
}

/**
 * Maps raw errors (Postgres, PostgREST, or internal strings) to safe UI copy.
 */
export function sanitizeFundBatchErrorForUser(raw: string | null | undefined): string {
  if (raw == null || String(raw).trim() === "") return BATCH_FUND_TRY_AGAIN;
  const t = String(raw).trim();
  if (looksLikeLeakedDatabaseMessage(t)) return BATCH_FUND_NOT_NOW;

  const lower = t.toLowerCase();
  if (lower.includes("insufficient wallet balance")) return BATCH_FUND_INSUFFICIENT_WALLET;

  return BATCH_FUND_TRY_AGAIN;
}

/**
 * Maps known JSON-RPC `error` field values from `fund_batch_from_wallet` to short user copy.
 * Anything unknown is treated as "not now" (action not allowed) vs try-again (unexpected).
 */
export function userMessageForFundBatchRpcResultError(rpcError: string | null | undefined): string {
  if (rpcError == null || String(rpcError).trim() === "") return BATCH_FUND_NOT_NOW;
  if (looksLikeLeakedDatabaseMessage(rpcError)) return BATCH_FUND_NOT_NOW;

  const t = String(rpcError).trim();
  const lower = t.toLowerCase();

  if (lower.includes("insufficient wallet balance")) return BATCH_FUND_INSUFFICIENT_WALLET;

  const notNowSubstrings = [
    "batch not found",
    "forbidden",
    "only claimable",
    "allocations must be finalized",
    "no funder on record",
    "only the batch funder can fund",
    "not in a fundable state",
    "no recipients to fund",
    "invalid claim_amount",
    "total allocations do not match",
    "marked funded but no fund ledger",
    "fund ledger exists",
    "missing sender debit",
    "claim links are not issued",
    "not in a claimable state",
  ];

  if (notNowSubstrings.some((s) => lower.includes(s))) return BATCH_FUND_NOT_NOW;

  return BATCH_FUND_NOT_NOW;
}
