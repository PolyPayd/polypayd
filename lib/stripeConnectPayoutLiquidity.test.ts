import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { planConnectWalletPayout } from "./stripeConnectPayoutLiquidity";

function bal(partial: Partial<Stripe.Balance>): Stripe.Balance {
  return {
    object: "balance",
    livemode: false,
    available: [],
    pending: [],
    ...partial,
  } as Stripe.Balance;
}

describe("planConnectWalletPayout", () => {
  it("uses available when no GBP instant_available row (legacy API shape)", () => {
    const b = bal({
      available: [{ currency: "gbp", amount: 10_000 }],
    });
    const p = planConnectWalletPayout(b, 5_000, true);
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.payoutMethod).toBe("instant");
      expect(p.validatedGbpMinor).toBe(10_000);
    }
  });

  it("uses instant_available when Stripe exposes GBP there (instant payout source)", () => {
    const b = bal({
      available: [{ currency: "gbp", amount: 0 }],
      instant_available: [{ currency: "gbp", amount: 8_000 }],
    });
    const p = planConnectWalletPayout(b, 5_000, true);
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.payoutMethod).toBe("instant");
      expect(p.validatedGbpMinor).toBe(8_000);
    }
  });

  it("falls back to standard when instant GBP insufficient but available covers net", () => {
    const b = bal({
      available: [{ currency: "gbp", amount: 10_000 }],
      instant_available: [{ currency: "gbp", amount: 0 }],
    });
    const p = planConnectWalletPayout(b, 5_000, true);
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.payoutMethod).toBe("standard");
      expect(p.validatedGbpMinor).toBe(10_000);
    }
  });

  it("fails when neither instant nor available covers net", () => {
    const b = bal({
      available: [{ currency: "gbp", amount: 1_000 }],
      instant_available: [{ currency: "gbp", amount: 500 }],
    });
    const p = planConnectWalletPayout(b, 5_000, true);
    expect(p.ok).toBe(false);
  });

  it("standard-only path uses available", () => {
    const b = bal({
      available: [{ currency: "gbp", amount: 3_000 }],
    });
    const p = planConnectWalletPayout(b, 2_000, false);
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.payoutMethod).toBe("standard");
  });
});
