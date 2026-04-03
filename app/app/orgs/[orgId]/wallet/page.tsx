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

export const dynamic = "force-dynamic";

/** Ledger totals use `wallet_dashboard_ledger_aggregates` (full history). See `lib/walletDashboardAggregates.ts`. */

type Params = { orgId: string };

function money(amount: number, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
}

function statusBadgeClass(v: WalletRecentStatusVariant): string {
  if (v === "pending") {
    return "border-amber-500/35 bg-amber-950/40 text-amber-100";
  }
  if (v === "available") {
    return "border-emerald-500/35 bg-emerald-950/40 text-emerald-100";
  }
  if (v === "partial") {
    return "border-sky-500/30 bg-sky-950/30 text-sky-100/95";
  }
  if (v === "allocated") {
    return "border-neutral-600 bg-neutral-900/70 text-neutral-200";
  }
  if (v === "failed") {
    return "border-red-500/35 bg-red-950/45 text-red-100";
  }
  return "";
}

export default async function WalletPage({
  params,
}: {
  params: Params | Promise<Params>;
}) {
  const { orgId } = await Promise.resolve(params as Promise<Params>);

  if (!orgId) {
    return <div className="p-6 text-red-500">Missing orgId in route.</div>;
  }

  const { userId } = await auth();
  if (!userId) {
    return (
      <div className="p-6 text-red-500">You must be signed in to view your wallet.</div>
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
      <div className="p-6 text-red-500">You do not have access to this organisation.</div>
    );
  }

  const currency = "GBP";
  const wallet = await ensureWalletForUser(supabase, userId, currency);
  if (!wallet) {
    return (
      <div className="p-6 text-amber-500">
        We could not load or create your wallet. Please refresh the page or try again later.
      </div>
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
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
        <Link
          href={`/app/batches`}
          className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-white mb-8 transition-colors"
        >
          <span aria-hidden>←</span> Back to payouts
        </Link>

        <Suspense fallback={null}>
          <WalletTopUpReturnHandler />
        </Suspense>

        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end sm:justify-between gap-4 mb-10">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-neutral-500 mb-1.5">Wallet</p>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">Your balance</h1>
            <p className="mt-2 text-sm text-neutral-500 max-w-md leading-relaxed">
              Available funds can be withdrawn to your bank. Pending funds are still clearing and aren&apos;t withdrawable yet.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <WithdrawHeaderButton />
            <AddFundsButton orgId={orgId} addFundsBlockedReason={addFundsBlockedReason} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-8">
          <div className="lg:col-span-7 rounded-2xl border border-emerald-900/35 bg-gradient-to-b from-emerald-950/25 to-neutral-900/40 p-6 sm:p-8 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
            <div className="flex flex-col md:flex-row md:items-stretch md:gap-8 md:divide-y-0 md:divide-x divide-neutral-800/80 divide-y md:divide-y-0">
              <div className="flex-1 pb-6 md:pb-0 md:pr-8">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-emerald-200/70 mb-2">
                  Available to withdraw
                </p>
                <p className="text-3xl sm:text-4xl font-semibold tabular-nums tracking-tight text-white">
                  {money(available, currency)}
                </p>
                <p className="mt-3 text-sm text-neutral-400 leading-relaxed max-w-sm">
                  Money you can send to your bank now. Claim Link payouts credit here as soon as they&apos;re funded—no card
                  settlement wait.
                </p>
                {totals.totalFromInternalClaims > 0.005 && (
                  <p className="mt-4 text-xs text-emerald-200/55 leading-relaxed border-t border-white/5 pt-4">
                    Includes {money(totals.totalFromInternalClaims, currency)} from batch claims (already available).
                  </p>
                )}
                <p className="mt-4 text-xs text-neutral-600">{currency} wallet</p>
              </div>
              <div className="flex-1 pt-6 md:pt-0 md:pl-8">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-amber-200/60 mb-2">Pending</p>
                <p className="text-2xl font-semibold tabular-nums text-neutral-100">{money(pending, currency)}</p>
                <p className="mt-3 text-sm text-neutral-500 leading-relaxed">
                  Usually card top-ups or transfers still processing. Pending balance cannot be withdrawn until it moves to
                  available.
                </p>
              </div>
            </div>
          </div>
          <div className="lg:col-span-5 flex flex-col gap-4">
            <div className="rounded-2xl border border-neutral-800/90 bg-neutral-900/35 p-5 sm:p-6 flex-1 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500 mb-2">Total added (cards)</p>
              <p className="text-xl font-semibold tabular-nums text-emerald-300/95">{money(totals.totalFunded, currency)}</p>
              <p className="mt-2 text-xs text-neutral-500 leading-relaxed">Card and wallet top-ups credited over time.</p>
              {totals.totalFromInternalClaims > 0.005 && (
                <div className="mt-4 pt-4 border-t border-neutral-800/80">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500 mb-1">
                    From batch claims
                  </p>
                  <p className="text-lg font-semibold tabular-nums text-sky-300/90">
                    {money(totals.totalFromInternalClaims, currency)}
                  </p>
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-neutral-800/90 bg-neutral-900/35 p-5 sm:p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500 mb-2">Total withdrawn</p>
              <p className="text-xl font-semibold tabular-nums text-amber-200/90">{money(totals.totalSent, currency)}</p>
              <p className="mt-2 text-xs text-neutral-500 leading-relaxed">Sent from this wallet to your bank.</p>
            </div>
          </div>
        </div>

        <WithdrawTestPanel
          availableToWithdrawGbp={available}
          pendingFundsGbp={pending}
          hasConnectedBank={Boolean(connectAccount?.stripe_account_id)}
        />

        <div className="mb-10">
          <ImpactWalletCard userImpactTotal={userImpactTotal} currency={currency} schemaReady={impactSchemaReady} />
        </div>

        <div className="rounded-2xl border border-neutral-800/90 bg-neutral-900/30 p-6 sm:p-8 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
          <h2 className="text-base font-semibold text-white mb-1">Activity</h2>
          <p className="text-sm text-neutral-500 mb-6">Recent credits and debits on your wallet.</p>
          {recentRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-800 bg-neutral-950/40 px-6 py-10 text-center">
              <p className="text-sm font-medium text-neutral-300">No transactions yet</p>
              <p className="text-sm text-neutral-500 mt-2 max-w-sm mx-auto leading-relaxed">
                Add funds from your wallet page, or receive a Claim Link payout from an organiser.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-neutral-800/60">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-800 bg-neutral-900/80">
                    <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      Date
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      Type
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      Status
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/80">
                  {recentRows.map((r) => (
                    <tr key={r.id} className="bg-neutral-950/20">
                      <td className="py-3.5 px-4 text-neutral-300 whitespace-nowrap">
                        {r.date ? new Date(r.date).toLocaleString("en-GB") : "—"}
                      </td>
                      <td className="py-3.5 px-4 text-neutral-200">{r.typeLabel}</td>
                      <td className="py-3.5 px-4">
                        {r.statusLabel && r.statusVariant ? (
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(r.statusVariant)}`}
                          >
                            {r.statusLabel}
                          </span>
                        ) : (
                          <span className="text-neutral-600">—</span>
                        )}
                      </td>
                      <td
                        className={`py-3.5 px-4 text-right font-semibold tabular-nums ${
                          r.entry_type === "credit" ? "text-emerald-300" : "text-amber-200/95"
                        }`}
                      >
                        {r.entry_type === "credit" ? "+" : "−"}
                        {money(r.amount, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
