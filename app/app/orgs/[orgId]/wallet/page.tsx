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
    console.error("wallet_dashboard_ledger_aggregates failed (apply migration 20260331200000):", aggError.message);
  }

  const agg = (aggRaw ?? null) as Record<string, unknown> | null;
  const totals: WalletDashboardLedgerTotals = {
    totalFunded: Number(agg?.total_funded ?? 0),
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
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Link
          href={`/app/batches`}
          className="inline-flex items-center text-sm text-neutral-400 hover:text-white mb-6"
        >
          ← Back to payouts
        </Link>

        <Suspense fallback={null}>
          <WalletTopUpReturnHandler />
        </Suspense>

        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <h1 className="text-2xl font-semibold text-white">Wallet</h1>
          <div className="flex flex-wrap items-center gap-2">
            <WithdrawHeaderButton />
            <AddFundsButton orgId={orgId} addFundsBlockedReason={addFundsBlockedReason} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
            <div className="text-sm text-neutral-500 mb-1">Available</div>
            <div className="text-2xl font-semibold text-white">{money(available, currency)}</div>
            <div className="text-sm text-neutral-500 mt-3 mb-1">Pending</div>
            <div className="text-xl font-semibold text-neutral-200">{money(pending, currency)}</div>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
            <div className="text-sm text-neutral-500 mb-1">Currency</div>
            <div className="text-lg font-medium text-neutral-200">{currency}</div>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
            <div className="text-sm text-neutral-500 mb-1">Total funded</div>
            <div className="text-lg font-medium text-emerald-300">{money(totals.totalFunded, currency)}</div>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
            <div className="text-sm text-neutral-500 mb-1">Total sent</div>
            <div className="text-lg font-medium text-amber-300">{money(totals.totalSent, currency)}</div>
          </div>
        </div>

        <WithdrawTestPanel
          availableToWithdrawGbp={available}
          pendingFundsGbp={pending}
          hasConnectedBank={Boolean(connectAccount?.stripe_account_id)}
        />

        <div className="mb-8">
          <ImpactWalletCard userImpactTotal={userImpactTotal} currency={currency} schemaReady={impactSchemaReady} />
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
          <h2 className="text-sm font-medium text-neutral-400 mb-4">Recent transactions</h2>
          {recentRows.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No activity yet. Add funds or create a Bulk Send or Claim Link payout.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-neutral-500">
                  <tr>
                    <th className="text-left py-2 pr-4">Date</th>
                    <th className="text-left py-2 pr-4">Type</th>
                    <th className="text-left py-2 pr-4">Status</th>
                    <th className="text-right py-2">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRows.map((r) => (
                    <tr key={r.id} className="border-t border-neutral-800">
                      <td className="py-2 pr-4 text-neutral-300">
                        {r.date ? new Date(r.date).toLocaleString("en-GB") : "—"}
                      </td>
                      <td className="py-2 pr-4 text-neutral-300">{r.typeLabel}</td>
                      <td className="py-2 pr-4">
                        {r.statusLabel && r.statusVariant ? (
                          <span
                            className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(r.statusVariant)}`}
                          >
                            {r.statusLabel}
                          </span>
                        ) : (
                          <span className="text-neutral-600">—</span>
                        )}
                      </td>
                      <td
                        className={`py-2 text-right font-medium tabular-nums ${
                          r.entry_type === "credit" ? "text-emerald-300" : "text-amber-200"
                        }`}
                      >
                        {r.entry_type === "credit" ? "+" : "-"}
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
