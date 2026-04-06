"use client";

import { useEffect, useMemo, useState } from "react";
import { claimJoinAppPath, formatBatchCodeForDisplay } from "@/lib/batchCodePublic";

const btnClass =
  "inline-flex min-h-9 items-center justify-center rounded-xl border border-white/[0.08] bg-[#161F2B] px-3.5 text-xs font-semibold text-[#F9FAFB] transition-colors hover:border-white/[0.12] hover:bg-[#1a2433] disabled:opacity-50";

type Props = {
  /** Value from `batches.batch_code` (may be legacy JOIN-* or new PPD-*). */
  storedBatchCode: string;
  /** From `getPublicSiteUrl()`; when empty, the client fills the origin after mount. */
  publicSiteUrl: string;
  /** Omit outer card — use inside a parent surface */
  embedded?: boolean;
};

export function ClaimableBatchShare({ storedBatchCode, publicSiteUrl, embedded }: Props) {
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [clientOrigin, setClientOrigin] = useState<string | null>(null);

  useEffect(() => {
    setClientOrigin(window.location.origin);
  }, []);

  const displayCode = useMemo(() => formatBatchCodeForDisplay(storedBatchCode), [storedBatchCode]);
  const claimPath = useMemo(() => claimJoinAppPath(displayCode), [displayCode]);

  const absoluteUrl = useMemo(() => {
    const base = (publicSiteUrl || clientOrigin || "").replace(/\/+$/, "");
    if (!base) return claimPath;
    return `${base}${claimPath}`;
  }, [claimPath, publicSiteUrl, clientOrigin]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(displayCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  async function shareBatch() {
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: "Join on PolyPayd",
          text: `Use this link to join the payout (code ${displayCode}).`,
          url: absoluteUrl.startsWith("http") ? absoluteUrl : `${window.location.origin}${claimPath}`,
        });
      } else {
        await navigator.clipboard.writeText(absoluteUrl.startsWith("http") ? absoluteUrl : `${window.location.origin}${claimPath}`);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      }
    } catch {
      try {
        const u = absoluteUrl.startsWith("http") ? absoluteUrl : `${window.location.origin}${claimPath}`;
        await navigator.clipboard.writeText(u);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      } catch {
        /* ignore */
      }
    }
  }

  const inner = (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium text-[#6B7280]">Invite code</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
          <span className="font-mono text-xl font-semibold tracking-wide text-[#F9FAFB] sm:text-2xl">{displayCode}</span>
          <button type="button" onClick={copyCode} className={btnClass}>
            {codeCopied ? "Copied" : "Copy code"}
          </button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-[#6B7280]">Recipients can enter this code on Claim, or use the link below.</p>
      </div>

      <div className="pt-2">
        <p className="text-xs font-medium text-[#6B7280]">Shareable link</p>
        <p className="mt-2 break-all rounded-xl bg-[#0B0F14]/70 px-3 py-2.5 font-mono text-sm leading-relaxed text-[#9CA3AF]">
          {absoluteUrl}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={copyLink} className={btnClass}>
            {linkCopied ? "Copied link" : "Copy link"}
          </button>
          <button type="button" onClick={shareBatch} className={btnClass}>
            {shareCopied ? "Copied" : "Share…"}
          </button>
        </div>
        {!publicSiteUrl && (
          <p className="mt-3 text-[11px] leading-relaxed text-[#6B7280]">
            Production: set{" "}
            <span className="font-mono text-[#9CA3AF]">NEXT_PUBLIC_APP_URL=https://polypayd.co.uk</span> so copied links
            use the public domain.
          </p>
        )}
      </div>
    </div>
  );

  if (embedded) {
    return inner;
  }

  return <div className="max-w-2xl rounded-2xl border border-white/[0.05] bg-[#121821] p-5 sm:p-6">{inner}</div>;
}
