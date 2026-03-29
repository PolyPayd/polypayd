import "server-only";

/**
 * Stripe AccountLink requires absolute refresh/return URLs. Prefer env in production.
 */
export function getStripeConnectRedirectUrls(req: Request) {
  const refresh = process.env.STRIPE_CONNECT_REFRESH_URL?.trim();
  const returnUrl = process.env.STRIPE_CONNECT_RETURN_URL?.trim();
  if (refresh && returnUrl) {
    return { refreshUrl: refresh, returnUrl: returnUrl };
  }
  const origin = new URL(req.url).origin;
  return { refreshUrl: `${origin}/app`, returnUrl: `${origin}/app` };
}

const IDEMPOTENCY_MAX = 120;

export function normalizeIdempotencyKey(raw: unknown, fallback: () => string): string {
  if (typeof raw !== "string") return fallback();
  const trimmed = raw.trim().slice(0, IDEMPOTENCY_MAX);
  if (!trimmed || trimmed.length < 8) return fallback();
  return trimmed;
}
