"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PayoutFeeSummary } from "@/components/monetisation/PayoutFeeSummary";
import { BATCH_FUND_TRY_AGAIN, sanitizeFundBatchErrorForUser } from "@/lib/batchFundUserFacing";
import { formatImpactMoney } from "@/lib/impact";

type Props = {
  orgId: string;
  batchId: string;
  poolTotalGbp: number;
  /** When false, the button stays visible but does not submit. */
  fundEnabled: boolean;
  /** Plain-language reason the action is blocked (shown when !fundEnabled). */
  fundBlockedReason?: string | null;
};

/**
 * Reserves batch principal on the platform system wallet and marks each recipient claimable (claim links).
 * Replaces legacy one-shot Send for claimable batches.
 */
export function FundBatchFromWalletButton({
  orgId,
  batchId,
  poolTotalGbp,
  fundEnabled,
  fundBlockedReason,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFund() {
    if (!fundEnabled || pending) return;
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/batches/${batchId}/fund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId }),
      });

      let data: {
        error?: string;
        ok?: boolean;
        alreadyFunded?: boolean;
        impactAmountGbp?: number;
        platformFeeGbp?: number;
      } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        setError(BATCH_FUND_TRY_AGAIN);
        return;
      }

      if (!res.ok) {
        setError(sanitizeFundBatchErrorForUser(data.error));
        return;
      }

      if (data.alreadyFunded) {
        toast.info("Pool is already live for claims", { id: `fund-batch-${batchId}` });
      } else {
        const ic = data.impactAmountGbp ?? 0;
        const pf = data.platformFeeGbp;
        if (ic > 0) {
          const feeLine = pf != null && pf > 0 ? `Platform fee ${formatImpactMoney(pf)}. ` : "";
          toast.success("Recipients can now claim", {
            id: `impact-fund-${batchId}`,
            description: `${feeLine}${formatImpactMoney(ic)} contributed to impact.`,
            duration: 7000,
          });
        } else {
          toast.success("Recipients can now claim", {
            id: `fund-batch-${batchId}`,
            description:
              pf != null && pf > 0
                ? `Platform fee ${formatImpactMoney(pf)}. Money was debited from your wallet and claim links are live.`
                : "Money was debited from your wallet and claim links are live.",
            duration: 6000,
          });
        }
      }
      router.refresh();
    } catch (e) {
      setError(sanitizeFundBatchErrorForUser(e instanceof Error ? e.message : null));
    } finally {
      setPending(false);
    }
  }

  const disabled = pending || !fundEnabled;
  const showBlockedHint = !fundEnabled && fundBlockedReason;

  return (
    <div className="flex max-w-md flex-col gap-2">
      <PayoutFeeSummary principalGbp={poolTotalGbp} className="w-full" />
      <button
        type="button"
        disabled={disabled}
        onClick={onFund}
        className="rounded-lg border border-emerald-700/60 bg-emerald-950/30 px-3 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-900/40 disabled:opacity-50 disabled:pointer-events-none"
      >
        {pending ? "Funding…" : "Fund batch from wallet"}
      </button>
      <p className="text-xs text-neutral-500">
        Debits your wallet, reserves the pool for recipients. Each recipient claims via a private link (no Stripe until
        they withdraw).
      </p>
      {showBlockedHint && <p className="text-xs text-amber-200/90">{fundBlockedReason}</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
