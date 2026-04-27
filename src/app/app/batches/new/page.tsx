"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Plus, X, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { calculateFee } from "@/src/lib/fees";
import type { KycStatus } from "@/src/lib/db/types";

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = "polypay_batch_draft";

function pence(gbp: string): number {
  return Math.round(parseFloat(gbp || "0") * 100);
}

function formatGbp(p: number): string {
  return `£${(p / 100).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BatchDraft = {
  name: string;
  description: string;
  mode: "equal_shares" | "custom_amounts";
  closing_mode: "close_when_full" | "manual_close";
  total_amount_gbp: string;
  max_recipients: string;
  recipients: { label: string; amount_gbp: string }[];
};

const DEFAULT_DRAFT: BatchDraft = {
  name: "",
  description: "",
  mode: "equal_shares",
  closing_mode: "close_when_full",
  total_amount_gbp: "",
  max_recipients: "",
  recipients: [{ label: "", amount_gbp: "" }],
};

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const step1Schema = z.object({
  name: z.string().min(1, "Required").max(80, "Max 80 characters"),
  description: z.string().max(300, "Max 300 characters").optional(),
  mode: z.enum(["equal_shares", "custom_amounts"]),
  closing_mode: z.enum(["close_when_full", "manual_close"]),
});

const equalSharesSchema = z.object({
  total_amount_gbp: z
    .string()
    .min(1, "Required")
    .refine((v) => {
      const n = parseFloat(v);
      return !isNaN(n) && n >= 0.01 && n <= 10000;
    }, "Must be between £0.01 and £10,000"),
  max_recipients: z
    .number({ error: "Required" })
    .int()
    .min(2, "Minimum 2 recipients")
    .max(100, "Maximum 100 recipients"),
});

const customAmountsSchema = z.object({
  recipients: z
    .array(
      z.object({
        label: z.string().max(120),
        amount_gbp: z
          .string()
          .min(1, "Required")
          .refine((v) => {
            const n = parseFloat(v);
            return !isNaN(n) && n >= 0.01;
          }, "Must be at least £0.01"),
      })
    )
    .min(1, "Add at least one recipient")
    .max(50, "Maximum 50 recipients"),
});

type Step1Values = z.infer<typeof step1Schema>;
type EqualSharesValues = z.infer<typeof equalSharesSchema>;
type CustomAmountsValues = z.infer<typeof customAmountsSchema>;

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="mb-8 flex items-center gap-3">
      {Array.from({ length: total }).map((_, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <div key={n} className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                active && "bg-fp-accent text-white",
                done && "bg-fp-accent/30 text-fp-accent",
                !active && !done && "bg-white/10 text-fp-text-muted"
              )}
            >
              {n}
            </div>
            {n < total && (
              <div
                className={cn(
                  "h-px w-8 transition-colors",
                  done ? "bg-fp-accent/40" : "bg-white/10"
                )}
              />
            )}
          </div>
        );
      })}
      <span className="ml-1 text-sm text-fp-text-secondary">
        Step {current} of {total}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Segmented toggle
// ---------------------------------------------------------------------------

function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-white/10">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex-1 px-4 py-2 text-sm font-medium transition-colors",
            value === opt.value
              ? "bg-fp-accent text-white"
              : "text-fp-text-secondary hover:bg-white/5 hover:text-fp-text"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form field wrapper
// ---------------------------------------------------------------------------

function Field({
  label,
  error,
  children,
  hint,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-fp-text">{label}</label>
      {children}
      {hint && !error && (
        <p className="text-xs text-fp-text-muted">{hint}</p>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

function TextInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-lg border border-white/10 bg-fp-elevated px-3 text-sm text-fp-text",
        "placeholder:text-fp-text-muted focus:outline-none focus:ring-2 focus:ring-fp-accent/40 focus:border-fp-accent/60",
        "disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

function TextArea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-lg border border-white/10 bg-fp-elevated px-3 py-2 text-sm text-fp-text",
        "placeholder:text-fp-text-muted focus:outline-none focus:ring-2 focus:ring-fp-accent/40 focus:border-fp-accent/60",
        "resize-none disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

function PrimaryButton({
  children,
  loading,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-fp-accent px-6 text-sm font-semibold text-white",
        "transition-colors hover:bg-fp-accent/90 disabled:cursor-not-allowed disabled:opacity-50",
        props.className
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

function GhostButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-medium text-fp-text-secondary",
        "transition-colors hover:bg-white/5 hover:text-fp-text",
        props.className
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// KYC modal
// ---------------------------------------------------------------------------

function KycModal({
  open,
  onClose,
  onSimulateSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSimulateSuccess: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Verify your identity to continue</DialogTitle>
          <DialogDescription>
            UK regulations require us to verify your identity before you can
            fund a batch. This takes about 2 minutes.
          </DialogDescription>
        </DialogHeader>

        {/* Persona placeholder */}
        <div className="rounded-lg border border-white/10 p-4 text-sm text-fp-text-secondary">
          Persona KYC widget — placeholder until credentials are configured.{" "}
          <button
            onClick={onSimulateSuccess}
            className="underline text-fp-accent hover:text-fp-accent/80"
          >
            Simulate success
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Basics
// ---------------------------------------------------------------------------

function Step1({
  defaultValues,
  onSubmit,
  onBack,
}: {
  defaultValues: Step1Values;
  onSubmit: (data: Step1Values) => void;
  onBack: () => void;
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<Step1Values>({
    resolver: zodResolver(step1Schema),
    defaultValues,
  });

  const mode = watch("mode");
  const closingMode = watch("closing_mode");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-fp-text">New batch</h1>
        <p className="mt-1 text-sm text-fp-text-secondary">
          Start by giving your batch a name and choosing how it works.
        </p>
      </div>

      <Field label="Batch name" error={errors.name?.message}>
        <TextInput
          {...register("name")}
          placeholder="e.g. Team lunch reimbursement"
          maxLength={80}
        />
      </Field>

      <Field
        label="Description"
        error={errors.description?.message}
        hint="Optional — visible to you only"
      >
        <TextArea
          {...register("description")}
          placeholder="Add a note for your own records"
          rows={3}
          maxLength={300}
        />
      </Field>

      <Field label="Payment mode">
        <SegmentedToggle
          options={[
            { label: "Equal shares", value: "equal_shares" },
            { label: "Custom amounts", value: "custom_amounts" },
          ]}
          value={mode}
          onChange={(v) => setValue("mode", v)}
        />
      </Field>

      <Field label="Closing mode">
        <SegmentedToggle
          options={[
            { label: "Close when full", value: "close_when_full" },
            { label: "I'll close manually", value: "manual_close" },
          ]}
          value={closingMode}
          onChange={(v) => setValue("closing_mode", v)}
        />
      </Field>

      <div className="flex gap-3 pt-2">
        <GhostButton type="button" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Back
        </GhostButton>
        <PrimaryButton type="submit">Continue</PrimaryButton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Step 2a — Equal shares
// ---------------------------------------------------------------------------

function Step2Equal({
  defaultValues,
  onSubmit,
  onBack,
}: {
  defaultValues: EqualSharesValues;
  onSubmit: (data: EqualSharesValues) => void;
  onBack: () => void;
}) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<EqualSharesValues>({
    resolver: zodResolver(equalSharesSchema),
    defaultValues,
  });

  const totalGbp = watch("total_amount_gbp");
  const maxR = watch("max_recipients");

  const totalPence = pence(String(totalGbp));
  const count = Number(maxR) || 0;
  const perRecipient = count > 0 ? Math.floor(totalPence / count) : 0;
  const remainder = count > 0 ? totalPence - perRecipient * count : 0;
  const aboveWarning = totalPence > 500_000;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-fp-text">Set the amount</h1>
        <p className="mt-1 text-sm text-fp-text-secondary">
          Enter the total to pay out and how many recipients will share it.
        </p>
      </div>

      <Field
        label="Total amount (£)"
        error={errors.total_amount_gbp?.message}
      >
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-fp-text-muted">
            £
          </span>
          <TextInput
            {...register("total_amount_gbp")}
            type="number"
            step="0.01"
            min="0.01"
            max="10000"
            placeholder="0.00"
            className="pl-7"
          />
        </div>
        {aboveWarning && (
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Batches above £5,000 may require additional review.
          </div>
        )}
      </Field>

      <Field
        label="Maximum recipients"
        error={errors.max_recipients?.message}
        hint="Between 2 and 100"
      >
        <TextInput
          {...register("max_recipients", { valueAsNumber: true })}
          type="number"
          min={2}
          max={100}
          placeholder="e.g. 10"
        />
      </Field>

      {/* Live per-recipient preview */}
      {perRecipient > 0 && (
        <div className="rounded-lg border border-white/10 bg-fp-elevated p-4">
          <p className="text-sm font-medium text-fp-text">
            Each recipient gets{" "}
            <span className="text-fp-accent">{formatGbp(perRecipient)}</span>
          </p>
          {remainder > 0 && (
            <p className="mt-1 text-xs text-fp-text-muted">
              Remaining {formatGbp(remainder)} stays in the batch until
              approval.
            </p>
          )}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <GhostButton type="button" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Back
        </GhostButton>
        <PrimaryButton type="submit">Continue</PrimaryButton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Step 2b — Custom amounts
// ---------------------------------------------------------------------------

function Step2Custom({
  defaultValues,
  onSubmit,
  onBack,
}: {
  defaultValues: CustomAmountsValues;
  onSubmit: (data: CustomAmountsValues) => void;
  onBack: () => void;
}) {
  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<CustomAmountsValues>({
    resolver: zodResolver(customAmountsSchema),
    defaultValues,
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "recipients",
  });

  const recipients = watch("recipients");
  const total = recipients.reduce((sum, r) => sum + pence(r.amount_gbp), 0);

  const tooMany = fields.length > 50;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-fp-text">Set recipient amounts</h1>
        <p className="mt-1 text-sm text-fp-text-secondary">
          Add each recipient and their individual amount.
        </p>
      </div>

      {tooMany && (
        <p className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
          Maximum 50 recipients allowed.
        </p>
      )}

      {/* Table header */}
      <div className="grid grid-cols-[1fr_120px_40px] gap-2 pb-1">
        <span className="text-xs font-medium text-fp-text-muted">
          Recipient label
        </span>
        <span className="text-xs font-medium text-fp-text-muted">
          Amount (£)
        </span>
        <span />
      </div>

      <div className="flex flex-col gap-2">
        {fields.map((field, i) => (
          <div
            key={field.id}
            className="grid grid-cols-[1fr_120px_40px] items-start gap-2"
          >
            <div>
              <TextInput
                {...register(`recipients.${i}.label`)}
                placeholder="e.g. Alice"
              />
              {errors.recipients?.[i]?.label && (
                <p className="mt-1 text-xs text-red-400">
                  {errors.recipients[i]?.label?.message}
                </p>
              )}
            </div>
            <div>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-fp-text-muted">
                  £
                </span>
                <TextInput
                  {...register(`recipients.${i}.amount_gbp`)}
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  className="pl-7"
                />
              </div>
              {errors.recipients?.[i]?.amount_gbp && (
                <p className="mt-1 text-xs text-red-400">
                  {errors.recipients[i]?.amount_gbp?.message}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => fields.length > 1 && remove(i)}
              disabled={fields.length === 1}
              className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-lg text-fp-text-muted transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => append({ label: "", amount_gbp: "" })}
        disabled={fields.length >= 50}
        className="inline-flex h-9 items-center gap-2 self-start rounded-lg border border-white/10 px-4 text-sm text-fp-text-secondary transition-colors hover:bg-white/5 hover:text-fp-text disabled:opacity-40"
      >
        <Plus className="h-4 w-4" /> Add recipient
      </button>

      {/* Running total */}
      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-fp-elevated px-4 py-3">
        <span className="text-sm text-fp-text-secondary">Total</span>
        <span className="font-semibold text-fp-text">{formatGbp(total)}</span>
      </div>

      <div className="flex gap-3 pt-2">
        <GhostButton type="button" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Back
        </GhostButton>
        <PrimaryButton type="submit">Continue</PrimaryButton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Review
// ---------------------------------------------------------------------------

function feeComponents(totalPence: number, recipientCount: number) {
  const flat = 100;
  const percent = Math.floor(totalPence / 100);
  const perRecip = 30 * recipientCount;
  const subtotal = flat + percent + perRecip;
  const total = Math.max(subtotal, 200);
  return { flat, percent, perRecip, total };
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/[0.06] last:border-0">
      <span className="text-sm text-fp-text-secondary">{label}</span>
      <span className="text-sm font-medium text-fp-text">{value}</span>
    </div>
  );
}

function Step3Review({
  draft,
  onBack,
  onSubmit,
  submitting,
}: {
  draft: BatchDraft;
  onBack: () => void;
  onSubmit: () => Promise<void>;
  submitting: boolean;
}) {
  const isCustom = draft.mode === "custom_amounts";
  const totalPence = isCustom
    ? draft.recipients.reduce((s, r) => s + pence(r.amount_gbp), 0)
    : pence(draft.total_amount_gbp);
  const recipientCount = isCustom
    ? draft.recipients.length
    : Number(draft.max_recipients) || 0;

  const fee = feeComponents(totalPence, recipientCount);
  const totalCharge = totalPence + fee.total;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-fp-text">Review &amp; fund</h1>
        <p className="mt-1 text-sm text-fp-text-secondary">
          Check the details before sending to your bank.
        </p>
      </div>

      {/* Batch details */}
      <div className="rounded-xl border border-white/[0.06] bg-fp-surface px-5">
        <ReviewRow label="Batch name" value={draft.name} />
        {draft.description && (
          <ReviewRow label="Description" value={draft.description} />
        )}
        <ReviewRow
          label="Mode"
          value={draft.mode === "equal_shares" ? "Equal shares" : "Custom amounts"}
        />
        <ReviewRow
          label="Closing"
          value={
            draft.closing_mode === "close_when_full"
              ? "Close when full"
              : "Manual close"
          }
        />
        <ReviewRow
          label={isCustom ? "Recipients" : "Max recipients"}
          value={String(recipientCount)}
        />
        <ReviewRow label="Total amount" value={formatGbp(totalPence)} />
      </div>

      {/* Fee breakdown */}
      <div>
        <p className="mb-2 text-sm font-medium text-fp-text">Fee breakdown</p>
        <div className="rounded-xl border border-white/[0.06] bg-fp-surface px-5">
          <ReviewRow label="Flat fee" value={formatGbp(fee.flat)} />
          <ReviewRow
            label={`1% of ${formatGbp(totalPence)}`}
            value={formatGbp(fee.percent)}
          />
          <ReviewRow
            label={`£0.30 × ${recipientCount} recipients`}
            value={formatGbp(fee.perRecip)}
          />
          <ReviewRow
            label="Total fee (min £2.00)"
            value={formatGbp(fee.total)}
          />
        </div>
      </div>

      {/* Total charge */}
      <div className="flex items-center justify-between rounded-xl border border-fp-accent/30 bg-fp-accent/10 px-5 py-4">
        <span className="font-semibold text-fp-text">Total to fund</span>
        <span className="text-lg font-bold text-fp-accent">
          {formatGbp(totalCharge)}
        </span>
      </div>

      <div className="flex gap-3 pt-2">
        <GhostButton type="button" onClick={onBack} disabled={submitting}>
          <ArrowLeft className="h-4 w-4" /> Back
        </GhostButton>
        <PrimaryButton onClick={onSubmit} loading={submitting}>
          Fund this batch with Open Banking
        </PrimaryButton>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function NewBatchPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [draft, setDraft] = useState<BatchDraft>(DEFAULT_DRAFT);
  const [kycStatus, setKycStatus] = useState<KycStatus>("none");
  const [showKycModal, setShowKycModal] = useState(false);
  const [pendingStep1, setPendingStep1] = useState<Step1Values | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Load draft from sessionStorage on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) setDraft(JSON.parse(saved) as BatchDraft);
    } catch {}
  }, []);

  // Fetch current user KYC status
  useEffect(() => {
    fetch("/api/app/me")
      .then((r) => r.json())
      .then((data: { user?: { kyc_status: KycStatus } }) => {
        if (data.user?.kyc_status) setKycStatus(data.user.kyc_status);
      })
      .catch(() => {});
  }, []);

  // Persist draft to sessionStorage whenever it changes
  const saveDraft = useCallback((d: BatchDraft) => {
    setDraft(d);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    } catch {}
  }, []);

  // Step 1 → KYC gate → Step 2
  function handleStep1Submit(data: Step1Values) {
    const updated = { ...draft, ...data };
    saveDraft(updated);

    if (kycStatus !== "verified") {
      setPendingStep1(data);
      setShowKycModal(true);
    } else {
      setStep(2);
    }
  }

  function handleKycSimulateSuccess() {
    setKycStatus("verified");
    setShowKycModal(false);
    if (pendingStep1) {
      saveDraft({ ...draft, ...pendingStep1 });
      setPendingStep1(null);
    }
    setStep(2);
  }

  // Step 2 equal shares
  function handleEqualSharesSubmit(data: EqualSharesValues) {
    saveDraft({
      ...draft,
      total_amount_gbp: String(data.total_amount_gbp),
      max_recipients:   String(data.max_recipients),
    });
    setStep(3);
  }

  // Step 2 custom amounts
  function handleCustomAmountsSubmit(data: CustomAmountsValues) {
    saveDraft({ ...draft, recipients: data.recipients });
    setStep(3);
  }

  // Step 3 → API → redirect
  async function handleSubmit() {
    setSubmitting(true);
    try {
      const isCustom = draft.mode === "custom_amounts";
      const totalPence = isCustom
        ? draft.recipients.reduce((s, r) => s + pence(r.amount_gbp), 0)
        : pence(draft.total_amount_gbp);
      const maxRecipients = isCustom
        ? draft.recipients.length
        : Number(draft.max_recipients);

      const body = {
        name:           draft.name,
        description:    draft.description || undefined,
        mode:           draft.mode,
        closing_mode:   draft.closing_mode,
        total_pence:    totalPence,
        max_recipients: maxRecipients,
        ...(isCustom && {
          recipients: draft.recipients.map((r) => ({
            label:        r.label,
            amount_pence: pence(r.amount_gbp),
          })),
        }),
      };

      const res = await fetch("/api/app/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Failed to create batch");
      }

      const { batchId } = (await res.json()) as { batchId: string };

      // Clear draft on success
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {}

      router.push(`/app/batches/${batchId}`);
    } catch (err) {
      console.error("[new-batch] submit failed:", err);
      setSubmitting(false);
    }
  }

  const step1Defaults: Step1Values = {
    name:         draft.name,
    description:  draft.description,
    mode:         draft.mode,
    closing_mode: draft.closing_mode,
  };

  const equalDefaults: EqualSharesValues = {
    total_amount_gbp: draft.total_amount_gbp,
    max_recipients:   Number(draft.max_recipients) || (2 as unknown as number),
  };

  const customDefaults: CustomAmountsValues = {
    recipients: draft.recipients.length ? draft.recipients : [{ label: "", amount_gbp: "" }],
  };

  return (
    <>
      {/* Full-screen funding overlay */}
      {submitting && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-fp-bg/90 backdrop-blur-sm">
          <Loader2 className="h-8 w-8 animate-spin text-fp-accent" />
          <p className="text-sm font-medium text-fp-text-secondary">
            Redirecting to your bank…
          </p>
        </div>
      )}

      <div className="mx-auto max-w-xl px-4 py-10 sm:px-8">
        <StepIndicator current={step} total={3} />

        {step === 1 && (
          <Step1
            defaultValues={step1Defaults}
            onSubmit={handleStep1Submit}
            onBack={() => router.push("/app")}
          />
        )}

        {step === 2 && draft.mode === "equal_shares" && (
          <Step2Equal
            defaultValues={equalDefaults}
            onSubmit={handleEqualSharesSubmit}
            onBack={() => setStep(1)}
          />
        )}

        {step === 2 && draft.mode === "custom_amounts" && (
          <Step2Custom
            defaultValues={customDefaults}
            onSubmit={handleCustomAmountsSubmit}
            onBack={() => setStep(1)}
          />
        )}

        {step === 3 && (
          <Step3Review
            draft={draft}
            onBack={() => setStep(2)}
            onSubmit={handleSubmit}
            submitting={submitting}
          />
        )}
      </div>

      <KycModal
        open={showKycModal}
        onClose={() => setShowKycModal(false)}
        onSimulateSuccess={handleKycSimulateSuccess}
      />
    </>
  );
}
