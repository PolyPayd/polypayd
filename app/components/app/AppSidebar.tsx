"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser, SignOutButton } from "@clerk/nextjs";
import {
  LayoutDashboard,
  Send,
  Inbox,
  Settings,
  HelpCircle,
  LogOut,
  Menu,
  X,
} from "lucide-react";

import { Logo } from "@/components/logo";
import { cn } from "@/lib/cn";

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  exact?: boolean;
  external?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Home",     href: "/app",                  icon: LayoutDashboard, exact: true },
  { label: "Batches",  href: "/app/batches",          icon: Send },
  { label: "Claims",   href: "/app/claims",           icon: Inbox },
  { label: "Settings", href: "/app/settings/profile", icon: Settings },
  { label: "Help",     href: "mailto:help@polypayd.co.uk", icon: HelpCircle, external: true },
];

function NavLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <ul className="flex flex-col gap-0.5">
      {NAV_ITEMS.map(({ label, href, icon: Icon, exact, external }) => {
        const isActive =
          !external &&
          (exact
            ? pathname === href
            : pathname === href || pathname.startsWith(href + "/"));
        const className = cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
          isActive
            ? "bg-fp-accent/10 text-fp-accent"
            : "text-fp-text-secondary hover:bg-white/5 hover:text-fp-text"
        );

        return (
          <li key={href}>
            {external ? (
              <a href={href} className={className}>
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </a>
            ) : (
              <Link href={href} className={className} onClick={onNavigate}>
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function UserFooter() {
  const { user, isLoaded } = useUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses[0]?.emailAddress ??
    null;

  return (
    <div className="mt-auto flex flex-col gap-2 border-t border-white/[0.06] px-2 pt-4">
      <p
        className={cn(
          "truncate px-1 text-xs text-fp-text-muted",
          !isLoaded && "opacity-0"
        )}
        title={email ?? undefined}
      >
        {email ?? "—"}
      </p>
      <SignOutButton redirectUrl="/signin">
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-fp-text-secondary transition-colors hover:bg-white/5 hover:text-fp-text"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign out
        </button>
      </SignOutButton>
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() ?? "";
  return (
    <nav className="flex h-full flex-col px-3 py-6">
      <div className="mb-8 px-2">
        <Logo href="/app" size="md" />
      </div>
      <NavLinks pathname={pathname} onNavigate={onNavigate} />
      <UserFooter />
    </nav>
  );
}

export function AppSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <aside className="hidden w-60 shrink-0 border-r border-white/[0.06] bg-fp-surface md:block">
        <SidebarContent />
      </aside>

      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-white/[0.06] bg-fp-surface px-4 md:hidden">
        <Logo href="/app" size="sm" />
        <button
          type="button"
          aria-label="Open navigation"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-fp-text-secondary transition-colors hover:bg-white/5 hover:text-fp-text"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[80%] flex-col bg-fp-surface shadow-2xl">
            <div className="flex h-14 items-center justify-between border-b border-white/[0.06] px-4">
              <Logo href="/app" size="sm" />
              <button
                type="button"
                aria-label="Close navigation"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-fp-text-secondary transition-colors hover:bg-white/5 hover:text-fp-text"
                onClick={() => setMobileOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
