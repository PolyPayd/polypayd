"use client";

import {
  PLATFORM_FEE_BPS,
  MIN_PLATFORM_FEE,
  formatFeePercentLabel,
  platformFeeFromPrincipal,
  totalPayerDebit,
} from "@/lib/platformFee";
import { formatImpactMoney, impactAmountFromPlatformFee } from "@/lib/impact";

type Props = {
  /** Principal paid to recipients (excludes platform fee) */
  principalGbp: number;
  currency?: string;
  className?: string;
};

export function PayoutFeeSummary({ principalGbp, currency = "GBP", className = "" }: Props) {
  const principal = Number(principalGbp);
  if (!Number.isFinite(principal) || principal < 0) return null;

  const fee = platformFeeFromPrincipal(principal, PLATFORM_FEE_BPS);
  const totalPay = totalPayerDebit(principal, PLATFORM_FEE_BPS);
  const impact = impactAmountFromPlatformFee(fee);

  const fmt = (n: number) => formatImpactMoney(n, currency);

  return (
    <div
      className={`rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 py-3 text-xs text-neutral-400 ${className}`}
    >
      <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-6">
        <div>
          <span className="text-neutral-500">Platform fee ({formatFeePercentLabel(PLATFORM_FEE_BPS)}, min £{MIN_PLATFORM_FEE.toFixed(2)}): </span>
          <span className="ml-1 font-medium text-neutral-100">{fmt(fee)}</span>
        </div>
        <div>
          <span className="text-neutral-500">Recipients receive </span>
          <span className="font-medium text-white">{fmt(principal)}</span>
        </div>
        <div>
          <span className="text-neutral-500">Total you pay: </span>
          <span className="font-semibold text-white">{fmt(totalPay)}</span>
        </div>
      </div>
      <div className="mt-2 border-t border-neutral-800/80 pt-2 text-emerald-400/90">
        Est. impact: <span className="font-medium text-emerald-300">{fmt(impact)}</span> contributed to youth programmes
      </div>
    </div>
  );
}
