import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureWalletForUser } from "@/lib/wallet";
import { fetchWalletRecentTransactionRows } from "@/lib/walletRecentTransactions";
import { FintechCard, PageShell } from "@/components/fintech";
import { WalletActivityList } from "@/components/wallet/WalletActivityList";

export const dynamic = "force-dynamic";

type Params = { orgId: string };

const CURRENCY = "GBP";
const FULL_LIST_MAX = 80;

export default async function WalletTransactionsPage({
  params,
}: {
  params: Params | Promise<Params>;
}) {
  const { orgId } = await Promise.resolve(params as Promise<Params>);

  if (!orgId) {
    return (
      <PageShell>
        <p className="text-sm text-[#EF4444]">Missing orgId in route.</p>
      </PageShell>
    );
  }

  const { userId } = await auth();
  if (!userId) {
    return (
      <PageShell>
        <p className="text-sm text-[#EF4444]">You must be signed in.</p>
      </PageShell>
    );
  }

  const supabase = supabaseAdmin();

  const { data: membership } = await supabase
    .from("org_members")
    .select("id")
    .eq("org_id", orgId)
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (!membership) {
    return (
      <PageShell>
        <p className="text-sm text-[#EF4444]">You do not have access to this organisation.</p>
      </PageShell>
    );
  }

  const wallet = await ensureWalletForUser(supabase, userId, CURRENCY);
  if (!wallet) {
    return (
      <PageShell>
        <p className="text-sm text-[#F59E0B]">We could not load your wallet.</p>
      </PageShell>
    );
  }

  const recentRows = await fetchWalletRecentTransactionRows(supabase, wallet.id, {
    maxRows: FULL_LIST_MAX,
    ledgerLimit: 200,
  });

  return (
    <PageShell>
      <Link
        href={`/app/orgs/${orgId}/wallet`}
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-[#9CA3AF] transition-colors hover:text-[#F9FAFB]"
      >
        <span aria-hidden className="text-[#6B7280]">
          ←
        </span>
        Wallet
      </Link>

      <h1 className="text-xl font-semibold tracking-tight text-[#F9FAFB] sm:text-2xl">Activity</h1>
      <p className="mt-1 text-sm text-[#6B7280]">All recent credits and debits</p>

      <FintechCard interactive={false} className="mt-6">
        <WalletActivityList rows={recentRows} currency={CURRENCY} />
      </FintechCard>
    </PageShell>
  );
}
