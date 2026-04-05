import type Stripe from "stripe";
import { sumGbpAvailableMinor, sumGbpInstantAvailableMinor } from "@/lib/stripeGbpBalanceSums";

export type ConnectPayoutLiquidityPlan =
  | {
      ok: true;
      payoutMethod: "instant" | "standard";
      /** Balance slice used for the >= netPayoutMinor check */
      validatedGbpMinor: number;
      availableGbpMinor: number;
      instantAvailableGbpMinor: number;
    }
  | {
      ok: false;
      availableGbpMinor: number;
      instantAvailableGbpMinor: number;
      requiredNetMinor: number;
    };

/**
 * Stripe Connect: `payouts.create` with `method: "instant"` debits {@link Stripe.Balance.instant_available}
 * for GBP when that bucket is present. Using only `available` for the pre-check causes false
 * "insufficient" errors (or instant failures) when the two diverge.
 *
 * When instant GBP is not enough but `available` covers the net, we plan `standard` so the bank
 * payout still succeeds on the normal schedule.
 */
export function planConnectWalletPayout(
  balance: Stripe.Balance,
  netPayoutMinor: number,
  preferInstant: boolean
): ConnectPayoutLiquidityPlan {
  const availableGbpMinor = sumGbpAvailableMinor(balance);
  const instantAvailableGbpMinor = sumGbpInstantAvailableMinor(balance);
  const hasGbpInstantRow = Boolean(
    balance.instant_available?.some((r) => (r.currency || "").toLowerCase() === "gbp")
  );

  if (!Number.isFinite(netPayoutMinor) || netPayoutMinor <= 0) {
    return {
      ok: false,
      availableGbpMinor,
      instantAvailableGbpMinor,
      requiredNetMinor: netPayoutMinor,
    };
  }

  if (!preferInstant) {
    if (availableGbpMinor >= netPayoutMinor) {
      return {
        ok: true,
        payoutMethod: "standard",
        validatedGbpMinor: availableGbpMinor,
        availableGbpMinor,
        instantAvailableGbpMinor,
      };
    }
    return {
      ok: false,
      availableGbpMinor,
      instantAvailableGbpMinor,
      requiredNetMinor: netPayoutMinor,
    };
  }

  if (hasGbpInstantRow) {
    if (instantAvailableGbpMinor >= netPayoutMinor) {
      return {
        ok: true,
        payoutMethod: "instant",
        validatedGbpMinor: instantAvailableGbpMinor,
        availableGbpMinor,
        instantAvailableGbpMinor,
      };
    }
    if (availableGbpMinor >= netPayoutMinor) {
      return {
        ok: true,
        payoutMethod: "standard",
        validatedGbpMinor: availableGbpMinor,
        availableGbpMinor,
        instantAvailableGbpMinor,
      };
    }
    return {
      ok: false,
      availableGbpMinor,
      instantAvailableGbpMinor,
      requiredNetMinor: netPayoutMinor,
    };
  }

  if (availableGbpMinor >= netPayoutMinor) {
    return {
      ok: true,
      payoutMethod: "instant",
      validatedGbpMinor: availableGbpMinor,
      availableGbpMinor,
      instantAvailableGbpMinor,
    };
  }

  return {
    ok: false,
    availableGbpMinor,
    instantAvailableGbpMinor,
    requiredNetMinor: netPayoutMinor,
  };
}
