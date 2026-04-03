"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { mapClaimErrorMessage } from "@/lib/claimUiCopy";

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
      <button
        type="button"
        disabled={pending}
        onClick={onClaim}
        className="w-full rounded-xl bg-emerald-600 px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500 disabled:opacity-45 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
      >
        {pending ? "Processing…" : "Add to my wallet"}
      </button>
      <p className="text-center text-xs text-neutral-600 leading-relaxed">
        By continuing you confirm this payout is intended for your signed-in account.
      </p>
    </div>
  );
}
