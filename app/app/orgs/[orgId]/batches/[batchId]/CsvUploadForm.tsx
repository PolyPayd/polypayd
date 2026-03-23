"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Props = { orgId: string; batchId: string; openPicker?: boolean };
type ExtendedProps = Props & { disabled?: boolean };

export function CsvUploadForm({ orgId, batchId, openPicker, disabled = false }: ExtendedProps) {
  const router = useRouter();
  const pathname = usePathname();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const baseUrl = `/api/orgs/${orgId}/batches/${batchId}/upload-csv`;

  useEffect(() => {
    if (disabled) return;
    if (!openPicker) return;
    fileInputRef.current?.click();
    router.replace(`${pathname}?tab=uploads`);
  }, [disabled, openPicker, pathname, router]);

  async function handleUpload() {
    if (disabled) {
      setMessage({ type: "err", text: "Completed Bulk Sends cannot be edited." });
      return;
    }

    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setMessage({ type: "err", text: "Please select a CSV file." });
      return;
    }

    setMessage(null);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.set("file", file);

      const res = await fetch(baseUrl, {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMessage({
          type: "err",
          text: data.error ?? data.message ?? `Upload failed (${res.status})`,
        });
        return;
      }

      setMessage({
        type: "ok",
        text: `Uploaded ${data.validCount ?? 0} valid, ${data.invalidCount ?? 0} invalid of ${data.rowCount ?? 0} rows.`,
      });
      router.refresh();
    } catch (e: any) {
      setMessage({ type: "err", text: e?.message ?? "Network error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4 border-b border-neutral-800 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-sm font-medium text-neutral-400 mb-1">CSV file</label>
          <p className="text-xs text-neutral-500 mb-2">Selecting a file validates and imports valid rows automatically.</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            disabled={disabled || !!loading}
            onChange={() => void handleUpload()}
            className="block w-full max-w-xs text-sm text-neutral-300 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-800 file:px-3 file:py-2 file:text-sm file:text-white"
          />
        </div>
        {loading ? <div className="text-sm text-neutral-400">Validating and importing...</div> : null}
      </div>
      {disabled && (
        <p className="text-sm text-amber-300">
          This Bulk Send is completed and read-only. Create a new Bulk Send to upload another CSV.
        </p>
      )}
      {message && (
        <p
          className={`text-sm ${message.type === "ok" ? "text-emerald-400" : "text-red-400"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
