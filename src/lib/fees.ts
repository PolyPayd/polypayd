// Fee calculation — all arithmetic in pence (integers), no floating point.
//
// Formula: £1 flat + 1% of total + £0.30 per recipient. Minimum £2.00.
//
// Worked examples:
//   £30  / 3  recipients → fee  220p, total  3220p
//   £100 / 5  recipients → fee  350p, total 10350p
//   £500 / 10 recipients → fee  900p, total 50900p

const FLAT_FEE_PENCE = 100;          // £1.00
const PERCENT_NUMERATOR = 1;         // 1%
const PER_RECIPIENT_PENCE = 30;      // £0.30
const MINIMUM_FEE_PENCE = 200;       // £2.00

export function calculateFee(
  totalAmountPence: number,
  recipientCount: number
): number {
  const raw =
    FLAT_FEE_PENCE +
    Math.floor((totalAmountPence * PERCENT_NUMERATOR) / 100) +
    PER_RECIPIENT_PENCE * recipientCount;

  return Math.max(raw, MINIMUM_FEE_PENCE);
}

export function calculateTotalCharge(
  totalAmountPence: number,
  recipientCount: number
): number {
  return totalAmountPence + calculateFee(totalAmountPence, recipientCount);
}
