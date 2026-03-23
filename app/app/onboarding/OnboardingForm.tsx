"use client";

import { useActionState } from "react";

const inputClass =
  "w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-white/30";
const labelClass = "mb-2 block text-sm font-medium text-neutral-300";

type CreateOrgState = { error?: string };
type CreateOrgAction = (prev: CreateOrgState | null, formData: FormData) => Promise<CreateOrgState>;

type Props = {
  createOrgAndRedirect: CreateOrgAction;
};

export function OnboardingForm({ createOrgAndRedirect }: Props) {
  const [state, formAction, isPending] = useActionState<CreateOrgState | null, FormData>(
    createOrgAndRedirect,
    null
  );

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="name" className={labelClass}>
          Organisation name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          minLength={2}
          className={inputClass}
          placeholder="e.g. Acme Ltd"
          disabled={isPending}
        />
      </div>
      {state?.error && (
        <p className="text-sm text-red-400">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-50"
      >
        {isPending ? "Creating…" : "Create and continue"}
      </button>
    </form>
  );
}
