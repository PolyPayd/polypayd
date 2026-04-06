import type { ReactNode } from "react";
import { FintechCard } from "@/components/fintech";
import { cn } from "@/lib/cn";

function formatMoney(amount: number, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
}

export type WalletAccountCardProps = {
  /** Account identity (e.g. PolyPayd; future: labelled wallets / business vs personal). */
  accountLabel?: string;
  currency?: string;
  available: number;
  pending: number;
  /** Optional batch-claims sub-line when amount is material. */
  claimsFromBatch?: number;
  actions: ReactNode;
  /** Same card surface — e.g. withdraw flow expanded below actions. */
  footer?: ReactNode;
  className?: string;
};

export function WalletAccountCard({
  accountLabel = "PolyPayd",
  currency = "GBP",
  available,
  pending,
  claimsFromBatch,
  actions,
  footer,
  className,
}: WalletAccountCardProps) {
  return (
    <FintechCard elevated interactive={false} className={cn("mb-6 p-6 sm:p-8", className)}>
      <p className="text-[15px] font-medium text-[#9CA3AF]">{accountLabel}</p>
      <p className="mt-3 text-xs font-medium text-[#6B7280]">Available balance</p>
      <p className="mt-2 text-[2.125rem] font-bold tabular-nums leading-none tracking-tight text-[#F9FAFB] sm:text-[2.75rem]">
        {formatMoney(available, currency)}
      </p>
      {pending > 0.005 ? (
        <p className="mt-4 text-xs leading-relaxed text-[#6B7280]">
          Pending <span className="tabular-nums text-[#9CA3AF]">{formatMoney(pending, currency)}</span>
          <span className="text-[#5C6570]"> · not withdrawable yet</span>
        </p>
      ) : null}
      {typeof claimsFromBatch === "number" && claimsFromBatch > 0.005 ? (
        <p className="mt-3 text-[11px] leading-relaxed text-[#5C6570]">
          Includes {formatMoney(claimsFromBatch, currency)} from batch claims.
        </p>
      ) : null}

      <div className="mt-7 flex w-full flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-3">{actions}</div>

      {footer}
    </FintechCard>
  );
}
