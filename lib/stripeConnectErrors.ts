import Stripe from "stripe";

/**
 * True when Stripe indicates this acct_ id is not usable with the current secret key’s platform.
 */
export function isInvalidConnectAccountForPlatformError(error: unknown): boolean {
  if (error instanceof Stripe.errors.StripeInvalidRequestError) {
    if (error.code === "resource_missing") return true;
    const m = (error.message || "").toLowerCase();
    if (m.includes("not connected to your platform")) return true;
    if (m.includes("does not exist")) return true;
    if (m.includes("no such account")) return true;
    return false;
  }
  if (error instanceof Stripe.errors.StripeError) {
    const m = (error.message || "").toLowerCase();
    if (m.includes("no such account")) return true;
  }
  return false;
}
