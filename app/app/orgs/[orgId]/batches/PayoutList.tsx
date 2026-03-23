"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { archivePayout, deletePayout } from "./actions";

type BatchRow = {
  id: string;
  name: string | null;
  status: string | null;
  total_amount: number | null;
  recipient_count: number | null;
  created_at: string | null;
};

type Props = {
  orgId: string;
  batches: BatchRow[];
  showingArchived: boolean;
};

function moneyGBP(n: unknown) {
  const num = Number(n ?? 0);
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(num);
}

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function statusBadge(status?: string | null) {
  const s = (status ?? "unknown").toLowerCase();
  const base = "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium border";

  if (s === "draft") return clsx(base, "border-neutral-700 text-neutral-200 bg-neutral-900/30");
  if (s === "ready") return clsx(base, "border-blue-700 text-blue-200 bg-blue-900/20");
  if (s === "processing") return clsx(base, "border-yellow-700 text-yellow-200 bg-yellow-900/20");
  if (s === "completed") return clsx(base, "border-emerald-700 text-emerald-200 bg-emerald-900/20");
  if (s === "failed") return clsx(base, "border-red-700 text-red-200 bg-red-900/20");

  return clsx(base, "border-neutral-700 text-neutral-200 bg-neutral-900/30");
}

export function PayoutList({ orgId, batches, showingArchived }: Props) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const emptyText = useMemo(
    () =>
      showingArchived
        ? "No archived payouts yet."
        : "No payouts yet. Start by creating a Bulk Send or Claim Link.",
    [showingArchived]
  );

  function onDeleteClick(id: string, name: string) {
    setConfirmDelete({ id, name });
  }

  function runDelete(id: string) {
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      const result = await deletePayout(orgId, id);
      if (!result.ok) setError(result.error);
      setPendingId(null);
      setConfirmDelete(null);
    });
  }

  function runArchive(id: string) {
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      const result = await archivePayout(orgId, id);
      if (!result.ok) setError(result.error);
      setPendingId(null);
    });
  }

  return (
    <div className="space-y-3">
      {error ? <div className="rounded-lg border border-red-800/50 bg-red-950/20 p-3 text-sm text-red-200">{error}</div> : null}

      {!batches.length ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-8 text-center text-neutral-400">
          {emptyText}
        </div>
      ) : (
        <ul className="space-y-3">
          {batches.map((batch) => {
            const status = String(batch.status ?? "").toLowerCase();
            const canDelete = status === "draft" || status === "processing";
            const canArchive = status === "completed" || status === "completed_with_errors";
            const loading = isPending && pendingId === batch.id;
            return (
              <li key={batch.id} className="group relative">
                <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4 transition hover:border-neutral-700 hover:bg-neutral-800/50 focus-within:border-neutral-700 focus-within:bg-neutral-800/50">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/app/batches/${batch.id}`} className="min-w-0 flex-1 focus:outline-none">
                      <div>
                        <span className="font-medium text-white">{batch.name ?? "Untitled payout"}</span>
                        <span className={clsx("ml-2", statusBadge(batch.status))}>{batch.status}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-4 text-sm text-neutral-400">
                        <span>{moneyGBP(batch.total_amount)}</span>
                        <span>{batch.recipient_count ?? 0} recipients</span>
                        <span>
                          {batch.created_at
                            ? new Date(batch.created_at).toLocaleDateString("en-GB", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })
                            : "—"}
                        </span>
                      </div>
                    </Link>
                    <div className="w-10 shrink-0 flex justify-end">
                      {canDelete ? (
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => onDeleteClick(batch.id, batch.name ?? "this payout")}
                          className="rounded-md border border-red-800/70 px-2 py-1 text-xs text-red-300 hover:border-red-700 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-200 disabled:opacity-50"
                          title="Delete payout"
                          aria-label="Delete payout"
                        >
                          🗑
                        </button>
                      ) : null}
                      {canArchive ? (
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => runArchive(batch.id)}
                          className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:border-neutral-600 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-200 disabled:opacity-50"
                          title="Archive payout"
                          aria-label="Archive payout"
                        >
                          🗄
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {confirmDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-5">
            <h3 className="text-lg font-semibold">Delete this payout?</h3>
            <p className="mt-2 text-sm text-neutral-300">Delete this payout? This cannot be undone.</p>
            <p className="mt-1 text-xs text-neutral-500">{confirmDelete.name}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="rounded-md border border-neutral-700 px-3 py-2 text-sm hover:border-neutral-600"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => runDelete(confirmDelete.id)}
                className="rounded-md border border-red-800/70 px-3 py-2 text-sm text-red-300 hover:border-red-700 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

