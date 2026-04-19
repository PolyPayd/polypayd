"use client";

import { useState } from "react";
import { runBatch } from "./actions";
import { PayoutFeeSummary } from "@/components/monetisation/PayoutFeeSummary";
import { totalPayerDebit } from "@/lib/platformFee";

type Props = { orgId: string; batchId: string; pendingTotal: number; pendingCount: number; disabled?: boolean };

function moneyGBP(n: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);
}

export function RunBatchButton({ orgId, batchId, pendingTotal, pendingCount, disabled = false }: Props) {
  const [loading, setLoading] = useState(false);
  const totalPay = totalPayerDebit(pendingTotal);

  async function handleClick() {
    setLoading(true);
    try {
      await runBatch(batchId, orgId);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex w-full max-w-md flex-col items-end gap-2">
      <PayoutFeeSummary principalGbp={pendingTotal} className="w-full" />
      <button
        type="button"
        onClick={handleClick}
        disabled={loading || disabled}
        className="rounded-lg border border-emerald-800/50 bg-emerald-950/20 px-3 py-2 text-sm font-medium text-emerald-100 hover:border-emerald-700/60 disabled:opacity-50"
      >
        {loading
          ? "Sending…"
          : `Pay ${moneyGBP(totalPay)} and send ${moneyGBP(pendingTotal)} to ${pendingCount} recipient${pendingCount === 1 ? "" : "s"}`}
      </button>
    </div>
  );
}
