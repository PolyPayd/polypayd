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
  const ITEM_HEIGHT_PX = 64; // fixed height for each feed row (border-box)
  const ROW_GAP_PX = 12; // gap-[12px]
  const FEED_VIEWPORT_HEIGHT_PX = 2 * ITEM_HEIGHT_PX + ROW_GAP_PX + 1; // +1px rounding guard
  const hasMore = items.length > 2;

  return (
    <FadeIn delayMs={120}>
      <div className="flex flex-col rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
        <h2 className="text-sm font-semibold text-white">Live impact feed</h2>
        <p className="mt-1 text-xs text-neutral-500">Recent allocations to the impact pool</p>

        <div className="relative mt-4">
          <ul
            className="flex flex-col gap-[12px] overflow-y-auto pr-1 rounded-xl
                       [scrollbar-width:thin]
                       [&::-webkit-scrollbar]:w-1
                       [&::-webkit-scrollbar-thumb]:bg-neutral-700/60
                       [&::-webkit-scrollbar-track]:bg-neutral-900/20"
            style={{ height: `${FEED_VIEWPORT_HEIGHT_PX}px` }}
          >
            {items.length === 0 ? (
              <li className="flex h-full items-center justify-center rounded-lg border border-dashed border-neutral-800 text-center text-sm text-neutral-500">
                No contributions yet. Impact allocations appear here when payouts run with a platform fee.
              </li>
            ) : (
              items.map((row) => (
                <li
                  key={row.id}
                  className="flex h-[64px] items-center justify-between gap-3 rounded-xl border border-neutral-800/60 bg-neutral-950/40 px-4 py-0 transition-colors hover:border-neutral-700"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white leading-tight">
                      {impactReferenceLabel(row.referenceType)}
                    </div>
                    <div className="text-xs text-neutral-500 leading-tight">
                      {row.createdAt ? new Date(row.createdAt).toLocaleString("en-GB") : "—"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular-nums text-emerald-300 leading-tight">
                      +{formatImpactMoney(row.amount, row.currency || currency)}
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>

          {hasMore && (
            // Subtle bottom fade to hint there is more content below the viewport.
            <div
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 rounded-b-xl bg-gradient-to-t from-neutral-900/90 to-transparent"
            />
          )}
        </div>
      </div>
    </FadeIn>
  );
}
