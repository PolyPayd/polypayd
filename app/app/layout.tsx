import type { ReactNode } from "react";

// Thin pass-through layout for the entire `/app` segment.
//
// Authentication for `/app/**` is enforced by `proxy.ts` (Clerk's auth.protect()).
// The onboarding gate + dashboard shell live in `(authed)/layout.tsx` so that
// `/app/onboarding` is structurally outside the gated subtree. That makes the
// "redirect to /app/onboarding when first_name is null" check impossible to fire
// from `/app/onboarding` itself — no header sniffing required, no redirect loop.
export default function AppLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
