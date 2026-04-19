/**
 * Authoritative pricing for wallet top-ups, payouts, and withdrawals.
 * All amounts are integer minor units (pence for GBP) unless noted.
 */

/** Must match DB `c_platform_fee_bps` (150 = 1.5%). */
export const PAYOUT_PLATFORM_FEE_BPS = 150;

/**
 * Processing uplift on wallet top-ups (pass-through to cover card/Stripe costs).
 * 300 bps ⇒ £10.00 credit → £0.30 fee → £10.30 charged.
 */
export const TOPUP_PROCESSING_FEE_BPS = 300;

/** Withdrawal fee rate: 1% of gross, rounded half-up to whole pence. */
export const WITHDRAWAL_FEE_BPS = 100;

/** Minimum withdrawal fee in minor units (£0.30). Applied when 1% is lower. */
export const WITHDRAWAL_FEE_MIN_MINOR = 30;

export type TopupChargeBreakdown = {
  walletCreditMinor: number;
  /** @deprecated Use {@link stripeCostEstimateMinor}, this is the Stripe/card cost uplift only, not platform revenue. */
  processingFeeMinor: number;
  /** PolyPayd platform revenue on top-up (currently zero; batch fees are separate). */
  platformFeeMinor: number;
  /** Estimated pass-through to cover Stripe/card costs (Connect `application_fee_amount`). */
  stripeCostEstimateMinor: number;
  totalChargeMinor: number;
};

export type PayoutPricingMinor = {
  payoutAmountMinor: number;
  feeMinor: number;
  totalDebitMinor: number;
};

export type WithdrawalFeeMode = "charged_separately" | "deducted_from_withdrawal";

/**
 * Resolved withdrawal: fee may be taken on top of available balance (user receives full requested)
 * or from the withdrawal when available < requested + fee.
 */
export type WithdrawalPricingResolved = {
  /** Amount the user asked to withdraw (to their bank when fee is charged separately). */
  withdrawalAmountMinor: number;
  feeMinor: number;
  /** Amount sent to Stripe / bank. */
  netPayoutMinor: number;
  /** Total removed from wallet (requested + fee, or requested when fee is deducted from amount). */
  totalWalletDebitMinor: number;
  /** True when fee reduces the bank payout; false when fee is charged in addition to requested. */
  feeDeductedFromWithdrawal: boolean;
  feeMode: WithdrawalFeeMode;
};

function assertNonNegativeInt(n: number, name: string): void {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${name} must be a non-negative integer (minor units)`);
  }
}

/** Integer half-up: (a*b + c/2) / c for positive integers */
function mulDivHalfUp(a: number, b: number, divisor: number): number {
  return Math.floor((a * b + Math.floor(divisor / 2)) / divisor);
}

/**
 * User-entered wallet credit → Stripe charge breakdown.
 * Fee = round half-up(walletCreditMinor * TOPUP_PROCESSING_FEE_BPS / 10000).
 */
export function calculateTopupChargeFromWalletCredit(walletCreditMinor: number): TopupChargeBreakdown {
  assertNonNegativeInt(walletCreditMinor, "walletCreditMinor");
  if (walletCreditMinor < 100) {
    throw new Error("walletCreditMinor must be at least 100 (minimum £1.00)");
  }
  const stripeCostEstimateMinor = mulDivHalfUp(walletCreditMinor, TOPUP_PROCESSING_FEE_BPS, 10_000);
  const platformFeeMinor = 0;
  const totalChargeMinor = walletCreditMinor + stripeCostEstimateMinor;
  return {
    walletCreditMinor,
    processingFeeMinor: stripeCostEstimateMinor,
    stripeCostEstimateMinor,
    platformFeeMinor,
    totalChargeMinor,
  };
}

/** 1.5% of payout, rounded half-up to whole pence; total debit = payout + fee. */
export function calculatePayoutPricing(payoutAmountMinor: number): PayoutPricingMinor {
  assertNonNegativeInt(payoutAmountMinor, "payoutAmountMinor");
  if (payoutAmountMinor <= 0) {
    throw new Error("payoutAmountMinor must be positive");
  }
  const feeMinor = mulDivHalfUp(payoutAmountMinor, PAYOUT_PLATFORM_FEE_BPS, 10_000);
  const totalDebitMinor = payoutAmountMinor + feeMinor;
  return { payoutAmountMinor, feeMinor, totalDebitMinor };
}

/** Wallet `current_balance` (decimal GBP) → integer pence (authoritative comparisons with requested minor). */
export function gbpToMinor(gbp: number): number {
  return Math.round(Number(gbp) * 100);
}

export function formatMinorAsGbp(minor: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(minor / 100);
}

/** Fee only: max(1% half-up, £0.30). */
export function calculateWithdrawalFeeMinor(withdrawalRequestedMinor: number): number {
  assertNonNegativeInt(withdrawalRequestedMinor, "withdrawalRequestedMinor");
  if (withdrawalRequestedMinor < 100) {
    throw new Error("withdrawalRequestedMinor must be at least 100 (£1.00 minimum)");
  }
  const percentFeeMinor = mulDivHalfUp(withdrawalRequestedMinor, WITHDRAWAL_FEE_BPS, 10_000);
  return Math.max(percentFeeMinor, WITHDRAWAL_FEE_MIN_MINOR);
}

/**
 * If available ≥ requested + fee: user receives the full requested amount; wallet debits requested + fee.
 * Else if available ≥ requested: fee is taken from the withdrawal; wallet debits requested; bank gets requested − fee.
 */
export function resolveWithdrawalPricing(
  withdrawalRequestedMinor: number,
  availableBalanceMinor: number
): WithdrawalPricingResolved {
  assertNonNegativeInt(withdrawalRequestedMinor, "withdrawalRequestedMinor");
  assertNonNegativeInt(availableBalanceMinor, "availableBalanceMinor");

  if (withdrawalRequestedMinor < 100) {
    throw new Error("Withdrawal amount must be at least £1.00");
  }

  if (availableBalanceMinor < withdrawalRequestedMinor) {
    throw new Error(
      "Insufficient available balance. Withdrawals use available funds only; pending top-ups must clear first."
    );
  }

  const feeMinor = calculateWithdrawalFeeMinor(withdrawalRequestedMinor);
  const W = withdrawalRequestedMinor;

  if (availableBalanceMinor >= W + feeMinor) {
    return {
      withdrawalAmountMinor: W,
      feeMinor,
      netPayoutMinor: W,
      totalWalletDebitMinor: W + feeMinor,
      feeDeductedFromWithdrawal: false,
      feeMode: "charged_separately",
    };
  }

  if (W <= feeMinor) {
    throw new Error("Withdrawal amount must exceed the fee so the amount you receive is positive");
  }

  return {
    withdrawalAmountMinor: W,
    feeMinor,
    netPayoutMinor: W - feeMinor,
    totalWalletDebitMinor: W,
    feeDeductedFromWithdrawal: true,
    feeMode: "deducted_from_withdrawal",
  };
}

/**
 * Same as {@link resolveWithdrawalPricing} but converts wallet `current_balance` (decimal GBP) here so
 * API routes only import this, avoids rare bundler/runtime issues with a separate `gbpToMinor` import.
 */
export function resolveWithdrawalPricingFromWalletGbp(
  withdrawalRequestedMinor: number,
  walletCurrentBalanceGbp: number
): WithdrawalPricingResolved {
  return resolveWithdrawalPricing(withdrawalRequestedMinor, gbpToMinor(walletCurrentBalanceGbp));
}

export type WithdrawalAmountInputEvaluation =
  | { variant: "empty" }
  | { variant: "invalid"; message: string; hint?: string }
  | { variant: "ready"; pricing: WithdrawalPricingResolved };

/**
 * Live form validation: same rules as {@link resolveWithdrawalPricing} (and the withdrawal API).
 * Use for inline UX; server remains authoritative.
 */
export function evaluateWithdrawalAmountInput(
  rawAmount: string,
  availableBalanceGbp: number
): WithdrawalAmountInputEvaluation {
  const s = rawAmount.trim();
  if (s === "") {
    return { variant: "empty" };
  }

  const num = parseFloat(s);
  if (Number.isNaN(num) || !Number.isFinite(num)) {
    return { variant: "invalid", message: "Enter a valid amount." };
  }
  if (num < 1) {
    return { variant: "invalid", message: "Minimum withdrawal is £1.00." };
  }
  if (num > 100_000) {
    return { variant: "invalid", message: "Maximum withdrawal is £100,000.00 per request." };
  }

  const requestedMinor = Math.round(num * 100);
  if (requestedMinor < 100) {
    return { variant: "invalid", message: "Minimum withdrawal is £1.00." };
  }

  const availableMinor = gbpToMinor(availableBalanceGbp);

  if (requestedMinor > availableMinor) {
    return {
      variant: "invalid",
      message: "Insufficient available balance for this withdrawal.",
      hint: `Available ${formatMinorAsGbp(availableMinor)}. Maximum withdrawal ${formatMinorAsGbp(availableMinor)}.`,
    };
  }

  let feeMinor: number;
  try {
    feeMinor = calculateWithdrawalFeeMinor(requestedMinor);
  } catch {
    return { variant: "invalid", message: "Invalid withdrawal amount." };
  }

  if (requestedMinor <= feeMinor) {
    return {
      variant: "invalid",
      message: "This amount is too small after the withdrawal fee.",
      hint: `The fee for this withdrawal is ${formatMinorAsGbp(feeMinor)}. Enter a larger amount.`,
    };
  }

  return { variant: "ready", pricing: resolveWithdrawalPricing(requestedMinor, availableMinor) };
}
