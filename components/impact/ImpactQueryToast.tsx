"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatImpactMoney } from "@/lib/impact";

/**
 * After Bulk Send, server redirects with `?impactToast=`. Shows a one-time toast and strips the param.
 */
export function ImpactQueryToast({ impactPounds, batchId }: { impactPounds: number | null; batchId?: string }) {
  const router = useRouter();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (impactPounds == null || !Number.isFinite(impactPounds) || impactPounds <= 0) return;
    fired.current = true;

    toast.success("Payout complete", {
      id: batchId ? `impact-bulk-${batchId}` : "impact-bulk-send",
      description: `${formatImpactMoney(impactPounds)} contributed to impact.`,
      duration: 6500,
    });

    const url = new URL(window.location.href);
    url.searchParams.delete("impactToast");
    const next = url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : "");
    router.replace(next, { scroll: false });
  }, [impactPounds, batchId, router]);

  return null;
}
