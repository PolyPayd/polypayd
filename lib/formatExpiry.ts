/**
 * Format claimable batch expiry for display.
 * Uses the expiry timestamp so relative time is correct in any timezone.
 */

export function formatExpiryDateTime(expiresAt: string | null | undefined): string {
  if (!expiresAt) return "—";
  const d = new Date(expiresAt);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Returns human-friendly relative time until expiry, or "Expired" if past.
 */
export function formatExpiryTimeLeft(expiresAt: string | null | undefined): string {
  if (!expiresAt) return "";
  const end = new Date(expiresAt).getTime();
  const now = Date.now();
  const ms = end - now;
  if (ms <= 0) return "Expired";
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(ms / 86_400_000);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""} left`;
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} left`;
  const remainderHours = Math.floor((ms % 86_400_000) / 3_600_000);
  if (days === 1) {
    return remainderHours === 0
      ? "1 day left"
      : `1 day ${remainderHours} hour${remainderHours !== 1 ? "s" : ""} left`;
  }
  return remainderHours === 0
    ? `${days} days left`
    : `${days} days ${remainderHours} hour${remainderHours !== 1 ? "s" : ""} left`;
}
