import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { Toaster } from "sonner";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureWalletForUser } from "@/lib/wallet";
import { ensureDefaultOrgForUser } from "@/lib/defaultOrg";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (userId) {
    await ensureWalletForUser(supabaseAdmin(), userId, "GBP");
    // Create a minimal internal org for legacy `org_id`-scoped DB rows.
    // UX no longer exposes organisations to the user.
    await ensureDefaultOrgForUser(supabaseAdmin(), userId);
  }

  return (
    <div className="min-h-screen bg-[#0B0F14] text-[#F9FAFB]">
      <header className="sticky top-0 z-40 border-b border-white/[0.05] bg-[#0B0F14]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3.5 sm:px-5">
          <div className="flex min-w-0 flex-1 items-center gap-5 sm:gap-8">
            <Link
              href="/app/profile"
              className="shrink-0 text-[15px] font-semibold tracking-tight text-[#F9FAFB] transition-opacity hover:opacity-90"
            >
              PolyPayd
            </Link>
            <nav className="flex flex-wrap items-center gap-1 sm:gap-2">
              {(
                [
                  ["/app/wallet", "Wallet"],
                  ["/app/batches", "Payouts"],
                  ["/app/join-batch", "Claim"],
                  ["/app/impact", "Impact"],
                ] as const
              ).map(([href, label]) => (
                <Link
                  key={href}
                  href={href}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-[#9CA3AF] transition-colors hover:bg-white/[0.04] hover:text-[#F9FAFB]"
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </header>
      <main className="min-h-[calc(100vh-3.5rem)]">{children}</main>
      <Toaster
        theme="dark"
        position="top-center"
        toastOptions={{
          classNames: {
            toast: "border border-white/[0.06] bg-[#121821] text-[#F9FAFB] shadow-xl",
            title: "text-white",
            description: "text-[#9CA3AF]",
            success: "border-[#22C55E]/20",
          },
        }}
      />
    </div>
  );
}
