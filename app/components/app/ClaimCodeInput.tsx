"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/cn";

// Accepts either a raw claim code (e.g. AJOK-3847 → AJOK3847) or a pasted
// claim URL on the polypayd domain. URLs are passed straight through to
// router.push (extracted path), codes are routed to /claim/<normalised>.
//
// Inputs are auto-uppercased and stripped of dashes/whitespace as the user
// types unless the value starts with "http", in which case we preserve it
// for accurate URL handling.

const URL_PREFIX_RE = /^https?:\/\//i;

function normaliseCode(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

function looksLikeUrl(raw: string): boolean {
  return URL_PREFIX_RE.test(raw.trim());
}

function extractClaimPath(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    const path = url.pathname || "/";
    return path;
  } catch {
    return null;
  }
}

export function ClaimCodeInput({
  label = "Got a claim code or link?",
  className,
}: {
  label?: string;
  className?: string;
} = {}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleChange(raw: string) {
    setError(null);
    if (looksLikeUrl(raw)) {
      setValue(raw.trimStart());
    } else {
      setValue(normaliseCode(raw));
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();

    if (looksLikeUrl(trimmed)) {
      const path = extractClaimPath(trimmed);
      if (!path) {
        setError("Invalid code or link");
        return;
      }
      router.push(path);
      return;
    }

    const normalised = normaliseCode(trimmed);
    if (normalised.length < 8) {
      setError("Invalid code or link");
      return;
    }

    router.push(`/claim/${normalised}`);
  }

  return (
    <form onSubmit={handleSubmit} className={cn("w-full max-w-md", className)}>
      <label
        htmlFor="claim-code-input"
        className="mb-2 block text-sm text-fp-text-secondary"
      >
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id="claim-code-input"
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="AJOK3847 or paste a link"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? "claim-code-error" : undefined}
          className={cn(
            "h-10 flex-1 rounded-lg border bg-fp-elevated px-3 text-sm text-fp-text",
            "placeholder:text-fp-text-muted focus:outline-none focus:ring-2 focus:ring-fp-accent/40 focus:border-fp-accent/60",
            error ? "border-red-500/60" : "border-white/10"
          )}
        />
        <button
          type="submit"
          disabled={!value.trim()}
          aria-label="Open claim"
          className={cn(
            "inline-flex h-10 items-center gap-1.5 rounded-lg bg-fp-accent px-4 text-sm font-medium text-white",
            "transition-colors hover:bg-fp-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      {error && (
        <p id="claim-code-error" className="mt-1.5 text-xs text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}
