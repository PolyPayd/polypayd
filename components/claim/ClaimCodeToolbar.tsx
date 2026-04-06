"use client";

import { useCallback, useState } from "react";
import { FintechButton } from "@/components/fintech";

type Props = {
  /** User-facing code (e.g. PPD-…) */
  displayCode: string;
};

export function ClaimCodeToolbar({ displayCode }: Props) {
  const [hint, setHint] = useState<string | null>(null);

  const claimPath = `/app/claim/${encodeURIComponent(displayCode)}`;

  const showHint = useCallback((msg: string) => {
    setHint(msg);
    window.setTimeout(() => setHint(null), 2500);
  }, []);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(displayCode);
      showHint("Code copied");
    } catch {
      showHint("Could not copy");
    }
  }

  async function copyOrShareLink() {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}${claimPath}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Claim payout", text: `Use code ${displayCode}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      showHint("Link copied");
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        showHint("Link copied");
      } catch {
        showHint("Could not share or copy");
      }
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <FintechButton type="button" variant="secondary" className="min-h-10 px-4 text-xs sm:text-sm" onClick={copyCode}>
          Copy code
        </FintechButton>
        <FintechButton type="button" variant="secondary" className="min-h-10 px-4 text-xs sm:text-sm" onClick={copyOrShareLink}>
          Share link
        </FintechButton>
      </div>
      {hint ? <p className="text-xs text-[#9CA3AF]">{hint}</p> : null}
    </div>
  );
}
