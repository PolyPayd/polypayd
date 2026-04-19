"use client";

import Link from "next/link";
import { CountUpNumber } from "./CountUpNumber";
import { FadeIn } from "./FadeIn";
import { formatImpactMoney } from "@/lib/impact";
import { FintechCard } from "@/components/fintech";

type Props = {
  userImpactTotal: number;
  currency: string;
  schemaReady: boolean;
  /** Omit outer card when nested inside another surface */
  embedded?: boolean;
};

export function ImpactWalletCard({ userImpactTotal, currency, schemaReady, embedded }: Props) {
  const inner = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-[#6B7280]">Your impact</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[#F9FAFB] sm:text-2xl">
            {schemaReady ? (
              <CountUpNumber value={userImpactTotal} format={(n) => formatImpactMoney(n, currency)} />
            ) : (
              formatImpactMoney(0, currency)
            )}
          </p>
          {!schemaReady && (
            <p className="mt-1 text-xs text-[#F59E0B]">Impact schema not deployed, showing £0.00</p>
          )}
        </div>
        <Link
          href="/app/impact"
          className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-[#161F2B]/80 px-3.5 text-xs font-semibold text-[#F9FAFB] transition-colors hover:border-white/[0.1] hover:bg-[#161F2B]"
        >
          View impact
        </Link>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-[#6B7280] sm:text-sm">
        Part of platform fees supports youth programmes. Totals reflect payouts funded from this wallet.
      </p>
    </>
  );

  if (embedded) {
    return <div className="h-full">{inner}</div>;
  }

  return (
    <FadeIn>
      <FintechCard interactive={false} className="h-full">
        {inner}
      </FintechCard>
    </FadeIn>
  );
}
