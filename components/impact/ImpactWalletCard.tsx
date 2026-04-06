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
};

export function ImpactWalletCard({ userImpactTotal, currency, schemaReady }: Props) {
  return (
    <FadeIn>
      <FintechCard className="h-full">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Your impact</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-[#F9FAFB]">
              {schemaReady ? (
                <CountUpNumber value={userImpactTotal} format={(n) => formatImpactMoney(n, currency)} />
              ) : (
                formatImpactMoney(0, currency)
              )}
            </p>
            {!schemaReady && (
              <p className="mt-1 text-xs text-[#F59E0B]">Impact schema not deployed — showing £0.00</p>
            )}
          </div>
          <Link
            href="/app/impact"
            className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-[#161F2B] px-4 text-xs font-semibold text-[#F9FAFB] transition-colors hover:border-white/[0.12] hover:bg-[#1a2433]"
          >
            View impact
          </Link>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-[#6B7280]">
          Part of platform fees supports youth programmes. Totals reflect payouts funded from this wallet.
        </p>
      </FintechCard>
    </FadeIn>
  );
}
