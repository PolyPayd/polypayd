"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  orgId: string;
  batchId: string;
  disabled?: boolean;
};

export function UploadCsvButton({ orgId, batchId, disabled = false }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  async function onFileSelected() {
    const file = fileInputRef.current?.files?.[0];
    if (!file || disabled || loading) return;

    setLoading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);

      const res = await fetch(`/api/orgs/${orgId}/batches/${batchId}/upload-csv`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? data.message ?? `Upload failed (${res.status})`);
        return;
      }

      router.refresh();
    } catch (e: any) {
      alert(e?.message ?? "Upload failed");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
      setLoading(false);
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        disabled={disabled || loading}
        onChange={() => void onFileSelected()}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled || loading}
        className="rounded-lg border border-neutral-800 px-3 py-2 text-sm hover:border-neutral-700 disabled:opacity-50"
      >
        {loading ? "Uploading..." : "Upload CSV"}
      </button>
    </>
  );
}

