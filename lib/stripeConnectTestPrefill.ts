import "server-only";
import type Stripe from "stripe";

export function isStripeSecretKeyTestMode(secretKey: string | undefined): boolean {
  return Boolean(secretKey?.startsWith("sk_test_"));
}

/**
 * Test-mode-only Account:create extras. Magic tokens from Stripe’s Connect testing guide:
 * https://docs.stripe.com/connect/testing
 *
 * Do not use with live keys — live onboarding must collect real data from the user.
 */
export function getStripeConnectTestCreatePrefill(opts: {
  individualEmail?: string | null;
}): Stripe.AccountCreateParams {
  return {
    business_type: "individual",
    business_profile: {
      name: "Test seller (dev)",
      url: "https://accessible.stripe.com",
      product_description: "Local development — test Connect onboarding",
      support_phone: "0000000000",
    },
    individual: {
      ...(opts.individualEmail?.trim() ? { email: opts.individualEmail.trim() } : {}),
      first_name: "Jane",
      last_name: "Doe",
      phone: "0000000000",
      dob: { day: 1, month: 1, year: 1901 },
      address: {
        line1: "address_full_match",
        city: "London",
        postal_code: "SW1A 1AA",
        country: "GB",
      },
      id_number: "000000000",
    },
  };
}
