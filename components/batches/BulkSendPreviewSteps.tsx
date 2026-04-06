"use client";

import type { Dispatch, SetStateAction } from "react";
import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FintechButton, FintechCard } from "@/components/fintech";
import {
  BULK_SEND_DEMO_CSV,
  parseBulkSendPreviewCsv,
  summarizeBulkSendPreviewRows,
  type BulkSendPreviewRow,
} from "@/lib/bulkSendPreviewCsv";

function formatMoney(amount: number, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
}

type Props = {
  step: 2 | 3 | 4;
  setStep: Dispatch<SetStateAction<number>>;
  batchName: string;
  currency: string;
  rows: BulkSendPreviewRow[];
  setRows: React.Dispatch<React.SetStateAction<BulkSendPreviewRow[]>>;
};

export function BulkSendPreviewSteps({ step, setStep, batchName, currency, rows, setRows }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const applyParsed = useCallback(
    (text: string) => {
      const { rows: next, error } = parseBulkSendPreviewCsv(text);
      if (error) {
        setParseError(error);
        return;
      }
      setParseError(null);
      setRows(next);
    },
    [setRows]
  );

  const onPickFile = () => fileRef.current?.click();

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      applyParsed(text);
    };
    reader.onerror = () => setParseError("Could not read file.");
    reader.readAsText(file, "UTF-8");
  };

  const loadDemo = () => {
    setParseError(null);
    applyParsed(BULK_SEND_DEMO_CSV);
  };

  const downloadSample = () => {
    const blob = new Blob([BULK_SEND_DEMO_CSV], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "polypayd-bulk-send-sample.csv";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const { recipientCount, invalidCount, validTotal } = summarizeBulkSendPreviewRows(rows);

  if (step === 2) {
    return (
      <FintechCard interactive={false}>
        <h2 className="text-lg font-semibold tracking-tight text-[#F9FAFB] sm:text-xl">Upload CSV</h2>
        <p className="mt-1 text-sm text-[#6B7280]">
          Add a file with recipient_name, account_number, sort_code, and amount — or try the demo dataset.
        </p>

        <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={onFileChange} />

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <FintechButton type="button" className="min-h-12" onClick={onPickFile}>
            Upload CSV
          </FintechButton>
          <FintechButton type="button" variant="secondary" className="min-h-12" onClick={loadDemo}>
            Use demo CSV
          </FintechButton>
          <FintechButton type="button" variant="secondary" className="min-h-12" onClick={downloadSample}>
            Download sample CSV
          </FintechButton>
        </div>

        {parseError ? <p className="mt-4 text-sm text-[#FCA5A5]">{parseError}</p> : null}
        {!parseError && rows.length > 0 ? (
          <p className="mt-4 text-sm text-[#86EFAC]">{rows.length} row{rows.length === 1 ? "" : "s"} loaded. Continue to review.</p>
        ) : null}

        <div className="mt-10 flex flex-wrap justify-between gap-3">
          <FintechButton type="button" variant="secondary" className="min-h-12" onClick={() => setStep(1)}>
            Back
          </FintechButton>
          <FintechButton type="button" className="min-h-12 px-8" onClick={() => setStep(3)} disabled={rows.length === 0}>
            Continue
          </FintechButton>
        </div>
      </FintechCard>
    );
  }

  if (step === 3) {
    return (
      <FintechCard interactive={false}>
        <h2 className="text-lg font-semibold tracking-tight text-[#F9FAFB] sm:text-xl">Review recipients</h2>
        <p className="mt-1 text-sm text-[#6B7280]">
          Check names, bank details, and amounts. Rows with missing fields or invalid amounts need review.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0B0F14]/55 px-4 py-3">
            <p className="text-xs font-medium text-[#6B7280]">Recipients</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-[#F9FAFB]">{recipientCount}</p>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-[#0B0F14]/55 px-4 py-3">
            <p className="text-xs font-medium text-[#6B7280]">Total (valid rows)</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-[#F9FAFB]">{formatMoney(validTotal, currency)}</p>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-[#0B0F14]/55 px-4 py-3">
            <p className="text-xs font-medium text-[#6B7280]">Needs review</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-[#F9FAFB]">{invalidCount}</p>
          </div>
        </div>

        <div className="mt-8 hidden overflow-x-auto md:block">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] text-xs font-medium uppercase tracking-wide text-[#6B7280]">
                <th className="pb-3 pr-4 font-medium">Recipient</th>
                <th className="pb-3 pr-4 font-medium">Account</th>
                <th className="pb-3 pr-4 font-medium">Sort code</th>
                <th className="pb-3 pr-4 font-medium">Amount</th>
                <th className="pb-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="text-[#E5E7EB]">
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-white/[0.06]">
                  <td className="py-3 pr-4 font-medium text-[#F9FAFB]">{r.recipient_name || "—"}</td>
                  <td className="py-3 pr-4 tabular-nums">{r.account_number || "—"}</td>
                  <td className="py-3 pr-4 tabular-nums">{r.sort_code || "—"}</td>
                  <td className="py-3 pr-4 tabular-nums">{formatMoney(r.amount, currency)}</td>
                  <td className="py-3">
                    <span
                      className={
                        r.status === "Valid"
                          ? "rounded-full border border-[#22C55E]/25 bg-[#22C55E]/10 px-2.5 py-0.5 text-xs font-medium text-[#86EFAC]"
                          : "rounded-full border border-[#F59E0B]/25 bg-[#F59E0B]/10 px-2.5 py-0.5 text-xs font-medium text-[#FCD34D]"
                      }
                    >
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 space-y-3 md:hidden">
          {rows.map((r) => (
            <div
              key={r.id}
              className="rounded-2xl border border-white/[0.08] bg-[#0B0F14]/55 px-4 py-3 text-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold text-[#F9FAFB]">{r.recipient_name || "—"}</p>
                <span
                  className={
                    r.status === "Valid"
                      ? "shrink-0 rounded-full border border-[#22C55E]/25 bg-[#22C55E]/10 px-2 py-0.5 text-xs font-medium text-[#86EFAC]"
                      : "shrink-0 rounded-full border border-[#F59E0B]/25 bg-[#F59E0B]/10 px-2 py-0.5 text-xs font-medium text-[#FCD34D]"
                  }
                >
                  {r.status}
                </span>
              </div>
              <dl className="mt-3 space-y-2 text-[#9CA3AF]">
                <div className="flex justify-between gap-4">
                  <dt>Account</dt>
                  <dd className="tabular-nums text-[#E5E7EB]">{r.account_number || "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Sort code</dt>
                  <dd className="tabular-nums text-[#E5E7EB]">{r.sort_code || "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Amount</dt>
                  <dd className="tabular-nums font-medium text-[#F9FAFB]">{formatMoney(r.amount, currency)}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap justify-between gap-3">
          <FintechButton type="button" variant="secondary" className="min-h-12" onClick={() => setStep(2)}>
            Back
          </FintechButton>
          <FintechButton type="button" className="min-h-12 px-8" onClick={() => setStep(4)}>
            Continue
          </FintechButton>
        </div>
      </FintechCard>
    );
  }

  // step === 4
  return (
    <FintechCard interactive={false}>
      <h2 className="text-lg font-semibold tracking-tight text-[#F9FAFB] sm:text-xl">Preview outcome</h2>
      <p className="mt-1 text-sm text-[#6B7280]">What this batch would look like before live bank payouts exist.</p>

      <div className="mt-6 rounded-2xl border border-[#3B82F6]/20 bg-[#3B82F6]/10 px-4 py-3 text-sm leading-relaxed text-[#BFDBFE]">
        <p className="font-medium text-[#F9FAFB]">Preview mode</p>
        <p className="mt-2 text-[#93C5FD]">
          Bulk Send is currently in preview. Live bank transfers are not enabled yet. Claim Link payouts are live now.
        </p>
      </div>

      <dl className="mt-8 space-y-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-[#6B7280]">Batch name</dt>
          <dd className="max-w-[60%] text-right font-medium text-[#F9FAFB]">{batchName || "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-[#6B7280]">Currency</dt>
          <dd className="font-medium text-[#F9FAFB]">{currency}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-[#6B7280]">Total recipients</dt>
          <dd className="font-medium tabular-nums text-[#F9FAFB]">{recipientCount}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-[#6B7280]">Total amount (valid rows)</dt>
          <dd className="font-medium tabular-nums text-[#F9FAFB]">{formatMoney(validTotal, currency)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-[#6B7280]">Validation</dt>
          <dd className="font-medium text-[#F9FAFB]">
            {invalidCount === 0 ? "All rows valid" : `${invalidCount} row${invalidCount === 1 ? "" : "s"} need review`}
          </dd>
        </div>
      </dl>

      <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-between">
        <FintechButton type="button" variant="secondary" className="min-h-12 w-full sm:w-auto" onClick={() => setStep(3)}>
          Back
        </FintechButton>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <FintechButton
            type="button"
            variant="ghost"
            className="min-h-12 w-full sm:w-auto"
            onClick={() => {
              toast.message("Thanks — we will let you know when Bulk Send is live.", {
                description: "Claim Link payouts are available today from New payout.",
              });
            }}
          >
            Notify me when Bulk Send goes live
          </FintechButton>
          <FintechButton
            type="button"
            className="min-h-12 w-full px-8 sm:w-auto"
            onClick={() => router.push("/app/batches")}
          >
            Finish preview
          </FintechButton>
        </div>
      </div>
    </FintechCard>
  );
}
