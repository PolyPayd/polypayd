import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchImpactDashboardData, formatImpactMoney } from "@/lib/impact";
import { ImpactHero } from "./_components/ImpactHero";
import { ImpactBreakdown } from "./_components/ImpactBreakdown";
import { ImpactFeed } from "./_components/ImpactFeed";
import { ImpactPartners } from "./_components/ImpactPartners";
import { FadeIn } from "@/components/impact/FadeIn";

export const dynamic = "force-dynamic";

function statusPill(status: string) {
  const s = status.toLowerCase();
  const base = "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide";
  if (s === "posted") return `${base} border border-emerald-500/40 bg-emerald-950/50 text-emerald-200`;
  if (s === "pending") return `${base} border border-amber-500/40 bg-amber-950/40 text-amber-200`;
  if (s === "failed") return `${base} border border-red-500/40 bg-red-950/40 text-red-200`;
  return `${base} border border-neutral-700 bg-neutral-900 text-neutral-300`;
}

export default async function ImpactPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const data = await fetchImpactDashboardData(supabaseAdmin(), userId);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/app/wallet" className="mb-6 inline-flex text-sm text-neutral-400 hover:text-white">
        ← Wallet
      </Link>

      {!data.schemaReady && (
        <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-950/20 px-4 py-3 text-sm text-amber-100">
          Impact tables are not deployed yet. Run the impact pool migration (<code className="text-amber-200/90">20260319130000_impact_pool.sql</code>)
          to enable live data.
        </div>
      )}

      {data.schemaReady && data.totalAllTime === 0 && (
        <p className="mb-4 rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3 text-sm text-neutral-400">
          These numbers are <span className="text-neutral-200">your</span> impact from platform fees on payouts{" "}
          <strong className="text-neutral-300">you fund</strong> (Claim Link or Bulk Send). Receiving money from someone
          else&apos;s batch does not add impact here.
        </p>
      )}

      <ImpactHero
        totalAllTime={data.totalAllTime}
        totalThisMonth={data.totalThisMonth}
        livesEstimate={data.livesEstimate}
        currency={data.currency}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ImpactBreakdown breakdown={data.breakdown} currency={data.currency} />
        <ImpactFeed items={data.feed} currency={data.currency} />
      </div>

      <div className="mt-6">
        <ImpactPartners />
      </div>

      <FadeIn delayMs={200} className="mt-6">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
          <h2 className="text-sm font-semibold text-white">Distribution history</h2>
          <p className="mt-1 text-xs text-neutral-500">Charity and programme payouts (future)</p>

          {data.distributions.length === 0 ? (
            <p className="mt-6 rounded-lg border border-dashed border-neutral-800 py-10 text-center text-sm text-neutral-500">
              No distributions recorded yet. When grants are posted, they will appear here.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="pb-3 pr-4 font-medium">Beneficiary</th>
                    <th className="pb-3 pr-4 font-medium">Amount</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {data.distributions.map((d) => (
                    <tr key={d.id} className="text-neutral-300">
                      <td className="py-3 pr-4 font-medium text-white">{d.beneficiaryName}</td>
                      <td className="py-3 pr-4">{formatImpactMoney(d.amount, d.currency)}</td>
                      <td className="py-3 pr-4">
                        <span className={statusPill(d.status)}>{d.status}</span>
                      </td>
                      <td className="py-3 text-neutral-500">
                        {d.createdAt ? new Date(d.createdAt).toLocaleDateString("en-GB") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </FadeIn>
    </div>
  );
}
