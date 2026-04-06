"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { mapClaimErrorMessage } from "@/lib/claimUiCopy";
import { FintechButton } from "@/components/fintech";

type Props = { token: string };

const fmt = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);

export function ClaimToWalletButton({ token }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [banner, setBanner] = useState<{ kind: "error"; title: string; detail?: string } | null>(null);

  async function onClaim() {
    setPending(true);
    setBanner(null);
    try {
      const res = await fetch(`/api/claims/${encodeURIComponent(token)}/claim`, { method: "POST" });
      const data = (await res.json()) as {
        error?: string;
        ok?: boolean;
        duplicate?: boolean;
        creditedAmountGbp?: number;
        batchCompleted?: boolean;
      };
      if (!res.ok) {
        const mapped = mapClaimErrorMessage(data.error);
        setBanner({ kind: "error", title: mapped.title, detail: mapped.detail });
        return;
      }
      if (data.duplicate) {
        toast.info("Already in your wallet", {
          description: "This payout was credited earlier—nothing else to do.",
        });
      } else {
        toast.success("Added to your wallet", {
          description:
            data.creditedAmountGbp != null
              ? `${fmt(data.creditedAmountGbp)} is now in your available balance. You can withdraw to your bank from your wallet when you’re ready.`
              : "Funds are in your available balance.",
        });
      }
      router.refresh();
    } catch (e) {
      setBanner({
        kind: "error",
        title: "Connection problem",
        detail: e instanceof Error ? e.message : "Check your network and try again.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {banner?.kind === "error" && (
        <div
          className="rounded-xl border border-red-500/20 bg-red-950/25 px-4 py-3 text-left"
          role="alert"
        >
          <p className="text-sm font-medium text-red-100">{banner.title}</p>
          {banner.detail ? <p className="mt-1.5 text-sm text-red-200/75 leading-relaxed">{banner.detail}</p> : null}
        </div>
      )}
      <FintechButton type="button" disabled={pending} onClick={onClaim} block>
        {pending ? "Processing…" : "Claim funds"}
      </FintechButton>
      <p className="mt-3 text-center text-xs leading-relaxed text-[#6B7280]">
        By continuing you confirm this payout is for your signed-in account.
      </p>
    </div>
  );
}
