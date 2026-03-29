/**
 * Platform fee on payouts (basis points). Must match `c_platform_fee_bps` in DB RPCs.
 */
export const PLATFORM_FEE_BPS = 150;

/**
 * Historical constant; fee is bps-only in DB (no £1 floor). Kept for imports that expect this export.
 */
export const MIN_PLATFORM_FEE = 0;

/** Human-readable fee percent, e.g. 150 -> "1.5%", 100 -> "1%" */
export function formatFeePercentLabel(bps: number): string {
  if (bps % 100 === 0) return `${bps / 100}%`;
  return `${(bps / 100).toFixed(1)}%`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Matches DB: round(principal * fee_bps / 10000, 2) */
export function platformFeeFromPrincipal(principal: number, feeBps: number = PLATFORM_FEE_BPS): number {
  const p = Number(principal);
  const bps = Number(feeBps);
  if (!Number.isFinite(p) || p < 0 || !Number.isFinite(bps) || bps <= 0) return 0;

  const principalRounded = round2(p);
  const calculatedFee = round2((principalRounded * bps) / 10000);
  return calculatedFee;
}

export function totalPayerDebit(principal: number, feeBps: number = PLATFORM_FEE_BPS): number {
  const p = round2(Number(principal));
  const fee = platformFeeFromPrincipal(p, feeBps);
  return round2(p + fee);
}
