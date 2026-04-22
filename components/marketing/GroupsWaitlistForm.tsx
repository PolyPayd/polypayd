"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/cn";

type FieldErrors = Partial<Record<"fullName" | "email" | "useCase" | "frequency", string>>;

const FREQUENCY_OPTIONS = [
  { value: "", label: "Choose one" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "few-times-year", label: "A few times a year" },
  { value: "one-off", label: "Just one-off payouts" },
  { value: "not-sure", label: "Not sure yet" },
] as const;

export function GroupsWaitlistForm({ id = "waitlist" }: { id?: string }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [useCase, setUseCase] = useState("");
  const [frequency, setFrequency] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle");

  const validate = useCallback((): boolean => {
    const next: FieldErrors = {};
    if (!fullName.trim()) next.fullName = "Please tell us your name.";
    const em = email.trim();
    if (!em) next.email = "We need an email to reach you on.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) next.email = "That email doesn't look right.";
    if (!useCase.trim()) next.useCase = "A short line on how you'd use it, please.";
    if (!frequency.trim()) next.frequency = "Pick the one that fits best.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [fullName, email, useCase, frequency]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setStatus("submitting");
    setErrors({});
    setSubmitError(null);

    try {
      const res = await fetch("/api/waitlist/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          useCase: useCase.trim(),
          frequency: frequency.trim(),
        }),
      });

      const json = (await res.json()) as { ok?: boolean; error?: string; fields?: Record<string, string> };

      if (!res.ok) {
        let hasFieldErrors = false;
        if (json.fields && typeof json.fields === "object") {
          const next: FieldErrors = {};
          for (const k of ["fullName", "email", "useCase", "frequency"] as const) {
            const v = json.fields[k];
            if (typeof v === "string" && v) next[k] = v;
          }
          if (Object.keys(next).length > 0) {
            setErrors(next);
            hasFieldErrors = true;
          }
        }
        setSubmitError(
          hasFieldErrors
            ? null
            : typeof json.error === "string"
              ? json.error
              : "Something went wrong. Please try again."
        );
        setStatus("idle");
        return;
      }

      setStatus("success");
      setFullName("");
      setEmail("");
      setUseCase("");
      setFrequency("");
    } catch {
      setSubmitError("Network error. Check your connection and try again.");
      setStatus("idle");
    }
  }

  const inputClass =
    "w-full rounded-xl border border-white/[0.08] bg-[#0B0F14] px-4 py-3.5 text-[15px] text-[#F9FAFB] shadow-inner shadow-black/20 placeholder:text-[#6B7280] transition-[border-color,box-shadow] focus:border-[#3B82F6]/45 focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/20";

  if (status === "success") {
    return (
      <div
        id={id}
        className="scroll-mt-28 rounded-2xl border border-emerald-500/20 bg-[#121821] p-8 text-center sm:p-10"
        role="status"
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10">
          <svg className="h-6 w-6 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="mt-6 text-xl font-semibold text-[#F9FAFB]">You&apos;re on the list.</h3>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[#9CA3AF]">
          We&apos;ll be in touch from{" "}
          <a href="mailto:founder@polypayd.co.uk" className="font-medium text-[#3B82F6] hover:underline">
            founder@polypayd.co.uk
          </a>
          {" "}when you can try PolyPayd. Thanks for telling us about your group.
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="mt-8 text-sm font-semibold text-[#9CA3AF] underline-offset-4 transition-colors hover:text-[#F9FAFB]"
        >
          Add someone else
        </button>
      </div>
    );
  }

  return (
    <div id={id} className="scroll-mt-28">
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-white/[0.08] bg-[#121821] p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset] sm:p-8 lg:p-10"
        noValidate
      >
        <div className="border-b border-white/[0.06] pb-8">
          <h2 className="text-2xl font-semibold tracking-tight text-[#F9FAFB] sm:text-[1.65rem]">
            Be first in line when we launch
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#9CA3AF] sm:text-[15px]">
            Tell us a bit about what you&apos;d use PolyPayd for. We read every response.
          </p>
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <div className="sm:col-span-1">
            <label htmlFor="groups-name" className="mb-2 block text-xs font-medium text-[#9CA3AF]">
              Full name <span className="text-[#6B7280]">*</span>
            </label>
            <input
              id="groups-name"
              name="fullName"
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                if (errors.fullName) setErrors((p) => ({ ...p, fullName: undefined }));
              }}
              className={cn(inputClass, errors.fullName && "border-red-500/40 focus:border-red-500/50 focus:ring-red-500/15")}
              placeholder="Your name"
              disabled={status === "submitting"}
            />
            {errors.fullName ? (
              <p className="mt-1.5 text-xs text-red-400/90" role="alert">
                {errors.fullName}
              </p>
            ) : null}
          </div>

          <div className="sm:col-span-1">
            <label htmlFor="groups-email" className="mb-2 block text-xs font-medium text-[#9CA3AF]">
              Email <span className="text-[#6B7280]">*</span>
            </label>
            <input
              id="groups-email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) setErrors((p) => ({ ...p, email: undefined }));
              }}
              className={cn(inputClass, errors.email && "border-red-500/40 focus:border-red-500/50 focus:ring-red-500/15")}
              placeholder="you@example.com"
              disabled={status === "submitting"}
            />
            {errors.email ? (
              <p className="mt-1.5 text-xs text-red-400/90" role="alert">
                {errors.email}
              </p>
            ) : null}
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="groups-use" className="mb-2 block text-xs font-medium text-[#9CA3AF]">
              How would you use PolyPayd? <span className="text-[#6B7280]">*</span>
            </label>
            <input
              id="groups-use"
              name="useCase"
              type="text"
              value={useCase}
              onChange={(e) => {
                setUseCase(e.target.value);
                if (errors.useCase) setErrors((p) => ({ ...p, useCase: undefined }));
              }}
              className={cn(inputClass, errors.useCase && "border-red-500/40 focus:border-red-500/50 focus:ring-red-500/15")}
              placeholder="e.g. I run a 15-person ajo group, or I pay 8 freelance tutors monthly"
              disabled={status === "submitting"}
            />
            {errors.useCase ? (
              <p className="mt-1.5 text-xs text-red-400/90" role="alert">
                {errors.useCase}
              </p>
            ) : null}
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="groups-frequency" className="mb-2 block text-xs font-medium text-[#9CA3AF]">
              Roughly how often would you pay out a group? <span className="text-[#6B7280]">*</span>
            </label>
            <div className="relative">
              <select
                id="groups-frequency"
                name="frequency"
                value={frequency}
                onChange={(e) => {
                  setFrequency(e.target.value);
                  if (errors.frequency) setErrors((p) => ({ ...p, frequency: undefined }));
                }}
                className={cn(
                  inputClass,
                  "appearance-none pr-10",
                  !frequency && "text-[#6B7280]",
                  errors.frequency && "border-red-500/40 focus:border-red-500/50 focus:ring-red-500/15"
                )}
                disabled={status === "submitting"}
              >
                {FREQUENCY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} disabled={opt.value === ""} className="bg-[#0B0F14] text-[#F9FAFB]">
                    {opt.label}
                  </option>
                ))}
              </select>
              <svg
                className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden
              >
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </div>
            {errors.frequency ? (
              <p className="mt-1.5 text-xs text-red-400/90" role="alert">
                {errors.frequency}
              </p>
            ) : null}
          </div>
        </div>

        {submitError ? (
          <p className="mt-6 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300" role="alert">
            {submitError}
          </p>
        ) : null}

        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-relaxed text-[#6B7280]">
            We&apos;ll only use your details to contact you about PolyPayd. No marketing lists, no spam.
          </p>
          <button
            type="submit"
            disabled={status === "submitting"}
            className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl bg-[#3B82F6] px-8 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset,0_8px_24px_-6px_rgba(59,130,246,0.45)] transition-all hover:bg-[#2563EB] disabled:pointer-events-none disabled:opacity-50"
          >
            {status === "submitting" ? "Sending…" : "Join the waitlist"}
          </button>
        </div>
      </form>
    </div>
  );
}
