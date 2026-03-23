"use client";

import Link from "next/link";
import { CountUpNumber } from "./CountUpNumber";
import { FadeIn } from "./FadeIn";
import { formatImpactMoney } from "@/lib/impact";

type Props = {
  userImpactTotal: number;
  currency: string;
  schemaReady: boolean;
};

export function ImpactWalletCard({ userImpactTotal, currency, schemaReady }: Props) {
  return (
    <FadeIn>
      <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/25 to-neutral-900/50 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400/90">Your impact</p>
            <p className="mt-1 text-2xl font-semibold text-white">
              {schemaReady ? (
                <CountUpNumber value={userImpactTotal} format={(n) => formatImpactMoney(n, currency)} />
              ) : (
                formatImpactMoney(0, currency)
              )}
            </p>
            {!schemaReady && (
              <p className="mt-1 text-[11px] text-amber-200/80">Impact schema not deployed - showing £0.00</p>
            )}
          </div>
          <Link
            href="/app/impact"
            className="shrink-0 rounded-lg border border-neutral-700 bg-neutral-950/60 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:border-emerald-500/40 hover:text-white"
          >
            View Impact
          </Link>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-neutral-500">
          When you send payouts, part of the platform fee is allocated to youth empowerment programmes. Your total
          reflects batches funded from this wallet.
        </p>
      </div>
    </FadeIn>
  );
}
