"use client";

import { CountUpNumber } from "@/components/impact/CountUpNumber";
import { FadeIn } from "@/components/impact/FadeIn";
import { formatImpactMoney } from "@/lib/impact";

type Props = {
  totalAllTime: number;
  totalThisMonth: number;
  livesEstimate: number;
  currency: string;
};

export function ImpactHero({ totalAllTime, totalThisMonth, livesEstimate, currency }: Props) {
  const fmt = (n: number) => formatImpactMoney(n, currency);

  return (
    <FadeIn>
      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/15 bg-gradient-to-br from-emerald-950/35 via-[#0B0F14] to-[#0B0F14] p-8 sm:p-10 shadow-[0_0_60px_-12px_rgba(16,185,129,0.2)]">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 left-1/4 h-48 w-48 rounded-full bg-teal-500/5 blur-3xl" />

        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400/90">PolyPayd Impact</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#F9FAFB] sm:text-4xl">Funding what matters</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#9CA3AF]">
          Part of every platform fee on payouts you send supports programmes for youth empowerment and financial
          inclusion.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-8 sm:divide-x sm:divide-white/[0.06]">
          <div className="sm:pr-8">
            <div className="text-xs font-medium text-[#6B7280]">Your total impact</div>
            <div className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-[#F9FAFB] sm:text-4xl">
              <CountUpNumber value={totalAllTime} format={fmt} />
            </div>
          </div>
          <div className="sm:px-8">
            <div className="text-xs font-medium text-[#6B7280]">This month</div>
            <div className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-emerald-200 sm:text-4xl">
              <CountUpNumber value={totalThisMonth} format={fmt} />
            </div>
          </div>
          <div className="sm:pl-8">
            <div className="text-xs font-medium text-[#6B7280]">Estimated lives impacted</div>
            <div className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-teal-200 sm:text-4xl">
              <CountUpNumber
                value={livesEstimate}
                format={(n) => Math.round(n).toLocaleString("en-GB")}
              />
            </div>
          </div>
        </div>
      </div>
    </FadeIn>
  );
}
