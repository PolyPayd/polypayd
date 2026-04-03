/**
 * Public site origin for shareable links (claim URLs, etc.).
 *
 * Set in production: NEXT_PUBLIC_APP_URL=https://polypayd.co.uk
 * Staging: NEXT_PUBLIC_APP_URL=https://your-staging-host (or rely on VERCEL_URL).
 *
 * Falls back to VERCEL_URL on Vercel when unset. Returns "" if unknown (client may use window.location.origin).
 */
export function getPublicSiteUrl(): string {
  const explicit =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//i, "");
    return `https://${host}`;
  }
  return "";
}
