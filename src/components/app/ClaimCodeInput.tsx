"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { normaliseClaimCode } from "@/src/lib/claim-codes";
import { cn } from "@/lib/cn";

export function ClaimCodeInput() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleChange(raw: string) {
    setError(null);
    // If it looks like a URL, preserve as-is (just trim leading/trailing space).
    if (raw.trimStart().startsWith("http")) {
      setValue(raw.trim());
    } else {
      // Claim code: uppercase, strip dashes and whitespace, limit to 8 chars.
      const norm = normaliseClaimCode(raw).slice(0, 8);
      // Display with dash after position 4 for readability.
      setValue(norm.length > 4 ? `${norm.slice(0, 4)}-${norm.slice(4)}` : norm);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;

    // Direct URL → navigate straight there.
    if (trimmed.startsWith("http")) {
      router.push(trimmed);
      return;
    }

    // Claim code → resolve via API.
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/app/claim/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: normaliseClaimCode(trimmed) }),
      });

      if (res.ok) {
        const { linkId } = (await res.json()) as { linkId: string };
        router.push(`/claim/${linkId}`);
      } else {
        setError("Claim code not found. Double-check and try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md">
      <p className="mb-2 text-sm text-fp-text-secondary">
        Got a claim code or link?
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="AJOK-3847 or paste a link"
          className={cn(
            "h-10 flex-1 rounded-lg border bg-fp-elevated px-3 text-sm text-fp-text placeholder:text-fp-text-muted",
            "focus:outline-none focus:ring-2 focus:ring-fp-accent/40 focus:border-fp-accent/60",
            error
              ? "border-red-500/60"
              : "border-white/10"
          )}
          disabled={loading}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-fp-accent px-4 text-sm font-medium text-white transition-colors hover:bg-fp-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <ArrowRight className="h-4 w-4" />
          )}
        </button>
      </div>
      {error && (
        <p className="mt-1.5 text-xs text-red-400">{error}</p>
      )}
    </form>
  );
}
