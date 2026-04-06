"use client";

import { useMemo, useState } from "react";
import type { WalletRecentTransactionRow } from "@/lib/walletRecentTransactions";
import { WalletActivityList } from "@/components/wallet/WalletActivityList";

const PREVIEW_COUNT = 5;

type Props = {
  rows: WalletRecentTransactionRow[];
  currency?: string;
};

export function WalletActivityExpandable({ rows, currency = "GBP" }: Props) {
  const [expanded, setExpanded] = useState(false);

  const visibleRows = useMemo(
    () => (expanded ? rows : rows.slice(0, PREVIEW_COUNT)),
    [expanded, rows]
  );

  const canToggle = rows.length > PREVIEW_COUNT;

  return (
    <>
      <WalletActivityList rows={visibleRows} currency={currency} className="mt-6" />
      {canToggle ? (
        <div className="mt-1 border-t border-white/[0.04] pt-4">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-sm font-medium text-[#3B82F6] transition-colors hover:text-[#60A5FA]"
          >
            {expanded ? "Show less" : "See all"}
          </button>
        </div>
      ) : null}
    </>
  );
}
