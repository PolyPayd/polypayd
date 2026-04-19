import Link from "next/link";
import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureWalletForUser } from "@/lib/wallet";
import { AddFundsButton } from "./AddFundsButton";
import { WithdrawHeaderButton } from "./WithdrawHeaderButton";
import { WithdrawTestPanel } from "./WithdrawTestPanel";
import { WalletTopUpReturnHandler } from "./WalletTopUpReturnHandler";
import { ImpactWalletCard } from "@/components/impact/ImpactWalletCard";
import { fetchUserImpactContributionTotal } from "@/lib/impact";
import type { WalletDashboardLedgerTotals } from "@/lib/walletDashboardAggregates";
import { fetchWalletRecentTransactionRows } from "@/lib/walletRecentTransactions";
import { getStripeServerClient } from "@/lib/stripe";
import { FintechCard, PageShell } from "@/components/fintech";
import { WalletAccountCard } from "@/components/wallet/WalletAccountCard";
import { WalletActivityExpandable } from "@/components/wallet/WalletActivityExpandable";

export const dynamic = "force-dynamic";

type Params = { orgId: string };

function money(amount: number, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
}

export default async function WalletPage({
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
        <p className="text-sm text-[#EF4444]">You must be signed in to view your wallet.</p>
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

  const currency = "GBP";
  const wallet = await ensureWalletForUser(supabase, userId, currency);
  if (!wallet) {
    return (
      <PageShell>
        <p className="text-sm text-[#F59E0B]">
          We could not load or create your wallet. Please refresh the page or try again later.
        </p>
      </PageShell>
    );
  }

  const { data: aggRaw, error: aggError } = await supabase.rpc("wallet_dashboard_ledger_aggregates", {
    p_wallet_id: wallet.id,
  });

  if (aggError) {
    console.error(
      "wallet_dashboard_ledger_aggregates failed (apply migrations 20260331200000 / 20260403120000):",
      aggError.message
    );
  }

  const agg = (aggRaw ?? null) as Record<string, unknown> | null;
  const totals: WalletDashboardLedgerTotals = {
    totalFunded: Number(agg?.total_funded ?? 0),
    totalFromInternalClaims: Number(agg?.total_from_internal_claims ?? 0),
    totalSent: Number(agg?.total_sent ?? 0),
  };

  const recentRows = await fetchWalletRecentTransactionRows(supabase, wallet.id);

  const available = wallet.current_balance;
  const pending = wallet.pending_balance;

  const { total: userImpactTotal, schemaReady: impactSchemaReady } = await fetchUserImpactContributionTotal(
    supabase,
    userId,
    currency
  );

  const { data: connectAccount } = await supabase
    .from("stripe_connect_accounts")
    .select("stripe_account_id")
    .eq("user_id", userId)
    .maybeSingle();

  let addFundsBlockedReason: string | null = null;
  if (!connectAccount?.stripe_account_id) {
    addFundsBlockedReason =
      "Create your Stripe Connect account first (Connect bank below), then you can add funds.";
  } else {
    try {
      const stripe = getStripeServerClient();
      const acct = await stripe.accounts.retrieve(connectAccount.stripe_account_id);
      if (!acct.charges_enabled) {
        addFundsBlockedReason =
          "Finish Stripe Connect onboarding until card payments are enabled, then add funds.";
      }
    } catch (e) {
      console.error("wallet page Stripe accounts.retrieve:", e);
      addFundsBlockedReason =
        "We could not verify your Stripe account. Refresh the page or try again shortly.";
    }
  }

  return (
    <PageShell>
      <Suspense fallback={null}>
        <WalletTopUpReturnHandler />
      </Suspense>

      <Link
        href="/app/batches"
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-[#9CA3AF] transition-colors hover:text-[#F9FAFB]"
      >
        <span aria-hidden className="text-[#6B7280]">
          ←
        </span>
        Back to payouts
      </Link>

      <WalletAccountCard
        currency={currency}
        available={available}
        pending={pending}
        claimsFromBatch={totals.totalFromInternalClaims > 0.005 ? totals.totalFromInternalClaims : undefined}
        actions={
          <>
            <AddFundsButton
              orgId={orgId}
              addFundsBlockedReason={addFundsBlockedReason}
              className="h-12 w-full min-h-12 sm:min-w-0 sm:flex-1"
            />
            <WithdrawHeaderButton className="h-12 w-full min-h-12 sm:min-w-0 sm:flex-1" />
          </>
        }
        footer={
          <WithdrawTestPanel
            embedded
            availableToWithdrawGbp={available}
            pendingFundsGbp={pending}
            hasConnectedBank={Boolean(connectAccount?.stripe_account_id)}
          />
        }
      />

      {/* Summary: one surface */}
      <FintechCard interactive={false} className="mb-8 p-5 sm:p-6">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-0">
          <div>
            <p className="text-xs font-medium text-[#6B7280]">Added (cards)</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-[#F9FAFB] sm:text-2xl">
              {money(totals.totalFunded, currency)}
            </p>
          </div>
          <div className="sm:border-l sm:border-white/[0.05] sm:pl-8">
            <p className="text-xs font-medium text-[#6B7280]">Withdrawn</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-[#F9FAFB] sm:text-2xl">
              {money(totals.totalSent, currency)}
            </p>
          </div>
          <div className="sm:border-l sm:border-white/[0.05] sm:pl-8">
            <ImpactWalletCard
              embedded
              userImpactTotal={userImpactTotal}
              currency={currency}
              schemaReady={impactSchemaReady}
            />
          </div>
        </div>
      </FintechCard>

      {/* Activity, expand/collapse in place (client) */}
      <FintechCard interactive={false}>
        <h2 className="text-lg font-semibold tracking-tight text-[#F9FAFB]">Activity</h2>
        <p className="mt-1 text-sm text-[#6B7280]">Recent credits and debits</p>

        <WalletActivityExpandable rows={recentRows} currency={currency} />
      </FintechCard>
    </PageShell>
  );
}
