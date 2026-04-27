"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/cn";

type ActionVariant = "primary" | "outline" | "destructive";

type Action = {
  label: string;
  endpoint: string;
  variant: ActionVariant;
  confirm?: string;
};

// Client-side action buttons for the batch detail page. Each button POSTs to
// its endpoint, refreshes the route on success, and surfaces an inline error
// banner on failure. Optional `confirm` prompts a window.confirm() first
// (used for destructive actions like cancel).
export function BatchActions({
  batchId,
  actions,
}: {
  batchId: string;
  actions: Action[];
}) {
  const router = useRouter();
  const [busyEndpoint, setBusyEndpoint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick(action: Action) {
    if (action.confirm && !window.confirm(action.confirm)) return;

    setError(null);
    setBusyEndpoint(action.endpoint);
    try {
      const res = await fetch(action.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        if (res.status === 501) {
          setError(
            body.message ??
              "This action isn't wired up yet. Hang tight, it's coming soon."
          );
          return;
        }
        throw new Error(
          body.message ?? body.error ?? `Request failed (${res.status})`
        );
      }

      router.refresh();
    } catch (err) {
      console.error(`[batch-actions] ${action.endpoint} failed:`, err);
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setBusyEndpoint(null);
    }
  }

  if (actions.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {actions.map((action) => (
          <button
            key={action.endpoint}
            type="button"
            disabled={busyEndpoint !== null}
            onClick={() => handleClick(action)}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              action.variant === "primary" &&
                "bg-fp-accent text-white hover:bg-fp-accent/90",
              action.variant === "outline" &&
                "border border-white/10 text-fp-text hover:bg-white/5",
              action.variant === "destructive" &&
                "bg-red-600 text-white hover:bg-red-500"
            )}
            aria-busy={busyEndpoint === action.endpoint}
          >
            {busyEndpoint === action.endpoint && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            {action.label}
          </button>
        ))}
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {error}
        </p>
      )}
    </div>
  );
}

// Re-export for parent page typing convenience.
export type { Action as BatchAction };
