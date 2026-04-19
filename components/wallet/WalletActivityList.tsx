import { FintechBadge } from "@/components/fintech";
import type {
  WalletRecentStatusVariant,
  WalletRecentTransactionRow,
} from "@/lib/walletRecentTransactions";

function money(amount: number, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
}

function statusTone(v: WalletRecentStatusVariant): "success" | "warning" | "error" | "neutral" | "info" {
  if (v === "pending") return "warning";
  if (v === "available") return "success";
  if (v === "partial") return "info";
  if (v === "failed") return "error";
  return "neutral";
}

type Props = {
  rows: WalletRecentTransactionRow[];
  currency?: string;
  className?: string;
};

export function WalletActivityList({ rows, currency = "GBP", className = "" }: Props) {
  if (rows.length === 0) {
    return (
      <div className={`py-10 text-center ${className}`.trim()}>
        <p className="text-sm font-medium text-[#9CA3AF]">No activity yet</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-[#6B7280]">
          Add funds or receive a payout to see transactions here.
        </p>
      </div>
    );
  }

  return (
    <ul className={`space-y-0 ${className}`.trim()}>
      {rows.map((r, i) => (
        <li
          key={r.id}
          className={`flex flex-wrap items-start justify-between gap-3 py-4 transition-colors hover:bg-white/[0.02] sm:flex-nowrap sm:rounded-lg sm:px-2 sm:-mx-2 ${
            i > 0 ? "border-t border-white/[0.04]" : ""
          }`}
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[#F9FAFB]">{r.typeLabel}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {r.statusLabel && r.statusVariant ? (
                <FintechBadge tone={statusTone(r.statusVariant)}>{r.statusLabel}</FintechBadge>
              ) : null}
              <span className="text-xs text-[#6B7280]">
                {r.date ? new Date(r.date).toLocaleString("en-GB") : "-"}
              </span>
            </div>
          </div>
          <p
            className={`shrink-0 text-base font-semibold tabular-nums ${
              r.entry_type === "credit" ? "text-[#22C55E]" : "text-[#F59E0B]"
            }`}
          >
            {r.entry_type === "credit" ? "+" : "−"}
            {money(r.amount, currency)}
          </p>
        </li>
      ))}
    </ul>
  );
}
