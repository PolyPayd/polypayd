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
      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/40 via-neutral-900/80 to-neutral-950 p-8 shadow-[0_0_60px_-12px_rgba(16,185,129,0.25)]">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 left-1/4 h-48 w-48 rounded-full bg-teal-500/5 blur-3xl" />

        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400/90">PolyPayd Impact</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Funding what matters</h1>
        <p className="mt-2 max-w-xl text-sm text-neutral-400">
          Part of every platform fee on payouts you send supports programmes for youth empowerment and financial
          inclusion.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/50 p-5 backdrop-blur-sm">
            <div className="text-xs font-medium text-neutral-500">Your total impact</div>
            <div className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
              <CountUpNumber value={totalAllTime} format={fmt} />
            </div>
          </div>
          <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/50 p-5 backdrop-blur-sm">
            <div className="text-xs font-medium text-neutral-500">Your impact this month</div>
            <div className="mt-2 text-2xl font-semibold text-emerald-200 sm:text-3xl">
              <CountUpNumber value={totalThisMonth} format={fmt} />
            </div>
          </div>
          <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/50 p-5 backdrop-blur-sm">
            <div className="text-xs font-medium text-neutral-500">Estimated lives impacted</div>
            <div className="mt-2 text-2xl font-semibold text-teal-200 sm:text-3xl">
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
