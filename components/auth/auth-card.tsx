import type { ReactNode } from "react";

import { Logo } from "@/components/logo";

// Shared layout for /signin, /signup, /forgot-password and /app/onboarding.
// Centred card on a slate-50 background with the PolyPayd wordmark on top.
export function AuthCard({
  heading,
  subheading,
  children,
  footer,
  maxWidth = "420px",
}: {
  heading: string;
  subheading?: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
}) {
  return (
    <div className="flex w-full flex-col items-center gap-8" style={{ maxWidth }}>
      <Logo size="md" href="/" />

      <div className="w-full rounded-xl border border-slate-200 bg-white p-8 text-slate-900 shadow-sm">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
          {subheading ? (
            <p className="text-sm text-slate-500">{subheading}</p>
          ) : null}
        </div>

        <div className="mt-6">{children}</div>
      </div>

      {footer ? (
        <div className="text-center text-sm text-slate-500">{footer}</div>
      ) : null}
    </div>
  );
}
