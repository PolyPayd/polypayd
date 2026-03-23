"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addFunds } from "./actions";

type Props = { orgId: string };

export function AddFundsButton({ orgId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("GBP");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const num = parseFloat(amount);
    if (Number.isNaN(num) || num <= 0) {
      setError("Enter a valid amount greater than 0.");
      return;
    }
    setLoading(true);
    try {
      const result = await addFunds(orgId, num, currency, note || undefined);
      if (result?.error) {
        setError(result.error);
      } else {
        setOpen(false);
        setAmount("");
        setNote("");
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-emerald-700/60 bg-emerald-950/30 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-900/40"
      >
        Add funds
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-white mb-4">Add funds</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-neutral-400 mb-1">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-white placeholder-neutral-500 focus:border-emerald-500 focus:outline-none"
                  placeholder="0.00"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-neutral-400 mb-1">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value="GBP">GBP</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-neutral-400 mb-1">Note (optional)</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-white placeholder-neutral-500 focus:border-emerald-500 focus:outline-none"
                  placeholder="e.g. Test funding"
                />
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => { setOpen(false); setError(null); }}
                  className="rounded-lg border border-neutral-600 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg border border-emerald-700/60 bg-emerald-950/30 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-900/40 disabled:opacity-50"
                >
                  {loading ? "Adding…" : "Add funds"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
