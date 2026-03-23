"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { replaceBulkSendUpload } from "./actions";

type Props = {
  orgId: string;
  batchId: string;
};

export function ReplaceCsvButton({ orgId, batchId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  function onReplaceClick() {
    setMessage(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("orgId", orgId);
      formData.set("batchId", batchId);

      const result = await replaceBulkSendUpload(formData);
      if (!result?.ok) {
        setMessage({ type: "err", text: result?.error ?? "Replace CSV failed" });
        return;
      }

      setMessage({ type: "ok", text: "Upload cleared. You can upload a corrected CSV now." });
      router.refresh();
    });
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={onReplaceClick}
        disabled={isPending}
        className="w-full rounded-lg border border-amber-800 px-3 py-2 text-sm hover:border-amber-700 disabled:opacity-60"
      >
        {isPending ? "Clearing..." : "Replace CSV"}
      </button>
      <div className="mt-2 text-xs text-amber-300/90">
        This clears the current upload and resets derived items for this Bulk Send.
      </div>
      {message && (
        <div className={`mt-2 text-xs ${message.type === "ok" ? "text-emerald-400" : "text-red-400"}`}>
          {message.text}
        </div>
      )}
    </div>
  );
}

