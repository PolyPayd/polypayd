"use client";

import { useState } from "react";
import { retryFailed } from "./actions";

type Props = { orgId: string; batchId: string };

export function RetryFailedButton({ orgId, batchId }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      await retryFailed(batchId, orgId);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="rounded-lg border border-neutral-800 px-3 py-2 text-sm hover:border-neutral-700 disabled:opacity-50"
    >
      {loading ? "Retrying…" : "Retry Failed"}
    </button>
  );
}
