// Layout for all authenticated /app/* pages.
//
// Auth enforcement is handled upstream by proxy.ts (clerkMiddleware).
// Onboarding should live at /app/onboarding outside this layout's subtree
// so the sidebar is never rendered there — use a sibling route group if
// that segment is added to src/app.
import type { ReactNode } from "react";
import { AppSidebar } from "@/src/components/app/AppSidebar";

export default function AppShellLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-fp-bg text-fp-text">
      {/* Sidebar — hidden on mobile, fixed-width on md+ */}
      <aside className="hidden md:flex md:w-60 md:shrink-0 md:flex-col border-r border-white/[0.06] bg-fp-surface">
        <AppSidebar />
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0">
        {children}
      </main>
    </div>
  );
}
