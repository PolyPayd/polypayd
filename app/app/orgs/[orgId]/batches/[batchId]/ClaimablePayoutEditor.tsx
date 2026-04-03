"use client";

import { useState, useCallback, useMemo, useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { lockAllocations, type LockAllocationsState } from "./actions";

const inputClass =
  "w-full max-w-[120px] rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white outline-none focus:border-white/30";

function formatMoney(amount: number, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
}

function round2(x: number) {
  return Math.round(x * 100) / 100;
}

type ClaimRow = {
  id: string;
  user_id: string;
  polypayd_username: string | null;
  claim_amount: number;
  display_primary: string;
  display_subtext?: string | undefined;
};

type Props = {
  claims: ClaimRow[];
  totalPool: number;
  currency?: string;
  canEdit: boolean;
  orgId: string;
  batchId: string;
  saveAction: (
    orgId: string,
    batchId: string,
    updates: Array<{ id: string; amount: number }>
  ) => Promise<{ error?: string }>;
};

export function ClaimablePayoutEditor({ claims, totalPool, currency = "GBP", canEdit, orgId, batchId, saveAction }: Props) {
  const router = useRouter();
  const [lockState, lockFormAction, lockPending] = useActionState<LockAllocationsState | null, FormData>(lockAllocations, null);

  useEffect(() => {
    if (lockState?.success) {
      router.refresh();
    }
  }, [lockState?.success, router]);

  const [amounts, setAmounts] = useState<number[]>(() => claims.map((c) => round2(c.claim_amount)));
  const [manualFlags, setManualFlags] = useState<boolean[]>(() => claims.map(() => true));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalAllocated = useMemo(() => amounts.reduce((s, a) => s + a, 0), [amounts]);
  const manualTotal = useMemo(
    () => amounts.reduce((s, a, i) => s + (manualFlags[i] ? a : 0), 0),
    [amounts, manualFlags]
  );
  const autoCount = useMemo(() => manualFlags.filter((m) => !m).length, [manualFlags]);
  const remainingPool = round2(totalPool - manualTotal);
  const isValidTotal = Math.abs(totalAllocated - totalPool) < 0.01;
  const manualExceedsPool = manualTotal > totalPool + 0.005;
  const negativeRemaining = remainingPool < -0.005;

  const recalcAutoAmounts = useCallback(
    (currentAmounts: number[], currentManual: boolean[]) => {
      const manualSum = currentAmounts.reduce((s, a, i) => s + (currentManual[i] ? a : 0), 0);
      const rem = round2(totalPool - manualSum);
      const autoIndices = currentAmounts.map((_, i) => i).filter((i) => !currentManual[i]);
      if (autoIndices.length === 0) return currentAmounts;
      if (rem < 0) return currentAmounts;
      const k = autoIndices.length;
      const perAuto = round2(rem / k);
      const filled = round2(perAuto * (k - 1));
      const lastAuto = round2(rem - filled);
      const next = [...currentAmounts];
      autoIndices.forEach((idx, j) => {
        next[idx] = j === autoIndices.length - 1 ? lastAuto : perAuto;
      });
      return next;
    },
    [totalPool]
  );

  const handleAmountChange = useCallback(
    (index: number, value: string) => {
      const num = parseFloat(value);
      if (Number.isNaN(num) || num < 0) return;
      const capped = round2(Math.min(num, totalPool));
      setError(null);
      setManualFlags((prev) => {
        const next = [...prev];
        next[index] = true;
        return next;
      });
      setAmounts((prev) => {
        const next = [...prev];
        next[index] = capped;
        const nextManual = [...manualFlags];
        nextManual[index] = true;
        const recalc = recalcAutoAmounts(next, nextManual);
        return recalc;
      });
    },
    [totalPool, manualFlags, recalcAutoAmounts]
  );

  const handleSetToAuto = useCallback(
    (index: number) => {
      setError(null);
      setManualFlags((prev) => {
        const next = [...prev];
        next[index] = false;
        return next;
      });
      setAmounts((prev) => {
        const nextManual = [...manualFlags];
        nextManual[index] = false;
        return recalcAutoAmounts(prev, nextManual);
      });
    },
    [manualFlags, recalcAutoAmounts]
  );

  const allocationPayload = useMemo(
    () => JSON.stringify(claims.map((c, i) => ({ id: c.id, amount: round2(amounts[i]) }))),
    [claims, amounts]
  );

  const finalizeDisabled =
    lockPending || !isValidTotal || manualExceedsPool || negativeRemaining || claims.length === 0;

  const handleSave = async () => {
    if (manualExceedsPool) {
      setError("Total of manual amounts cannot exceed the batch total.");
      return;
    }
    if (negativeRemaining) {
      setError("Remaining pool would be negative. Reduce manual amounts.");
      return;
    }
    if (!isValidTotal) {
      setError("Total allocated must equal the pool amount.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const updates = claims.map((c, i) => ({ id: c.id, amount: round2(amounts[i]) }));
      const result = await saveAction(orgId, batchId, updates);
      if (result && typeof result === "object" && result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  if (claims.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-800 bg-neutral-950/30 px-5 py-8 text-center">
        <p className="text-sm font-medium text-neutral-300">No recipients yet</p>
        <p className="text-sm text-neutral-500 mt-2 leading-relaxed max-w-sm mx-auto">
          When people join this Claim Link, they&apos;ll appear here so you can set amounts before locking.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-neutral-800/70">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-800 bg-neutral-900/80">
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Recipient
              </th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Amount
              </th>
              {canEdit && (
                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider text-neutral-500 w-28">
                  Split
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/80">
            {claims.map((c, i) => (
              <tr key={c.id} className="bg-neutral-950/20">
                <td className="py-3.5 px-4 align-top min-w-[140px]">
                  <div className="text-neutral-100 text-sm font-medium">{c.display_primary}</div>
                  {c.display_subtext ? (
                    <div className="text-xs text-neutral-500 mt-1">{c.display_subtext}</div>
                  ) : null}
                </td>
                <td className="py-3.5 px-4 align-top tabular-nums">
                  {canEdit ? (
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={totalPool}
                      className={inputClass}
                      value={amounts[i]}
                      onChange={(e) => handleAmountChange(i, e.target.value)}
                    />
                  ) : (
                    <span className="font-medium text-neutral-100">{formatMoney(amounts[i], currency)}</span>
                  )}
                </td>
                {canEdit && (
                  <td className="py-3.5 px-4 align-top">
                    {manualFlags[i] ? (
                      <button
                        type="button"
                        onClick={() => handleSetToAuto(i)}
                        className="text-xs font-medium text-neutral-500 hover:text-neutral-300 underline underline-offset-2"
                      >
                        Use auto split
                      </button>
                    ) : (
                      <span className="inline-flex rounded-full border border-neutral-700/80 px-2 py-0.5 text-xs text-neutral-400">
                        Auto
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <p className="text-sm text-neutral-500">
          Pool total:{" "}
          <span className="font-medium tabular-nums text-neutral-300">{formatMoney(totalPool, currency)}</span>
          <span className="text-neutral-600 mx-2">·</span>
          Allocated:{" "}
          <span
            className={
              isValidTotal && !manualExceedsPool && !negativeRemaining ? "font-semibold tabular-nums text-neutral-100" : "font-semibold tabular-nums text-red-400"
            }
          >
            {formatMoney(totalAllocated, currency)}
          </span>
          {(!isValidTotal || manualExceedsPool || negativeRemaining) && (
            <span className="text-red-400/90"> (must equal pool)</span>
          )}
        </p>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !isValidTotal || manualExceedsPool || negativeRemaining}
              className="rounded-xl border border-neutral-600 bg-neutral-900/40 px-4 py-2.5 text-sm font-semibold text-neutral-100 hover:bg-neutral-800/60 disabled:opacity-45 disabled:pointer-events-none transition-colors"
            >
              {saving ? "Saving…" : "Save amounts"}
            </button>
            <form action={lockFormAction} className="inline">
              <input type="hidden" name="orgId" value={orgId} readOnly />
              <input type="hidden" name="batchId" value={batchId} readOnly />
              <input type="hidden" name="claimAllocations" value={allocationPayload} readOnly />
              <button
                type="submit"
                disabled={finalizeDisabled}
                className="rounded-xl border border-amber-600/50 bg-amber-950/35 px-4 py-2.5 text-sm font-semibold text-amber-100 hover:bg-amber-900/45 disabled:opacity-45 disabled:pointer-events-none transition-colors"
              >
                {lockPending ? "Locking…" : "Lock allocations"}
              </button>
            </form>
          </div>
        )}
      </div>
      {canEdit && (
        <p className="text-xs text-neutral-500 leading-relaxed">
          Lock allocations saves these amounts and prevents further edits—you don&apos;t need Save first.
        </p>
      )}
      {lockState?.error && <p className="text-sm text-red-400">{lockState.error}</p>}
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}
