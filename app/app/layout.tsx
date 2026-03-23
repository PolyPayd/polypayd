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
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="sticky top-0 z-40 border-b border-neutral-800 bg-neutral-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/app/profile" className="text-sm font-semibold text-white hover:text-neutral-200">
              PolyPayd
            </Link>
            <nav className="flex items-center gap-3 text-sm">
              <Link href="/app/wallet" className="text-neutral-400 hover:text-white">
                Wallet
              </Link>
              <Link href="/app/batches" className="text-neutral-400 hover:text-white">
                Payouts
              </Link>
              <Link href="/app/join-batch" className="text-neutral-400 hover:text-white">
                Claim
              </Link>
              <Link href="/app/impact" className="text-neutral-400 hover:text-white">
                Impact
              </Link>
            </nav>
          </div>
        </div>
      </header>
      <main>{children}</main>
      <Toaster
        theme="dark"
        position="top-center"
        toastOptions={{
          classNames: {
            toast: "border border-neutral-800 bg-neutral-900 text-neutral-100 shadow-xl",
            title: "text-white",
            description: "text-neutral-400",
            success: "border-emerald-500/30",
          },
        }}
      />
    </div>
  );
}
