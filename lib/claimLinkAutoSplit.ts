/**
 * Claim Link pool split: largest-remainder in whole pence so amounts sum to the pool exactly.
 * Equivalent to: base = floor((total/n)*100)/100 in pounds, then distribute spare pence to the first recipients.
 */
export function claimLinkSlotAmountsPounds(totalPounds: number, recipientCount: number): number[] {
  if (!Number.isFinite(totalPounds) || totalPounds <= 0) {
    throw new Error("Total must be a positive number.");
  }
  if (!Number.isInteger(recipientCount) || recipientCount < 1) {
    throw new Error("Recipient count must be at least 1.");
  }

  const totalCents = Math.round(totalPounds * 100);
  if (totalCents < 1) {
    throw new Error("Total amount is too small.");
  }

  const baseCents = Math.floor(totalCents / recipientCount);
  const remainderCents = totalCents - baseCents * recipientCount;

  const out: number[] = [];
  for (let i = 0; i < recipientCount; i++) {
    const cents = baseCents + (i < remainderCents ? 1 : 0);
    out.push(cents / 100);
  }
  return out;
}

/** Display / batch.amount_per_claim helper: per-person floor before remainder distribution. */
export function claimLinkFloorPerRecipientPounds(totalPounds: number, recipientCount: number): number {
  return Math.floor((totalPounds / recipientCount) * 100) / 100;
}
