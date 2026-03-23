"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PayoutFeeSummary } from "@/components/monetisation/PayoutFeeSummary";
import { formatImpactMoney } from "@/lib/impact";
import { sendClaimablePayouts, type SendClaimablePayoutsState } from "./actions";

function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-emerald-700/60 bg-emerald-950/30 px-3 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-900/40 disabled:opacity-50"
    >
      {pending ? "Sending…" : "Send Funds"}
    </button>
  );
}

type Props = { orgId: string; batchId: string; poolTotalGbp: number };

export function SendClaimablePayoutsButton({ orgId, batchId, poolTotalGbp }: Props) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<SendClaimablePayoutsState | null, FormData>(sendClaimablePayouts, null);
  useEffect(() => {
    if (state?.success) {
      const ic = state.impactContribution ?? 0;
      const pf = state.platformFee;
      if (ic > 0) {
        const feeLine =
          pf != null && pf > 0 ? `Platform fee ${formatImpactMoney(pf)}. ` : "";
        toast.success("Payout complete", {
          id: `impact-claimable-${batchId}`,
          description: `${feeLine}${formatImpactMoney(ic)} contributed to impact.`,
          duration: 7000,
        });
      } else {
        toast.success("Payout complete", {
          id: `payout-claimable-${batchId}`,
          description:
            pf != null && pf > 0
              ? `Platform fee ${formatImpactMoney(pf)}.`
              : "Funds sent to recipients.",
          duration: 5000,
        });
      }
      router.refresh();
    }
  }, [state, batchId, router]);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-2">
      <PayoutFeeSummary principalGbp={poolTotalGbp} className="w-full" />
      <input type="hidden" name="orgId" value={orgId} readOnly />
      <input type="hidden" name="batchId" value={batchId} readOnly />
      <SubmitButton pending={isPending} />
      {state?.error && <p className="text-xs text-red-400">{state.error}</p>}
    </form>
  );
}
