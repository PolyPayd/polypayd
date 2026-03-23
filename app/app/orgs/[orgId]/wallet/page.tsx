import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureWalletForUser } from "@/lib/wallet";
import { AddFundsButton } from "./AddFundsButton";
import { ImpactWalletCard } from "@/components/impact/ImpactWalletCard";
import { fetchUserImpactContributionTotal } from "@/lib/impact";

export const dynamic = "force-dynamic";

type Params = { orgId: string };

function money(amount: number, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
}

function mapLedgerReferenceType(refType: string) {
  if (refType === "batch_run") return "Bulk Send";
  if (refType === "batch_payout") return "Claim Link Payout";
  return refType;
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

  let totalFunded = 0;
  let totalSent = 0;
  const recentRows: Array<{ id: string; date: string; reference_type: string; entry_type: string; amount: number }> = [];

  const { data: entries } = await supabase
    .from("ledger_entries")
    .select("id, amount, entry_type, created_at, ledger_transactions(reference_type, created_at)")
    .eq("wallet_id", wallet.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (entries) {
    for (const row of entries) {
      const txn = row.ledger_transactions as { reference_type?: string; created_at?: string } | null;
      const refType = txn?.reference_type ?? "—";
      const mappedRefType = mapLedgerReferenceType(refType);
      const amt = Number(row.amount ?? 0);
      if (row.entry_type === "credit" && refType === "wallet_funding") totalFunded += amt;
      if (row.entry_type === "debit") totalSent += amt;
      recentRows.push({
        id: row.id ?? "",
        date: row.created_at ?? "",
        reference_type: mappedRefType,
        entry_type: row.entry_type ?? "—",
        amount: amt,
      });
    }
  }

  const balance = wallet.current_balance;

  const { total: userImpactTotal, schemaReady: impactSchemaReady } = await fetchUserImpactContributionTotal(
    supabase,
    userId,
    currency
  );

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Link
          href={`/app/batches`}
          className="inline-flex items-center text-sm text-neutral-400 hover:text-white mb-6"
        >
          ← Back to payouts
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <h1 className="text-2xl font-semibold text-white">Wallet</h1>
          <AddFundsButton orgId={orgId} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
            <div className="text-sm text-neutral-500 mb-1">Current balance</div>
            <div className="text-2xl font-semibold text-white">{money(balance, currency)}</div>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
            <div className="text-sm text-neutral-500 mb-1">Currency</div>
            <div className="text-lg font-medium text-neutral-200">{currency}</div>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
            <div className="text-sm text-neutral-500 mb-1">Total funded</div>
            <div className="text-lg font-medium text-emerald-300">{money(totalFunded, currency)}</div>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
            <div className="text-sm text-neutral-500 mb-1">Total sent</div>
            <div className="text-lg font-medium text-amber-300">{money(totalSent, currency)}</div>
          </div>
        </div>

        <div className="mb-8">
          <ImpactWalletCard userImpactTotal={userImpactTotal} currency={currency} schemaReady={impactSchemaReady} />
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
          <h2 className="text-sm font-medium text-neutral-400 mb-4">Recent transactions</h2>
          {recentRows.length === 0 ? (
            <p className="text-sm text-neutral-500">No payouts yet. Start by creating a Bulk Send or Claim Link.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-neutral-500">
                  <tr>
                    <th className="text-left py-2 pr-4">Date</th>
                    <th className="text-left py-2 pr-4">Type</th>
                    <th className="text-left py-2 pr-4">Entry</th>
                    <th className="text-right py-2">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRows.map((r) => (
                    <tr key={r.id} className="border-t border-neutral-800">
                      <td className="py-2 pr-4 text-neutral-300">
                        {r.date ? new Date(r.date).toLocaleString("en-GB") : "—"}
                      </td>
                      <td className="py-2 pr-4 text-neutral-300">{r.reference_type}</td>
                      <td className="py-2 pr-4">
                        <span className={r.entry_type === "credit" ? "text-emerald-300" : "text-amber-300"}>
                          {r.entry_type}
                        </span>
                      </td>
                      <td className="py-2 text-right font-medium text-neutral-200">
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
