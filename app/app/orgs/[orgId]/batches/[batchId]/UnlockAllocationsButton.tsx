"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { unlockAllocations, type UnlockAllocationsState } from "./actions";

function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-neutral-600 px-3 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
    >
      {pending ? "Unlocking…" : "Unlock payouts"}
    </button>
  );
}

type Props = { orgId: string; batchId: string };

export function UnlockAllocationsButton({ orgId, batchId }: Props) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<UnlockAllocationsState | null, FormData>(unlockAllocations, null);

  useEffect(() => {
    if (state?.success) {
      router.refresh();
    }
  }, [state?.success, router]);

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="orgId" value={orgId} readOnly />
      <input type="hidden" name="batchId" value={batchId} readOnly />
      <SubmitButton pending={isPending} />
      {state?.error && <p className="text-xs text-red-400">{state.error}</p>}
    </form>
  );
}
