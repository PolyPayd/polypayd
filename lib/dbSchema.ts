/**
 * Detect errors that indicate the claimable payout schema (columns/tables) is not applied.
 * Use to show a clear admin message instead of raw DB errors.
 */
export function isClaimableSchemaError(error: unknown): boolean {
  if (error == null) return false;
  const msg = String((error as { message?: string }).message ?? "").toLowerCase();
  const code = String((error as { code?: string }).code ?? "");
  if (code === "42703") return true;
  if (msg.includes("column") && msg.includes("does not exist")) return true;
  if (msg.includes("relation") && msg.includes("does not exist")) return true;
  if (msg.includes("claim_slots") && (msg.includes("does not exist") || msg.includes("undefined"))) return true;
  if (msg.includes("schema cache") || (msg.includes("could not find") && msg.includes("table"))) return true;
  return false;
}

export const CLAIMABLE_SCHEMA_MESSAGE =
  "Claimable payout schema is not fully applied yet. Please run the latest database migration.";
