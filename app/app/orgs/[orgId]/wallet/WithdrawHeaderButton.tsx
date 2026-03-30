"use client";

const OPEN_EVENT = "polypayd:open-withdraw-panel";

export function WithdrawHeaderButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_EVENT))}
      className="rounded-lg border border-neutral-600 bg-neutral-900/40 px-4 py-2 text-sm font-medium text-neutral-100 hover:border-neutral-500 hover:bg-neutral-800/60"
    >
      Withdraw
    </button>
  );
}
