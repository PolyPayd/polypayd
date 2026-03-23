"use client";

import { useState } from "react";

const btnClass =
  "rounded-lg border border-neutral-600 px-2.5 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-800 hover:border-neutral-500 transition-colors";

export function ClaimableBatchShare({ batchCode }: { batchCode: string }) {
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const claimPath = `/app/claim/${encodeURIComponent(batchCode)}`;
  const claimUrl =
    typeof window !== "undefined" ? `${window.location.origin}${claimPath}` : claimPath;

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(batchCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(claimUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  async function shareBatch() {
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: "Join this batch",
          text: "Use this code to join the batch",
          url: claimUrl,
        });
      } else {
        await navigator.clipboard.writeText(claimUrl);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      }
    } catch {
      // User cancelled or clipboard failed; fallback to copy
      try {
        await navigator.clipboard.writeText(claimUrl);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      } catch {
        // ignore
      }
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-neutral-500 text-sm">Batch code:</span>
        <span className="font-mono text-lg font-medium text-neutral-200 tracking-wide">{batchCode}</span>
        <button type="button" onClick={copyCode} className={btnClass}>
          {codeCopied ? "Copied" : "Copy Code"}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-neutral-500 text-sm">Claim link:</span>
        <span className="font-mono text-sm text-neutral-400 truncate max-w-[240px]">{claimPath}</span>
        <button type="button" onClick={copyLink} className={btnClass}>
          {linkCopied ? "Copied" : "Copy Link"}
        </button>
        <button type="button" onClick={shareBatch} className={btnClass}>
          {shareCopied ? "Link copied" : "Share Batch"}
        </button>
      </div>
    </div>
  );
}
