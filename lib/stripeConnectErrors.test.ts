import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { isInvalidConnectAccountForPlatformError } from "@/lib/stripeConnectErrors";

describe("isInvalidConnectAccountForPlatformError", () => {
  it("matches Connect / account link error copy", () => {
    const err = new Stripe.errors.StripeInvalidRequestError({
      type: "invalid_request_error",
      message:
        "The account acct_xxx requested an account link for an account that is not connected to your platform or does not exist.",
    });
    expect(isInvalidConnectAccountForPlatformError(err)).toBe(true);
  });

  it("matches resource_missing", () => {
    const err = new Stripe.errors.StripeInvalidRequestError({
      type: "invalid_request_error",
      message: "No such account: acct_xxx",
      code: "resource_missing",
    });
    expect(isInvalidConnectAccountForPlatformError(err)).toBe(true);
  });

  it("ignores unrelated invalid request errors", () => {
    const err = new Stripe.errors.StripeInvalidRequestError({
      type: "invalid_request_error",
      message: "Amount must be at least 50.",
    });
    expect(isInvalidConnectAccountForPlatformError(err)).toBe(false);
  });
});
