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

/** Claim Link, primary live product */
const payoutTypeClaimClasses =
  "flex cursor-pointer gap-4 rounded-2xl border border-[#22C55E]/25 bg-[#22C55E]/[0.08] px-4 py-4 shadow-sm shadow-[#22C55E]/5 transition-colors has-[:checked]:border-[#22C55E]/50 has-[:checked]:bg-[#22C55E]/14";

/** Bulk Send, preview, secondary */
const payoutTypeBulkClasses =
  "flex cursor-pointer gap-4 rounded-2xl border border-white/[0.06] bg-[#0B0F14]/40 px-4 py-3.5 transition-colors has-[:checked]:border-[#3B82F6]/35 has-[:checked]:bg-[#3B82F6]/10";

export function CreateBatchForm({ orgId, createBatch, spendableBalance, currency }: CreateBatchFormProps) {
  const [step, setStep] = useState(1);
  const [batchType, setBatchType] = useState<"standard" | "claimable">("claimable");
  const [batchName, setBatchName] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [claimableTotalPool, setClaimableTotalPool] = useState("");
  const [claimableMaxRecipients, setClaimableMaxRecipients] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<BulkSendPreviewRow[]>([]);

  const poolStr = claimableTotalPool.trim();
  const pool = poolStr === "" ? NaN : Number(claimableTotalPool);
  const poolValid = Number.isFinite(pool) && pool > 0;

  const maxStr = claimableMaxRecipients.trim();
  const recipients = maxStr === "" ? NaN : Number(claimableMaxRecipients);
  const maxRecipientsValid = Number.isFinite(recipients) && Number.isInteger(recipients) && recipients > 0;

  const totalNum = poolValid ? pool : 0;
  const maxNum = maxRecipientsValid ? recipients : 0;
  const exceedsBalance = batchType === "claimable" && poolValid && pool > spendableBalance;
  const claimPoolInputsValid = poolValid && maxRecipientsValid && !exceedsBalance;

  const poolFieldError = poolStr !== "" && !poolValid;
  const maxRecipientsFieldError = maxStr !== "" && !maxRecipientsValid;
  const canSubmitClaimable = batchType !== "claimable" || claimPoolInputsValid;

  const canGoStep2 = batchName.trim().length > 0;
  const canGoStep3 =
    batchType === "claimable"
      ? Boolean(expiresAt.trim()) && claimPoolInputsValid
      : true;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitError(null);
    if (batchType === "claimable" && (!poolValid || !maxRecipientsValid || exceedsBalance)) return;
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
              <label className={payoutTypeClaimClasses}>
                <input
                  type="radio"
                  name="batchTypeRadio"
                  value="claimable"
                  checked={false}
                  onChange={selectClaimable}
                  className="mt-1 border-[#6B7280] text-[#22C55E] focus:ring-[#22C55E]"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold text-[#F9FAFB]">Claim link</span>
                    <FintechBadge tone="success">Live</FintechBadge>
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-[#9CA3AF]">
                    Recipients join, then you fund, wallet payouts are live now.
                  </span>
                </span>
              </label>
              <label className={payoutTypeBulkClasses}>
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
                    <span className="font-semibold text-[#E5E7EB]">Bulk send</span>
                    <FintechBadge tone="info">Preview</FintechBadge>
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-[#6B7280]">
                    Upload a CSV and review how bank payouts will work. Coming soon.
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
      <input type="hidden" name="currency" value={currency} />
      <input type="hidden" name="totalPoolAmount" value={claimableTotalPool} />
      <input type="hidden" name="maxClaims" value={claimableMaxRecipients} />
      <input type="hidden" name="expiresAt" value={expiresAt} />

      {stepIndicator}

      {step === 1 && (
        <FintechCard interactive={false}>
          <h2 className="text-lg font-semibold tracking-tight text-[#F9FAFB] sm:text-xl">Payout type</h2>
          <p className="mt-1 text-sm text-[#6B7280]">Choose how you want to pay people.</p>
          <div className="mt-8 space-y-3">
            <label className={payoutTypeClaimClasses}>
              <input
                type="radio"
                name="batchTypeRadio"
                value="claimable"
                checked
                onChange={selectClaimable}
                className="mt-1 border-[#6B7280] text-[#22C55E] focus:ring-[#22C55E]"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold text-[#F9FAFB]">Claim link</span>
                  <FintechBadge tone="success">Live</FintechBadge>
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-[#9CA3AF]">
                  Share a link; recipients join, then you fund.
                </span>
              </span>
            </label>
            <label className={payoutTypeBulkClasses}>
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
                  <span className="font-semibold text-[#E5E7EB]">Bulk send</span>
                  <FintechBadge tone="info">Preview</FintechBadge>
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-[#6B7280]">
                  Upload a CSV and review how bank payouts will work. Coming soon.
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
              <span className={labelClass}>Currency</span>
              <div className="rounded-xl border border-white/[0.08] bg-[#161F2B] px-4 py-3 text-sm font-medium text-[#F9FAFB]">
                {currency}
              </div>
            </div>
            <div>
              <label htmlFor="totalPoolAmount" className={labelClass}>
                Total pool
              </label>
              <p className="mb-2 text-xs text-[#6B7280]">Spendable: {formatMoney(spendableBalance, currency)}</p>
              <FintechInput
                id="totalPoolAmount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0}
                placeholder="300.00"
                value={claimableTotalPool}
                onChange={(e) => setClaimableTotalPool(e.target.value)}
              />
              {poolFieldError ? (
                <p className="mt-2 text-sm text-[#EF4444]">Enter a valid amount</p>
              ) : null}
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
                inputMode="numeric"
                step={1}
                min={1}
                placeholder="10"
                value={claimableMaxRecipients}
                onChange={(e) => setClaimableMaxRecipients(e.target.value)}
              />
              {maxRecipientsFieldError ? (
                <p className="mt-2 text-sm text-[#EF4444]">Enter a valid number of recipients</p>
              ) : null}
            </div>
            {poolValid && maxRecipientsValid ? (
              <p className="text-sm text-[#9CA3AF]">Amounts will be split automatically across recipients.</p>
            ) : null}
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
              <dd className="font-medium text-[#F9FAFB]">{batchName || "-"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[#6B7280]">Type</dt>
              <dd className="font-medium text-[#F9FAFB]">Claim link</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[#6B7280]">Currency</dt>
              <dd className="font-medium text-[#F9FAFB]">{currency}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[#6B7280]">Pool</dt>
              <dd className="tabular-nums text-[#F9FAFB]">{formatMoney(totalNum, currency)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[#6B7280]">Max recipients</dt>
              <dd className="text-[#F9FAFB]">{maxNum || "-"}</dd>
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
              disabled={exceedsBalance || !canSubmitClaimable}
            >
              Create payout
            </FintechButton>
          </div>
        </FintechCard>
      )}
    </form>
  );
}
