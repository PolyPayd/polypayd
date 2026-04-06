"use client";

import { useState } from "react";
import { FintechBadge, FintechButton, FintechCard, FintechInput } from "@/components/fintech";
import { BulkSendPreviewSteps } from "@/components/batches/BulkSendPreviewSteps";
import type { BulkSendPreviewRow } from "@/lib/bulkSendPreviewCsv";

function formatMoney(amount: number, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
}

type CreateBatchFormProps = {
  orgId: string;
  createBatch: (formData: FormData) => Promise<void>;
  spendableBalance: number;
  currency: string;
};

function isRedirectError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const digest = (err as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.includes("NEXT_REDIRECT");
}

const labelClass = "mb-2 block text-xs font-medium text-[#9CA3AF]";

const STANDARD_CURRENCY = "GBP";

export function CreateBatchForm({ orgId, createBatch, spendableBalance, currency }: CreateBatchFormProps) {
  const [step, setStep] = useState(1);
  const [batchType, setBatchType] = useState<"standard" | "claimable">("standard");
  const [batchName, setBatchName] = useState("");
  const [claimCurrency, setClaimCurrency] = useState("GBP");
  const [expiresAt, setExpiresAt] = useState("");
  const [claimableTotalPool, setClaimableTotalPool] = useState("");
  const [claimableMaxRecipients, setClaimableMaxRecipients] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<BulkSendPreviewRow[]>([]);

  const totalNum = parseFloat(claimableTotalPool) || 0;
  const maxParsed = parseInt(claimableMaxRecipients.trim(), 10);
  const maxRecipientsValid = Number.isInteger(maxParsed) && maxParsed >= 1;
  const maxNum = maxRecipientsValid ? maxParsed : 0;
  const perRecipient = maxRecipientsValid && maxNum > 0 ? totalNum / maxNum : 0;
  const totalCents = Math.round(totalNum * 100);
  const evenSplitValid =
    maxRecipientsValid && totalNum > 0 && totalCents % maxNum === 0 && perRecipient > 0;
  const exceedsBalance = batchType === "claimable" && totalNum > spendableBalance;
  const canSubmitClaimable =
    batchType !== "claimable" || (maxRecipientsValid && !exceedsBalance && evenSplitValid);

  const canGoStep2 = batchName.trim().length > 0;
  const canGoStep3 =
    batchType === "claimable"
      ? Boolean(expiresAt.trim()) && maxRecipientsValid && !exceedsBalance && evenSplitValid && totalNum > 0
      : true;

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

  const steps =
    batchType === "standard"
      ? [
          { n: 1, label: "Setup" },
          { n: 2, label: "Upload CSV" },
          { n: 3, label: "Review recipients" },
          { n: 4, label: "Preview outcome" },
        ]
      : [
          { n: 1, label: "Setup" },
          { n: 2, label: "Pool" },
          { n: 3, label: "Review" },
        ];

  const maxStep = batchType === "standard" ? 4 : 3;

  const stepIndicator = (
    <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center">
      {steps.map((s, idx) => (
        <div key={s.n} className="flex items-center gap-3">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
              step >= s.n ? "bg-[#3B82F6] text-white" : "border border-white/[0.08] bg-[#161F2B] text-[#6B7280]"
            }`}
          >
            {s.n}
          </span>
          <span className={`text-sm font-medium ${step >= s.n ? "text-[#F9FAFB]" : "text-[#6B7280]"}`}>
            {s.label}
          </span>
          {idx < steps.length - 1 ? (
            <span className="hidden h-px w-8 shrink-0 bg-white/[0.08] sm:block" aria-hidden />
          ) : null}
        </div>
      ))}
    </div>
  );

  const selectStandard = () => {
    setBatchType("standard");
    setStep(1);
    setPreviewRows([]);
    setSubmitError(null);
  };

  const selectClaimable = () => {
    setBatchType("claimable");
    setStep(1);
    setPreviewRows([]);
    setSubmitError(null);
  };

  if (batchType === "standard") {
    return (
      <div className="space-y-8">
        {stepIndicator}

        {step === 1 && (
          <FintechCard interactive={false}>
            <h2 className="text-lg font-semibold tracking-tight text-[#F9FAFB] sm:text-xl">Payout type</h2>
            <p className="mt-1 text-sm text-[#6B7280]">Choose how you want to pay people.</p>

            <div
              className="mt-6 rounded-2xl border border-[#3B82F6]/20 bg-[#3B82F6]/8 px-4 py-3 text-sm leading-relaxed text-[#93C5FD]"
              role="status"
            >
              Bulk Send is in preview. Explore the workflow with demo data. Live bank payouts are coming soon.
            </div>

            <div className="mt-8 space-y-3">
              <label className="flex cursor-pointer gap-4 rounded-2xl border border-transparent bg-[#0B0F14]/55 px-4 py-4 transition-colors has-[:checked]:border-[#3B82F6]/35 has-[:checked]:bg-[#3B82F6]/10">
                <input
                  type="radio"
                  name="batchTypeRadio"
                  value="standard"
                  checked
                  onChange={selectStandard}
                  className="mt-1 border-[#6B7280] text-[#3B82F6] focus:ring-[#3B82F6]"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[#F9FAFB]">Bulk send</span>
                    <FintechBadge tone="info">Preview</FintechBadge>
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-[#6B7280]">
                    Upload a CSV and review how bank payouts will work. Coming soon.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer gap-4 rounded-2xl border border-transparent bg-[#0B0F14]/55 px-4 py-4 transition-colors has-[:checked]:border-[#3B82F6]/35 has-[:checked]:bg-[#3B82F6]/10">
                <input
                  type="radio"
                  name="batchTypeRadio"
                  value="claimable"
                  checked={false}
                  onChange={selectClaimable}
                  className="mt-1 border-[#6B7280] text-[#3B82F6] focus:ring-[#3B82F6]"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[#F9FAFB]">Claim link</span>
                    <FintechBadge tone="success">Live</FintechBadge>
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-[#6B7280]">
                    Recipients join, then you fund — wallet payouts are live now.
                  </span>
                </span>
              </label>
            </div>

            <div className="mt-10 space-y-2">
              <label htmlFor="name" className={labelClass}>
                Batch name
              </label>
              <FintechInput
                id="name"
                type="text"
                required
                placeholder="e.g. March bonuses"
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
              />
            </div>

            <div className="mt-8 space-y-2">
              <span className={labelClass}>Currency</span>
              <div className="rounded-xl border border-white/[0.08] bg-[#161F2B] px-4 py-3 text-sm font-medium text-[#F9FAFB]">
                {STANDARD_CURRENCY}
              </div>
              <p className="text-sm leading-relaxed text-[#6B7280]">
                Upload a CSV of recipients and amounts. Review the batch before sending. Live bank payouts are coming
                soon.
              </p>
            </div>

            <div className="mt-10 flex justify-end">
              <FintechButton type="button" className="min-h-12 px-8" onClick={() => setStep(2)} disabled={!canGoStep2}>
                Continue
              </FintechButton>
            </div>
          </FintechCard>
        )}

        {step >= 2 && step <= maxStep ? (
          <BulkSendPreviewSteps
            step={step as 2 | 3 | 4}
            setStep={setStep}
            batchName={batchName}
            currency={STANDARD_CURRENCY}
            rows={previewRows}
            setRows={setPreviewRows}
          />
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="batchType" value="claimable" />
      <input type="hidden" name="name" value={batchName} />
      <input type="hidden" name="currency" value={claimCurrency} />
      <input type="hidden" name="totalPoolAmount" value={claimableTotalPool} />
      <input type="hidden" name="maxClaims" value={claimableMaxRecipients} />
      <input type="hidden" name="expiresAt" value={expiresAt} />

      {stepIndicator}

      {step === 1 && (
        <FintechCard interactive={false}>
          <h2 className="text-lg font-semibold tracking-tight text-[#F9FAFB] sm:text-xl">Payout type</h2>
          <p className="mt-1 text-sm text-[#6B7280]">Choose how you want to pay people.</p>
          <div className="mt-8 space-y-3">
            <label className="flex cursor-pointer gap-4 rounded-2xl border border-transparent bg-[#0B0F14]/55 px-4 py-4 transition-colors has-[:checked]:border-[#3B82F6]/35 has-[:checked]:bg-[#3B82F6]/10">
              <input
                type="radio"
                name="batchTypeRadio"
                value="standard"
                checked={false}
                onChange={selectStandard}
                className="mt-1 border-[#6B7280] text-[#3B82F6] focus:ring-[#3B82F6]"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[#F9FAFB]">Bulk send</span>
                  <FintechBadge tone="info">Preview</FintechBadge>
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-[#6B7280]">
                  Upload a CSV and review how bank payouts will work. Coming soon.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer gap-4 rounded-2xl border border-transparent bg-[#0B0F14]/55 px-4 py-4 transition-colors has-[:checked]:border-[#3B82F6]/35 has-[:checked]:bg-[#3B82F6]/10">
              <input
                type="radio"
                name="batchTypeRadio"
                value="claimable"
                checked
                onChange={selectClaimable}
                className="mt-1 border-[#6B7280] text-[#3B82F6] focus:ring-[#3B82F6]"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[#F9FAFB]">Claim link</span>
                  <FintechBadge tone="success">Live</FintechBadge>
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-[#6B7280]">
                  Share a link; recipients join, then you fund.
                </span>
              </span>
            </label>
          </div>
          <div className="mt-10 space-y-2">
            <label htmlFor="name" className={labelClass}>
              Batch name
            </label>
            <FintechInput
              id="name"
              type="text"
              required
              placeholder="e.g. March bonuses"
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
            />
          </div>
          <div className="mt-10 flex justify-end">
            <FintechButton type="button" className="min-h-12 px-8" onClick={() => setStep(2)} disabled={!canGoStep2}>
              Continue
            </FintechButton>
          </div>
        </FintechCard>
      )}

      {step === 2 && (
        <FintechCard interactive={false}>
          <h2 className="text-lg font-semibold tracking-tight text-[#F9FAFB] sm:text-xl">Pool & limits</h2>
          <p className="mt-1 text-sm text-[#6B7280]">Total pool, expiry, and how many people can join.</p>

          <div className="mt-8 space-y-6">
            <p className="text-sm text-[#6B7280]">
              Recipients join with a code until the batch fills or expires. You can adjust per-person amounts after they
              join.
            </p>
            <div>
              <label htmlFor="currency-claimable" className={labelClass}>
                Currency
              </label>
              <FintechInput
                id="currency-claimable"
                type="text"
                value={claimCurrency}
                onChange={(e) => setClaimCurrency(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="totalPoolAmount" className={labelClass}>
                Total pool
              </label>
              <p className="mb-2 text-xs text-[#6B7280]">Spendable: {formatMoney(spendableBalance, currency)}</p>
              <FintechInput
                id="totalPoolAmount"
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="300.00"
                value={claimableTotalPool}
                onChange={(e) => setClaimableTotalPool(e.target.value)}
              />
              {exceedsBalance && (
                <p className="mt-2 text-sm text-[#EF4444]">
                  Exceeds spendable balance ({formatMoney(spendableBalance, currency)}).
                </p>
              )}
            </div>
            <div>
              <label htmlFor="expiresAt" className={labelClass}>
                Expires
              </label>
              <FintechInput
                id="expiresAt"
                type="datetime-local"
                required
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="maxClaims" className={labelClass}>
                Max recipients
              </label>
              <FintechInput
                id="maxClaims"
                type="number"
                min={1}
                required
                placeholder="10"
                value={claimableMaxRecipients}
                onChange={(e) => setClaimableMaxRecipients(e.target.value)}
              />
            </div>
            {totalNum > 0 && (
              <p className="text-sm text-[#9CA3AF]">
                {!maxRecipientsValid
                  ? "Enter max recipients for per-person amount."
                  : evenSplitValid
                    ? `${formatMoney(perRecipient, currency)} each (even split).`
                    : "Total must divide evenly by max recipients to 2 decimal places."}
              </p>
            )}
          </div>

          <div className="mt-10 flex flex-wrap justify-between gap-3">
            <FintechButton type="button" variant="secondary" className="min-h-12" onClick={() => setStep(1)}>
              Back
            </FintechButton>
            <FintechButton type="button" className="min-h-12 px-8" onClick={() => setStep(3)} disabled={!canGoStep3}>
              Continue
            </FintechButton>
          </div>
        </FintechCard>
      )}

      {step === 3 && (
        <FintechCard interactive={false}>
          <h2 className="text-lg font-semibold tracking-tight text-[#F9FAFB] sm:text-xl">Review</h2>
          <p className="mt-1 text-sm text-[#6B7280]">Confirm before creating.</p>
          <dl className="mt-8 space-y-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-[#6B7280]">Name</dt>
              <dd className="font-medium text-[#F9FAFB]">{batchName || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[#6B7280]">Type</dt>
              <dd className="font-medium text-[#F9FAFB]">Claim link</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[#6B7280]">Currency</dt>
              <dd className="font-medium text-[#F9FAFB]">{claimCurrency}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[#6B7280]">Pool</dt>
              <dd className="tabular-nums text-[#F9FAFB]">{formatMoney(totalNum, claimCurrency)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[#6B7280]">Max recipients</dt>
              <dd className="text-[#F9FAFB]">{maxNum || "—"}</dd>
            </div>
          </dl>
          {submitError && <p className="mt-6 text-sm text-[#EF4444]">{submitError}</p>}
          <div className="mt-10 flex flex-wrap justify-between gap-3">
            <FintechButton type="button" variant="secondary" className="min-h-12" onClick={() => setStep(2)}>
              Back
            </FintechButton>
            <FintechButton
              type="submit"
              className="min-h-12 px-8"
              disabled={exceedsBalance || !evenSplitValid || !canSubmitClaimable}
            >
              Create payout
            </FintechButton>
          </div>
        </FintechCard>
      )}
    </form>
  );
}
