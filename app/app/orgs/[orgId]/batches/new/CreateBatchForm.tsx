"use client";

import { useState } from "react";

const inputClass =
  "w-full max-w-md rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-white/30";
const labelClass = "mb-2 block text-sm font-medium text-neutral-300";

function formatMoney(amount: number, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
}

type CreateBatchFormProps = {
  orgId: string;
  createBatch: (formData: FormData) => Promise<void>;
  walletBalance: number;
  currency: string;
};

function isRedirectError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const digest = (err as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.includes("NEXT_REDIRECT");
}

export function CreateBatchForm({ orgId, createBatch, walletBalance, currency }: CreateBatchFormProps) {
  const [batchType, setBatchType] = useState<"standard" | "claimable">("standard");
  const [claimableTotalPool, setClaimableTotalPool] = useState("");
  const [claimableMaxRecipients, setClaimableMaxRecipients] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const totalNum = parseFloat(claimableTotalPool) || 0;
  const maxParsed = parseInt(claimableMaxRecipients.trim(), 10);
  const maxRecipientsValid = Number.isInteger(maxParsed) && maxParsed >= 1;
  const maxNum = maxRecipientsValid ? maxParsed : 0;
  const perRecipient = maxRecipientsValid && maxNum > 0 ? totalNum / maxNum : 0;
  const totalCents = Math.round(totalNum * 100);
  const evenSplitValid =
    maxRecipientsValid && totalNum > 0 && totalCents % maxNum === 0 && perRecipient > 0;
  const exceedsBalance = batchType === "claimable" && totalNum > walletBalance;
  const canSubmitClaimable =
    batchType !== "claimable" || (maxRecipientsValid && !exceedsBalance && evenSplitValid);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitError(null);
    if (batchType === "claimable" && exceedsBalance) return;
    const form = e.currentTarget;
    const formData = new FormData(form);
    try {
      await createBatch(formData);
    } catch (err) {
      if (isRedirectError(err)) throw err;
      setSubmitError(err instanceof Error ? err.message : "Failed to create batch.");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="batchType" value={batchType} />

      <div>
        <span className={labelClass}>Payout type</span>
        <div className="mt-2 flex flex-wrap gap-4">
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="batchTypeRadio"
              value="standard"
              checked={batchType === "standard"}
              onChange={() => setBatchType("standard")}
              className="rounded-full border-neutral-600 bg-neutral-900 text-white focus:ring-neutral-500"
            />
            <span className="text-neutral-200 font-medium">Bulk Send</span>
            <span className="block w-full text-xs text-neutral-400 -mt-1 ml-0">
              Send payments to many people instantly
            </span>
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="batchTypeRadio"
              value="claimable"
              checked={batchType === "claimable"}
              onChange={() => setBatchType("claimable")}
              className="rounded-full border-neutral-600 bg-neutral-900 text-white focus:ring-neutral-500"
            />
            <span className="text-neutral-200 font-medium">Claim Link</span>
            <span className="block w-full text-xs text-neutral-400 -mt-1 ml-0">
              Create a link recipients can claim from
            </span>
          </label>
        </div>
      </div>

      <div>
        <label htmlFor="name" className={labelClass}>
          Batch name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          className={inputClass}
          placeholder="Enter batch name"
        />
      </div>

      {batchType === "standard" && (
        <div>
          <label htmlFor="currency" className={labelClass}>
            Currency
          </label>
          <input
            id="currency"
            name="currency"
            type="text"
            defaultValue="GBP"
            className={inputClass}
            placeholder="e.g. GBP"
          />
        </div>
      )}

      {batchType === "claimable" && (
        <>
          <p className="max-w-md text-xs text-neutral-400">
            A unique batch code will be generated after creation. Recipients use it to join until the batch expires or reaches the max recipient limit.
          </p>
          <p className="max-w-md text-xs text-amber-200/80">
            Payouts are split evenly by default. You can adjust individual recipient amounts later after recipients join.
          </p>
          <div>
            <label htmlFor="currency-claimable" className={labelClass}>
              Currency
            </label>
            <input
              id="currency-claimable"
              name="currency"
              type="text"
              defaultValue="GBP"
              className={inputClass}
              placeholder="e.g. GBP"
            />
          </div>
          <div>
            <label htmlFor="totalPoolAmount" className={labelClass}>
              Total amount to distribute
            </label>
            <p className="mb-1 text-xs text-neutral-400">
              Available balance: {formatMoney(walletBalance, currency)}
            </p>
            <input
              id="totalPoolAmount"
              name="totalPoolAmount"
              type="number"
              step="0.01"
              min="0.01"
              required
              className={inputClass}
              placeholder="e.g. 300.00"
              value={claimableTotalPool}
              onChange={(e) => setClaimableTotalPool(e.target.value)}
            />
            {exceedsBalance && (
              <p className="mt-1 text-sm text-red-400">
                Insufficient wallet balance. Available balance is {formatMoney(walletBalance, currency)} but batch total is {formatMoney(totalNum, currency)}. Add funds or reduce the amount.
              </p>
            )}
          </div>
          <div>
            <label htmlFor="expiresAt" className={labelClass}>
              Expiry date & time
            </label>
            <input
              id="expiresAt"
              name="expiresAt"
              type="datetime-local"
              required
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="maxClaims" className={labelClass}>
              Max recipients
            </label>
            <input
              id="maxClaims"
              name="maxClaims"
              type="number"
              min={1}
              required
              className={inputClass}
              placeholder="e.g. 10"
              value={claimableMaxRecipients}
              onChange={(e) => setClaimableMaxRecipients(e.target.value)}
            />
            <p className="mt-1 text-xs text-neutral-500">Maximum number of recipients who can join this batch.</p>
          </div>
          {totalNum > 0 && (
            <div className="rounded-lg border border-neutral-700 bg-neutral-900/30 px-3 py-2 text-sm text-neutral-300">
              {!maxRecipientsValid
                ? "Enter max recipients to see the per-recipient amount."
                : evenSplitValid
                  ? `${formatMoney(perRecipient, currency)} per recipient (even split)`
                  : "Total must divide evenly by max recipients to 2 decimal places."}
            </div>
          )}
        </>
      )}

      {submitError && (
        <p className="text-sm text-red-400">{submitError}</p>
      )}

      <button
        type="submit"
        disabled={batchType === "claimable" && (exceedsBalance || !evenSplitValid)}
        className="inline-flex items-center rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-50 disabled:pointer-events-none"
      >
        Create Payout
      </button>

      <p className="text-xs text-neutral-500">
        {batchType === "claimable" && exceedsBalance
          ? "Add funds from Wallet or reduce the batch total to continue."
          : "If nothing happens, check the terminal for the exact error."}
      </p>
    </form>
  );
}
