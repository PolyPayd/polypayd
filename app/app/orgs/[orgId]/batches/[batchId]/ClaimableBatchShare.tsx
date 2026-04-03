"use client";

import { useEffect, useMemo, useState } from "react";
import { claimJoinAppPath, formatBatchCodeForDisplay } from "@/lib/batchCodePublic";

const btnClass =
  "rounded-lg border border-neutral-600 px-3 py-2 text-xs font-semibold text-neutral-200 hover:bg-neutral-800 hover:border-neutral-500 transition-colors disabled:opacity-50";

type Props = {
  /** Value from `batches.batch_code` (may be legacy JOIN-* or new PPD-*). */
  storedBatchCode: string;
  /** From `getPublicSiteUrl()`; when empty, the client fills the origin after mount. */
  publicSiteUrl: string;
};

export function ClaimableBatchShare({ storedBatchCode, publicSiteUrl }: Props) {
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

  return (
    <div className="rounded-2xl border border-neutral-800/90 bg-neutral-950/40 p-5 sm:p-6 space-y-6 max-w-2xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">Invite code</p>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <span className="font-mono text-xl sm:text-2xl font-semibold text-white tracking-[0.08em]">
            {displayCode}
          </span>
          <button type="button" onClick={copyCode} className={btnClass}>
            {codeCopied ? "Copied" : "Copy code"}
          </button>
        </div>
        <p className="text-xs text-neutral-500 mt-2 leading-relaxed">
          Recipients can enter this code on the Claim page, or use the link below.
        </p>
      </div>

      <div className="border-t border-neutral-800/80 pt-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">Shareable link</p>
        <p className="text-sm text-neutral-300 break-all leading-relaxed font-mono bg-neutral-950/60 border border-neutral-800/60 rounded-lg px-3 py-2.5 min-h-[2.75rem]">
          {absoluteUrl}
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button type="button" onClick={copyLink} className={btnClass}>
            {linkCopied ? "Copied link" : "Copy link"}
          </button>
          <button type="button" onClick={shareBatch} className={btnClass}>
            {shareCopied ? "Copied" : "Share…"}
          </button>
        </div>
        {!publicSiteUrl && (
          <p className="text-[11px] text-neutral-600 mt-3 leading-relaxed">
            Production: set{" "}
            <span className="font-mono text-neutral-500">NEXT_PUBLIC_APP_URL=https://polypayd.co.uk</span> so copied links
            always use the public domain.
          </p>
        )}
      </div>
    </div>
  );
}
