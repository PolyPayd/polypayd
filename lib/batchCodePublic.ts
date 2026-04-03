/**
 * Branded batch codes (PPD-) vs legacy storage (JOIN-).
 * DB may still hold JOIN-* for older batches; lookups accept both prefixes for the same suffix.
 */

export const BATCH_CODE_PUBLIC_PREFIX = "PPD-";
export const BATCH_CODE_LEGACY_PREFIX = "JOIN-";

/** User-facing code: always PPD- for claimable batches that use the standard prefixes. */
export function formatBatchCodeForDisplay(stored: string | null | undefined): string {
  if (stored == null || String(stored).trim() === "") return "—";
  const u = String(stored).trim().toUpperCase().replace(/\s+/g, "-");
  if (u.startsWith(BATCH_CODE_LEGACY_PREFIX)) {
    return `${BATCH_CODE_PUBLIC_PREFIX}${u.slice(BATCH_CODE_LEGACY_PREFIX.length)}`;
  }
  return u;
}

/** Branded code for URLs/query params; empty when there is no code. */
export function toPublicBatchCode(stored: string | null | undefined): string {
  if (stored == null || String(stored).trim() === "") return "";
  return formatBatchCodeForDisplay(stored);
}

/**
 * DB lookup keys for a normalized code from URL or user input.
 * Maps PPD-ABC ↔ JOIN-ABC so either link works for legacy rows.
 */
export function batchCodesForLookup(normalizedUpper: string): string[] {
  const u = normalizedUpper.trim().toUpperCase().replace(/\s+/g, "-");
  if (!u) return [];
  if (u.startsWith(BATCH_CODE_PUBLIC_PREFIX)) {
    const suffix = u.slice(BATCH_CODE_PUBLIC_PREFIX.length);
    if (!suffix) return [u];
    return [`${BATCH_CODE_PUBLIC_PREFIX}${suffix}`, `${BATCH_CODE_LEGACY_PREFIX}${suffix}`];
  }
  if (u.startsWith(BATCH_CODE_LEGACY_PREFIX)) {
    const suffix = u.slice(BATCH_CODE_LEGACY_PREFIX.length);
    if (!suffix) return [u];
    return [`${BATCH_CODE_LEGACY_PREFIX}${suffix}`, `${BATCH_CODE_PUBLIC_PREFIX}${suffix}`];
  }
  return [u];
}

/** Path under the app router for joining via claim link (display code in segment). */
export function claimJoinAppPath(displayBatchCode: string): string {
  const d = displayBatchCode.trim();
  if (!d || d === "—") return "/app/join-batch";
  return `/app/claim/${encodeURIComponent(d)}`;
}
