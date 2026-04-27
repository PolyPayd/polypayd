"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Send,
  Inbox,
  Settings,
  HelpCircle,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/cn";

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  exact?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Home",     href: "/app",           icon: LayoutDashboard, exact: true },
  { label: "Batches",  href: "/app/batches",   icon: Send },
  { label: "Claims",   href: "/app/claims",    icon: Inbox },
  { label: "Settings", href: "/app/settings",  icon: Settings },
  { label: "Help",     href: "/app/help",      icon: HelpCircle },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex h-full flex-col px-3 py-6">
      <div className="mb-8 px-2">
        <Logo href="/app" size="md" />
      </div>

      <ul className="flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ label, href, icon: Icon, exact }) => {
          const isActive = exact
            ? pathname === href
            : pathname === href || pathname.startsWith(href + "/");

          return (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-fp-accent/10 text-fp-accent"
                    : "text-fp-text-secondary hover:bg-white/5 hover:text-fp-text"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
