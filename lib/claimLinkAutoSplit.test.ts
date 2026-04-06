import { describe, expect, it } from "vitest";
import { claimLinkFloorPerRecipientPounds, claimLinkSlotAmountsPounds } from "./claimLinkAutoSplit";

describe("claimLinkSlotAmountsPounds", () => {
  it("splits £43 across 3 with remainder on first slots", () => {
    const amounts = claimLinkSlotAmountsPounds(43, 3);
    expect(amounts).toEqual([14.34, 14.33, 14.33]);
    const sumCents = amounts.reduce((s, a) => s + Math.round(a * 100), 0);
    expect(sumCents).toBe(4300);
  });

  it("keeps equal split when divisible", () => {
    expect(claimLinkSlotAmountsPounds(300, 100).every((a) => a === 3)).toBe(true);
    expect(claimLinkSlotAmountsPounds(300, 100).length).toBe(100);
  });

  it("matches floor helper for base rate", () => {
    expect(claimLinkFloorPerRecipientPounds(43, 3)).toBe(14.33);
  });
});
