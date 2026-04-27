"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

import { cn } from "@/lib/cn";

// Small client-only copy-to-clipboard button. Shows a checkmark + "Copied!"
// label for 2s after a successful write, then reverts. Falls back gracefully
// if the Clipboard API isn't available (e.g. insecure context).
export function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied!",
  className,
  variant = "subtle",
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
  variant?: "subtle" | "primary" | "outline";
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  async function handleCopy() {
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        await navigator.clipboard.writeText(value);
      } else {
        throw new Error("Clipboard API unavailable");
      }
      setCopied(true);
      setError(false);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("CopyButton failed:", err);
      setError(true);
      setTimeout(() => setError(false), 2000);
    }
  }

  const base =
    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

  const variants: Record<NonNullable<typeof variant>, string> = {
    subtle:
      "bg-white/5 text-fp-text-secondary hover:bg-white/10 hover:text-fp-text",
    primary: "bg-fp-accent text-white hover:bg-fp-accent/90",
    outline:
      "border border-white/10 text-fp-text-secondary hover:bg-white/5 hover:text-fp-text",
  };

  const successClass = "bg-green-500/15 text-green-300 border-green-500/20";
  const errorClass = "bg-red-500/15 text-red-300 border-red-500/20";

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-live="polite"
      className={cn(
        base,
        copied ? successClass : error ? errorClass : variants[variant],
        className
      )}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {error ? "Couldn't copy" : copied ? copiedLabel : label}
    </button>
  );
}
