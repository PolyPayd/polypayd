import type { Appearance } from "@clerk/types";

// Shared theming for any Clerk-hosted component (SignIn, SignUp, etc.).
// Aligned to PolyPayd brand: teal-600 primary, slate borders, our font stack.
export const polypaydClerkAppearance: Appearance = {
  variables: {
    colorPrimary: "#0d9488",
    colorBackground: "#ffffff",
    colorText: "#0f172a",
    colorTextSecondary: "#64748b",
    colorInputBackground: "#ffffff",
    colorInputText: "#0f172a",
    colorDanger: "#dc2626",
    borderRadius: "0.75rem",
    fontFamily:
      "var(--font-inter), ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    fontSize: "0.95rem",
  },
  elements: {
    rootBox: "w-full",
    card:
      "w-full bg-white border border-slate-200 shadow-sm rounded-xl p-8 text-slate-900",
    headerTitle: "text-slate-900 text-2xl font-semibold tracking-tight",
    headerSubtitle: "text-slate-500 text-sm",
    socialButtonsBlockButton:
      "border-slate-200 hover:bg-slate-50 text-slate-900",
    formFieldLabel: "text-slate-900 text-sm font-medium",
    formFieldInput:
      "border-slate-200 focus:border-teal-600 focus:ring-teal-600/20",
    formButtonPrimary:
      "bg-teal-600 hover:bg-teal-700 text-white font-medium normal-case shadow-none",
    footerActionLink: "text-teal-600 hover:text-teal-700 font-medium",
    identityPreviewEditButton: "text-teal-600",
    formResendCodeLink: "text-teal-600",
    otpCodeFieldInput: "border-slate-200 focus:border-teal-600",
    dividerLine: "bg-slate-200",
    dividerText: "text-slate-500",
  },
};
