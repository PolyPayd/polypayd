"use client";

import { FadeIn } from "@/components/impact/FadeIn";
import { formatImpactMoney, impactReferenceLabel, type ImpactFeedItem } from "@/lib/impact";

type Props = {
  items: ImpactFeedItem[];
  currency: string;
};

export function ImpactFeed({ items, currency }: Props) {
  // Exactly two full rows should be visible before scrolling starts.
  // We make the math explicit so the UI doesn't rely on "guessing".
  const ITEM_HEIGHT_PX = 64;
  const FEED_VIEWPORT_HEIGHT_PX = 2 * ITEM_HEIGHT_PX + 1;
  const hasMore = items.length > 2;

  return (
    <FadeIn delayMs={120}>
      <div className="flex flex-col rounded-2xl border border-white/[0.05] bg-[#121821] p-6 sm:p-7">
        <h2 className="text-base font-semibold text-[#F9FAFB]">Live impact feed</h2>
        <p className="mt-1 text-xs text-[#6B7280]">Recent allocations to the impact pool</p>

        <div className="relative mt-6">
          <ul
            className="flex flex-col overflow-y-auto pr-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-track]:bg-transparent"
            style={{ height: `${FEED_VIEWPORT_HEIGHT_PX}px` }}
          >
            {items.length === 0 ? (
              <li className="flex h-full items-center justify-center py-8 text-center text-sm text-[#6B7280]">
                No contributions yet. Impact allocations appear here when payouts run with a platform fee.
              </li>
            ) : (
              items.map((row, idx) => (
                <li
                  key={row.id}
                  className={`flex h-[64px] items-center justify-between gap-3 px-1 transition-colors hover:bg-white/[0.02] ${
                    idx > 0 ? "border-t border-white/[0.04]" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium leading-tight text-[#F9FAFB]">
                      {impactReferenceLabel(row.referenceType)}
                    </div>
                    <div className="text-xs leading-tight text-[#6B7280]">
                      {row.createdAt ? new Date(row.createdAt).toLocaleString("en-GB") : "—"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular-nums leading-tight text-[#22C55E]">
                      +{formatImpactMoney(row.amount, row.currency || currency)}
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>

          {hasMore && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#121821] to-transparent"
            />
          )}
        </div>
      </div>
    </FadeIn>
  );
}
