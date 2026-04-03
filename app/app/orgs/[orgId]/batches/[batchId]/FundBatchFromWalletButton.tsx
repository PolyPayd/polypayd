"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PayoutFeeSummary } from "@/components/monetisation/PayoutFeeSummary";
import { formatImpactMoney } from "@/lib/impact";

type Props = { orgId: string; batchId: string; poolTotalGbp: number };

/**
 * Reserves batch principal on the platform system wallet and marks each recipient claimable (claim links).
 * Replaces legacy one-shot Send for claimable batches.
 */
export function FundBatchFromWalletButton({ orgId, batchId, poolTotalGbp }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFund() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/batches/${batchId}/fund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId }),
      });
      const data = (await res.json()) as {
        error?: string;
        ok?: boolean;
        alreadyFunded?: boolean;
        impactAmountGbp?: number;
        platformFeeGbp?: number;
      };
      if (!res.ok) {
        setError(data.error ?? "Fund failed");
        return;
      }
      if (data.alreadyFunded) {
        toast.info("Batch already funded", { id: `fund-batch-${batchId}` });
      } else {
        const ic = data.impactAmountGbp ?? 0;
        const pf = data.platformFeeGbp;
        if (ic > 0) {
          const feeLine = pf != null && pf > 0 ? `Platform fee ${formatImpactMoney(pf)}. ` : "";
          toast.success("Batch funded", {
            id: `impact-fund-${batchId}`,
            description: `${feeLine}${formatImpactMoney(ic)} contributed to impact.`,
            duration: 7000,
          });
        } else {
          toast.success("Batch funded", {
            id: `fund-batch-${batchId}`,
            description:
              pf != null && pf > 0
                ? `Platform fee ${formatImpactMoney(pf)}. Recipients can claim into their wallets.`
                : "Recipients can claim into their PolyPayd wallets.",
            duration: 6000,
          });
        }
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fund failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex max-w-md flex-col gap-2">
      <PayoutFeeSummary principalGbp={poolTotalGbp} className="w-full" />
      <button
        type="button"
        disabled={pending}
        onClick={onFund}
        className="rounded-lg border border-emerald-700/60 bg-emerald-950/30 px-3 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-900/40 disabled:opacity-50"
      >
        {pending ? "Funding…" : "Fund batch from wallet"}
      </button>
      <p className="text-xs text-neutral-500">
        Debits your wallet, reserves the pool for recipients. Each recipient claims via a private link (no Stripe until
        they withdraw).
      </p>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
