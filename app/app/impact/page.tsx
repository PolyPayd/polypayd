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
  if (s === "posted") return `${base} bg-[#22C55E]/15 text-[#86EFAC]`;
  if (s === "pending") return `${base} bg-[#F59E0B]/15 text-[#FCD34D]`;
  if (s === "failed") return `${base} bg-[#EF4444]/15 text-[#FCA5A5]`;
  return `${base} bg-white/[0.08] text-[#9CA3AF]`;
}

export default async function ImpactPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const data = await fetchImpactDashboardData(supabaseAdmin(), userId);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-5 sm:py-10">
      <Link
        href="/app/wallet"
        className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-[#9CA3AF] transition-colors hover:text-[#F9FAFB]"
      >
        <span className="text-[#6B7280]" aria-hidden>
          ←
        </span>
        Wallet
      </Link>

      {!data.schemaReady && (
        <div className="mb-8 rounded-xl bg-[#F59E0B]/10 px-4 py-3 text-sm text-[#FCD34D]">
          Impact tables are not deployed yet. Run the impact pool migration (<code className="text-[#FBBF24]/90">20260319130000_impact_pool.sql</code>)
          to enable live data.
        </div>
      )}

      {data.schemaReady && data.totalAllTime === 0 && (
        <p className="mb-8 rounded-xl bg-[#121821] px-4 py-4 text-sm leading-relaxed text-[#9CA3AF]">
          These numbers are <span className="text-[#F9FAFB]">your</span> impact from platform fees on payouts{" "}
          <span className="font-semibold text-[#F9FAFB]">you fund</span> (Claim Link or Bulk Send). Receiving money from
          someone else&apos;s batch does not add impact here.
        </p>
      )}

      <ImpactHero
        totalAllTime={data.totalAllTime}
        totalThisMonth={data.totalThisMonth}
        livesEstimate={data.livesEstimate}
        currency={data.currency}
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-2 lg:gap-8">
        <ImpactBreakdown breakdown={data.breakdown} currency={data.currency} />
        <ImpactFeed items={data.feed} currency={data.currency} />
      </div>

      <div className="mt-8">
        <ImpactPartners />
      </div>

      <FadeIn delayMs={200} className="mt-8">
        <div className="rounded-2xl border border-white/[0.05] bg-[#121821] p-6 sm:p-7">
          <h2 className="text-base font-semibold text-[#F9FAFB]">Distribution history</h2>
          <p className="mt-1 text-xs text-[#6B7280]">Charity and programme payouts (future)</p>

          {data.distributions.length === 0 ? (
            <p className="mt-8 py-10 text-center text-sm text-[#6B7280]">
              No distributions recorded yet. When grants are posted, they will appear here.
            </p>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-[#6B7280]">
                  <tr>
                    <th className="pb-3 pr-4 font-medium">Beneficiary</th>
                    <th className="pb-3 pr-4 font-medium">Amount</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data.distributions.map((d, i) => (
                    <tr
                      key={d.id}
                      className={`text-[#9CA3AF] transition-colors hover:bg-white/[0.02] ${i > 0 ? "border-t border-white/[0.04]" : ""}`}
                    >
                      <td className="py-3.5 pr-4 font-medium text-[#F9FAFB]">{d.beneficiaryName}</td>
                      <td className="py-3.5 pr-4 tabular-nums">{formatImpactMoney(d.amount, d.currency)}</td>
                      <td className="py-3.5 pr-4">
                        <span className={statusPill(d.status)}>{d.status}</span>
                      </td>
                      <td className="py-3.5 text-[#6B7280]">
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
