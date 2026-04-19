"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/cn";

type FieldErrors = Partial<Record<"fullName" | "email" | "company" | "message", string>>;

export function LandingWaitlistForm({ id = "contact" }: { id?: string }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle");

  const validate = useCallback((): boolean => {
    const next: FieldErrors = {};
    if (!fullName.trim()) next.fullName = "Enter your full name.";
    const em = email.trim();
    if (!em) next.email = "Enter your work email.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) next.email = "Enter a valid email address.";
    if (!company.trim()) next.company = "Enter your company or organisation.";
    if (!message.trim()) next.message = "Tell us briefly what you’re looking for.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [fullName, email, company, message]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setStatus("submitting");
    setErrors({});
    setSubmitError(null);

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          company: company.trim(),
          message: message.trim(),
        }),
      });

      const json = (await res.json()) as { ok?: boolean; error?: string; fields?: Record<string, string> };

      if (!res.ok) {
        let hasFieldErrors = false;
        if (json.fields && typeof json.fields === "object") {
          const next: FieldErrors = {};
          for (const k of ["fullName", "email", "company", "message"] as const) {
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
      setCompany("");
      setMessage("");
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
        <h3 className="mt-6 text-xl font-semibold text-[#F9FAFB]">Thanks, your enquiry has been received.</h3>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[#9CA3AF]">
          We&apos;ll review your submission and follow up shortly from{" "}
          <a href="mailto:founder@polypayd.co.uk" className="font-medium text-[#3B82F6] hover:underline">
            founder@polypayd.co.uk
          </a>
          .
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="mt-8 text-sm font-semibold text-[#9CA3AF] underline-offset-4 transition-colors hover:text-[#F9FAFB]"
        >
          Send another message
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
          <h2 className="text-2xl font-semibold tracking-tight text-[#F9FAFB] sm:text-[1.65rem]">Request access or get in touch</h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#9CA3AF] sm:text-[15px]">
            Share a few details. We read every submission, especially from operators, finance, and payment
            partners evaluating PolyPayd for production use.
          </p>
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <div className="sm:col-span-1">
            <label htmlFor="waitlist-name" className="mb-2 block text-xs font-medium text-[#9CA3AF]">
              Full name <span className="text-[#6B7280]">*</span>
            </label>
            <input
              id="waitlist-name"
              name="fullName"
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                if (errors.fullName) setErrors((p) => ({ ...p, fullName: undefined }));
              }}
              className={cn(inputClass, errors.fullName && "border-red-500/40 focus:border-red-500/50 focus:ring-red-500/15")}
              placeholder="Alex Morgan"
              disabled={status === "submitting"}
            />
            {errors.fullName ? (
              <p className="mt-1.5 text-xs text-red-400/90" role="alert">
                {errors.fullName}
              </p>
            ) : null}
          </div>
          <div className="sm:col-span-1">
            <label htmlFor="waitlist-email" className="mb-2 block text-xs font-medium text-[#9CA3AF]">
              Work email <span className="text-[#6B7280]">*</span>
            </label>
            <input
              id="waitlist-email"
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
              placeholder="you@company.com"
              disabled={status === "submitting"}
            />
            {errors.email ? (
              <p className="mt-1.5 text-xs text-red-400/90" role="alert">
                {errors.email}
              </p>
            ) : null}
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="waitlist-company" className="mb-2 block text-xs font-medium text-[#9CA3AF]">
              Company or organisation <span className="text-[#6B7280]">*</span>
            </label>
            <input
              id="waitlist-company"
              name="company"
              type="text"
              autoComplete="organization"
              value={company}
              onChange={(e) => {
                setCompany(e.target.value);
                if (errors.company) setErrors((p) => ({ ...p, company: undefined }));
              }}
              className={cn(inputClass, errors.company && "border-red-500/40 focus:border-red-500/50 focus:ring-red-500/15")}
              placeholder="Acme Ltd"
              disabled={status === "submitting"}
            />
            {errors.company ? (
              <p className="mt-1.5 text-xs text-red-400/90" role="alert">
                {errors.company}
              </p>
            ) : null}
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="waitlist-message" className="mb-2 block text-xs font-medium text-[#9CA3AF]">
              Message <span className="text-[#6B7280]">*</span>
            </label>
            <textarea
              id="waitlist-message"
              name="message"
              rows={5}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                if (errors.message) setErrors((p) => ({ ...p, message: undefined }));
              }}
              className={cn(
                inputClass,
                "min-h-[140px] resize-y",
                errors.message && "border-red-500/40 focus:border-red-500/50 focus:ring-red-500/15"
              )}
              placeholder="Briefly describe your payout volume, timeline, or integration needs."
              disabled={status === "submitting"}
            />
            {errors.message ? (
              <p className="mt-1.5 text-xs text-red-400/90" role="alert">
                {errors.message}
              </p>
            ) : null}
          </div>
        </div>

        {submitError ? (
          <p className="mb-6 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300" role="alert">
            {submitError}
          </p>
        ) : null}

        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-relaxed text-[#6B7280]">
            By submitting, you agree we may contact you about PolyPayd. No marketing lists. Operational and
            partner conversations only.
          </p>
          <button
            type="submit"
            disabled={status === "submitting"}
            className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl bg-[#3B82F6] px-8 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset,0_8px_24px_-6px_rgba(59,130,246,0.45)] transition-all hover:bg-[#2563EB] disabled:pointer-events-none disabled:opacity-50"
          >
            {status === "submitting" ? "Sending…" : "Submit"}
          </button>
        </div>
      </form>
    </div>
  );
}
