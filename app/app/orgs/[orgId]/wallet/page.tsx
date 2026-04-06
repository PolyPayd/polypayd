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
import {
  fetchWalletRecentTransactionRows,
  type WalletRecentStatusVariant,
} from "@/lib/walletRecentTransactions";
import { getStripeServerClient } from "@/lib/stripe";
import { FintechBadge, FintechCard, PageShell } from "@/components/fintech";

export const dynamic = "force-dynamic";

type Params = { orgId: string };

function money(amount: number, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
}

function statusTone(v: WalletRecentStatusVariant): "success" | "warning" | "error" | "neutral" | "info" {
  if (v === "pending") return "warning";
  if (v === "available") return "success";
  if (v === "partial") return "info";
  if (v === "failed") return "error";
  return "neutral";
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

      {/* Primary balance */}
      <FintechCard elevated className="mb-5">
        <p className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Available balance</p>
        <p className="mt-2 text-4xl font-bold tabular-nums tracking-tight text-[#F9FAFB] sm:text-[2.5rem]">
          {money(available, currency)}
        </p>
        {pending > 0.005 && (
          <p className="mt-3 text-sm text-[#9CA3AF]">
            <span className="text-[#6B7280]">Pending</span>{" "}
            <span className="font-medium tabular-nums text-[#F9FAFB]">{money(pending, currency)}</span>
            <span className="text-[#6B7280]"> · not withdrawable yet</span>
          </p>
        )}
        {totals.totalFromInternalClaims > 0.005 && (
          <p className="mt-3 text-xs leading-relaxed text-[#6B7280]">
            Includes {money(totals.totalFromInternalClaims, currency)} from batch claims.
          </p>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <AddFundsButton orgId={orgId} addFundsBlockedReason={addFundsBlockedReason} />
          <WithdrawHeaderButton />
        </div>
      </FintechCard>

      {/* Withdraw panel (bank + amount) */}
      <div className="mb-8">
        <WithdrawTestPanel
          availableToWithdrawGbp={available}
          pendingFundsGbp={pending}
          hasConnectedBank={Boolean(connectAccount?.stripe_account_id)}
        />
      </div>

      {/* Secondary stats */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FintechCard>
          <p className="text-xs font-medium text-[#6B7280]">Added (cards)</p>
          <p className="mt-2 text-lg font-semibold tabular-nums text-[#F9FAFB]">
            {money(totals.totalFunded, currency)}
          </p>
        </FintechCard>
        <FintechCard>
          <p className="text-xs font-medium text-[#6B7280]">Withdrawn</p>
          <p className="mt-2 text-lg font-semibold tabular-nums text-[#F9FAFB]">
            {money(totals.totalSent, currency)}
          </p>
        </FintechCard>
        <div className="sm:col-span-1">
          <ImpactWalletCard userImpactTotal={userImpactTotal} currency={currency} schemaReady={impactSchemaReady} />
        </div>
      </div>

      {/* Activity */}
      <FintechCard>
        <h2 className="text-lg font-semibold text-[#F9FAFB]">Transactions</h2>
        <p className="mt-1 text-sm text-[#6B7280]">Recent credits and debits</p>

        {recentRows.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-white/[0.06] bg-[#0B0F14]/50 py-12 text-center">
            <p className="text-sm font-medium text-[#9CA3AF]">No activity yet</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-[#6B7280]">
              Add funds or receive a payout to see transactions here.
            </p>
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-white/[0.05]">
            {recentRows.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-start justify-between gap-3 py-4 first:pt-0 transition-colors hover:bg-white/[0.02] sm:flex-nowrap sm:px-1 sm:-mx-1 sm:rounded-lg"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#F9FAFB]">{r.typeLabel}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {r.statusLabel && r.statusVariant ? (
                      <FintechBadge tone={statusTone(r.statusVariant)}>{r.statusLabel}</FintechBadge>
                    ) : null}
                    <span className="text-xs text-[#6B7280]">
                      {r.date ? new Date(r.date).toLocaleString("en-GB") : "—"}
                    </span>
                  </div>
                </div>
                <p
                  className={`shrink-0 text-base font-semibold tabular-nums ${
                    r.entry_type === "credit" ? "text-[#22C55E]" : "text-[#F59E0B]"
                  }`}
                >
                  {r.entry_type === "credit" ? "+" : "−"}
                  {money(r.amount, currency)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </FintechCard>
    </PageShell>
  );
}
