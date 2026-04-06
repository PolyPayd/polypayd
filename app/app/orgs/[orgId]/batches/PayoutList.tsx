"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { batchStatusDisplayLabel } from "@/lib/batchStatusUi";
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
  const base = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border";

  if (s === "draft") return clsx(base, "border-white/[0.08] bg-white/[0.04] text-[#9CA3AF]");
  if (s === "ready") return clsx(base, "border-[#3B82F6]/30 bg-[#3B82F6]/10 text-[#93C5FD]");
  if (s === "processing") return clsx(base, "border-[#F59E0B]/30 bg-[#F59E0B]/10 text-[#FCD34D]");
  if (s === "funded") return clsx(base, "border-[#3B82F6]/25 bg-[#3B82F6]/8 text-[#93C5FD]");
  if (s === "claiming") return clsx(base, "border-[#8B5CF6]/30 bg-[#8B5CF6]/10 text-[#C4B5FD]");
  if (s === "completed") return clsx(base, "border-[#22C55E]/30 bg-[#22C55E]/10 text-[#86EFAC]");
  if (s === "completed_with_errors") return clsx(base, "border-[#F59E0B]/30 bg-[#F59E0B]/10 text-[#FCD34D]");
  if (s === "failed") return clsx(base, "border-[#EF4444]/30 bg-[#EF4444]/10 text-[#FCA5A5]");

  return clsx(base, "border-white/[0.08] bg-white/[0.04] text-[#9CA3AF]");
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
      {error ? (
        <div className="rounded-2xl border border-[#EF4444]/20 bg-[#EF4444]/10 p-4 text-sm text-[#FCA5A5]">{error}</div>
      ) : null}

      {!batches.length ? (
        <div className="rounded-2xl border border-white/[0.05] bg-[#121821] p-10 text-center text-sm text-[#6B7280]">
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
                <div className="rounded-2xl border border-white/[0.05] bg-[#121821] p-4 transition-colors duration-200 hover:border-white/[0.08] hover:bg-[#161F2B]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/app/batches/${batch.id}`} className="min-w-0 flex-1 focus:outline-none">
                      <div>
                        <span className="font-medium text-[#F9FAFB]">{batch.name ?? "Untitled payout"}</span>
                        <span
                          className={clsx("ml-2 align-middle", statusBadge(batch.status))}
                          title={batch.status ?? undefined}
                        >
                          {batchStatusDisplayLabel(batch.status)}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#6B7280]">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/[0.06] bg-[#121821] p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-[#F9FAFB]">Delete this payout?</h3>
            <p className="mt-2 text-sm text-[#9CA3AF]">This cannot be undone.</p>
            <p className="mt-1 text-xs text-[#6B7280]">{confirmDelete.name}</p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="rounded-xl border border-white/[0.08] bg-[#161F2B] px-4 py-2.5 text-sm font-medium text-[#F9FAFB] hover:border-white/[0.12]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => runDelete(confirmDelete.id)}
                className="rounded-xl border border-[#EF4444]/40 bg-[#EF4444]/15 px-4 py-2.5 text-sm font-semibold text-[#FCA5A5] hover:bg-[#EF4444]/25 disabled:opacity-50"
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

