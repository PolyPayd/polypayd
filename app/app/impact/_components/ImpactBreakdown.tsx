"use client";

import { useEffect, useState } from "react";
import { FadeIn } from "@/components/impact/FadeIn";
import { formatImpactMoney, type ImpactBreakdown as Breakdown } from "@/lib/impact";

type Props = {
  breakdown: Breakdown;
  currency: string;
};

export function ImpactBreakdown({ breakdown, currency }: Props) {
  const sum = breakdown.bulkSend + breakdown.claimLink;
  const total = sum > 0 ? sum : 1;
  const bulkPct = (breakdown.bulkSend / total) * 100;
  const claimPct = (breakdown.claimLink / total) * 100;
  const [wBulk, setWBulk] = useState(0);
  const [wClaim, setWClaim] = useState(0);

  useEffect(() => {
    const t = requestAnimationFrame(() => {
      setWBulk(bulkPct);
      setWClaim(claimPct);
    });
    return () => cancelAnimationFrame(t);
  }, [bulkPct, claimPct]);

  return (
    <FadeIn delayMs={80} className="self-start">
      <div className="flex flex-col rounded-2xl border border-white/[0.05] bg-[#121821] p-6 sm:p-7">
        <h2 className="text-base font-semibold text-[#F9FAFB]">Contribution breakdown</h2>
        <p className="mt-1 text-xs text-[#6B7280]">By payout type (from platform fee allocation)</p>

        <div className="mt-8 space-y-6">
          <div>
            <div className="flex justify-between text-xs text-[#9CA3AF]">
              <span>Bulk Send</span>
              <span className="font-semibold tabular-nums text-[#F9FAFB]">{formatImpactMoney(breakdown.bulkSend, currency)}</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#0B0F14]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-[width] duration-700 ease-out"
                style={{ width: `${wBulk}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs text-[#9CA3AF]">
              <span>Claim Link</span>
              <span className="font-semibold tabular-nums text-[#F9FAFB]">{formatImpactMoney(breakdown.claimLink, currency)}</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#0B0F14]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-teal-700 to-teal-500 transition-[width] duration-700 ease-out"
                style={{ width: `${wClaim}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </FadeIn>
  );
}
