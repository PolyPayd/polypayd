import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { LandingWaitlistForm } from "@/components/marketing/LandingWaitlistForm";

export const metadata: Metadata = {
  title: "PolyPayd — Bulk payouts, wallet-led, audit-ready",
  description:
    "PolyPayd is payout software for teams that fund batches, move money through wallets, and need recipients to claim with clarity — built for businesses, individuals, and partner-grade audit trails.",
};

const MAIL = "mailto:founder@polypayd.co.uk";

function SectionDivider() {
  return (
    <div className="relative h-px w-full overflow-hidden" aria-hidden>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.1] to-transparent" />
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
  align = "left",
}: {
  eyebrow: string;
  title: string;
  description: string;
  align?: "left" | "center";
}) {
  const wrap = align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-3xl";
  return (
    <div className={wrap}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6B7280]">{eyebrow}</p>
      <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#F9FAFB] sm:text-4xl sm:leading-[1.12]">
        {title}
      </h2>
      <p className="mt-4 text-base leading-relaxed text-[#9CA3AF] sm:text-lg">{description}</p>
    </div>
  );
}

function PrimaryCta({
  href,
  children,
  className = "",
  id,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <a
      id={id}
      href={href}
      className={`group relative inline-flex min-h-[48px] items-center justify-center overflow-hidden rounded-xl bg-[#3B82F6] px-7 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset,0_1px_2px_rgba(0,0,0,0.2),0_8px_24px_-6px_rgba(59,130,246,0.45)] transition-all duration-200 hover:bg-[#2563EB] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.1)_inset,0_12px_32px_-8px_rgba(59,130,246,0.55)] active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0F14] ${className}`}
    >
      <span className="relative z-10">{children}</span>
      <span
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-white/0 via-white/[0.07] to-white/0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        aria-hidden
      />
    </a>
  );
}

function SurfaceCard({
  children,
  className = "",
  hover = true,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.06] bg-[#121821] p-7 shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset] transition-all duration-300 sm:p-8 ${
        hover
          ? "hover:border-white/[0.1] hover:shadow-[0_24px_48px_-24px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.05)_inset]"
          : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

function ProductShot({
  label,
  hint,
  aspectClassName = "aspect-[16/10] sm:aspect-[2/1]",
  className = "",
}: {
  label: string;
  hint: string;
  aspectClassName?: string;
  className?: string;
}) {
  return (
    <div
      className={`group relative overflow-hidden rounded-[1.15rem] border border-white/[0.08] bg-[#121821] shadow-[0_28px_72px_-28px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.04)_inset] transition-[border-color,box-shadow] duration-500 hover:border-white/[0.12] ${className}`}
    >
      <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(59,130,246,0.05)_0%,transparent_45%)]" aria-hidden />
      <div className={`w-full bg-gradient-to-br from-[#1a2433] via-[#121821] to-[#0B0F14] ${aspectClassName}`} />
      <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center sm:p-10">
        <span className="rounded-full border border-white/[0.08] bg-[#0B0F14]/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#6B7280] backdrop-blur-sm">
          Placeholder
        </span>
        <p className="mt-4 text-sm font-medium text-[#9CA3AF] sm:text-base">{label}</p>
        <p className="mt-2 max-w-sm text-xs leading-relaxed text-[#6B7280] sm:text-[13px]">{hint}</p>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#0B0F14]/85 to-transparent opacity-70" aria-hidden />
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#0B0F14] text-[#F9FAFB] antialiased selection:bg-[#3B82F6]/30">
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[min(72vh,760px)] bg-[radial-gradient(ellipse_88%_58%_at_50%_-10%,rgba(59,130,246,0.13),transparent_56%)]"
        aria-hidden
      />

      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#0B0F14]/85 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
          <Link href="/" className="shrink-0 text-[15px] font-semibold tracking-tight text-[#F9FAFB]">
            PolyPayd
          </Link>
          <nav className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2 sm:gap-x-8">
            <a href="#businesses" className="hidden text-sm font-medium text-[#9CA3AF] transition-colors hover:text-[#F9FAFB] md:inline">
              Businesses
            </a>
            <a href="#bulk-payouts" className="hidden text-sm font-medium text-[#9CA3AF] transition-colors hover:text-[#F9FAFB] lg:inline">
              Bulk payouts
            </a>
            <a href="#audit" className="hidden text-sm font-medium text-[#9CA3AF] transition-colors hover:text-[#F9FAFB] lg:inline">
              Audit trail
            </a>
            <a href="#contact" className="text-sm font-medium text-[#9CA3AF] transition-colors hover:text-[#F9FAFB]">
              Contact
            </a>
            <Link
              href="/app"
              className="text-sm font-medium text-[#F9FAFB] transition-opacity hover:opacity-80"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main className="relative z-10">
        {/* Hero */}
        <section className="mx-auto max-w-7xl px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-20 lg:px-8 lg:pb-24 lg:pt-24">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#6B7280]">
              Wallet-led payouts · UK &amp; international programs
            </p>
            <h1 className="mt-5 bg-gradient-to-b from-[#F9FAFB] via-[#F9FAFB] to-[#94a3b8] bg-clip-text text-[2rem] font-semibold leading-[1.12] tracking-tight text-transparent sm:text-5xl sm:leading-[1.08] lg:text-[3.25rem] lg:leading-[1.05]">
              Run bulk payouts without losing the plot
            </h1>
            <p className="mx-auto mt-7 max-w-2xl text-base leading-[1.7] text-[#9CA3AF] sm:text-lg sm:leading-relaxed">
              PolyPayd is the operating layer for batch money movement: fund a wallet, group recipients into
              batches, and let people claim into their own wallets — with balances and activity your finance team
              can defend in a partner review.
            </p>
            <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:mt-11 sm:flex-row sm:justify-center sm:gap-4">
              <PrimaryCta id="early-access" href="#contact" className="w-full sm:w-auto sm:min-w-[200px]">
                Request access
              </PrimaryCta>
            </div>
          </div>

          <p className="mx-auto mt-14 max-w-2xl text-center text-xs leading-relaxed text-[#6B7280] sm:mt-16">
            Built for regulated payout contexts: clear states, traceable activity, and a product narrative that
            stands up next to infrastructure partners — without overclaiming what&apos;s still on the roadmap.
          </p>

          <div className="mx-auto mt-10 max-w-6xl sm:mt-12">
            <ProductShot
              label="Console overview"
              hint="Replace with dashboard screenshot: wallet, batch list, and funding status."
              aspectClassName="aspect-[4/3] sm:aspect-[16/9]"
            />
          </div>
        </section>

        <SectionDivider />

        {/* Businesses */}
        <section id="businesses" className="scroll-mt-24 py-20 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-14 xl:gap-20">
              <div className="max-w-xl">
                <SectionHeader
                  eyebrow="For organisations"
                  title="Businesses that move programme money"
                  description="Agencies, platforms, and in-house teams use PolyPayd when payouts are the product — not a side spreadsheet. One wallet, batched sends, and a recipient experience that doesn’t erode trust."
                />
                <ul className="mt-8 space-y-4 text-sm leading-relaxed text-[#9CA3AF] sm:text-[15px]">
                  <li className="flex gap-3">
                    <span className="mt-2 h-1 w-4 shrink-0 rounded-full bg-[#3B82F6]/90" aria-hidden />
                    Fund from your flow, then allocate across batches without double-counting available balance.
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-2 h-1 w-4 shrink-0 rounded-full bg-[#3B82F6]/90" aria-hidden />
                    Operators see the same language as finance: pending vs available, batch status, and what left the wallet.
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-2 h-1 w-4 shrink-0 rounded-full bg-[#3B82F6]/90" aria-hidden />
                    Room to align with your compliance story — activity is structured for review, not buried in exports.
                  </li>
                </ul>
              </div>
              <div className="mt-12 lg:mt-0">
                <ProductShot
                  label="Business / ops view"
                  hint="Screenshot: org wallet, batch pipeline, or role-appropriate summary."
                  aspectClassName="aspect-[4/3] sm:aspect-[3/2]"
                />
              </div>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* Individuals */}
        <section id="individuals" className="scroll-mt-24 border-t border-transparent py-20 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-14 xl:gap-20">
              <div className="order-2 mt-12 lg:order-1 lg:mt-0">
                <ProductShot
                  label="Recipient / individual flow"
                  hint="Screenshot: claim path, wallet credit, or clear balance after a payout event."
                  aspectClassName="aspect-[4/3] sm:aspect-[3/2]"
                />
              </div>
              <div className="order-1 max-w-xl lg:order-2">
                <SectionHeader
                  eyebrow="For people paid"
                  title="Individuals who need clarity, not confusion"
                  description="Recipients aren’t your back-office. PolyPayd keeps claiming and wallet credit understandable — fewer “where’s my money?” threads, more confidence in your programme."
                />
                <ul className="mt-8 space-y-4 text-sm leading-relaxed text-[#9CA3AF] sm:text-[15px]">
                  <li className="flex gap-3">
                    <span className="mt-2 h-1 w-4 shrink-0 rounded-full bg-emerald-500/80" aria-hidden />
                    Guided flows for joining and claiming, with honest copy about timing and state.
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-2 h-1 w-4 shrink-0 rounded-full bg-emerald-500/80" aria-hidden />
                    Wallet balance visibility that matches what your operations team sees on the other side.
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-2 h-1 w-4 shrink-0 rounded-full bg-emerald-500/80" aria-hidden />
                    Built to respect that for many users, this payment is high-stakes — UI stays calm and explicit.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* Bulk payouts */}
        <section id="bulk-payouts" className="scroll-mt-24 py-20 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeader
              eyebrow="Scale"
              title="Bulk payouts that stay legible"
              description="Volume is only useful if every row maps to a state you can explain. PolyPayd organises sends around batches and wallet debits so ‘what we intended’ and ‘what moved’ stay aligned."
            />
            <div className="mt-12 grid gap-6 lg:mt-14 lg:grid-cols-2 lg:gap-10">
              <SurfaceCard hover={false} className="border-white/[0.07]">
                <h3 className="text-lg font-semibold text-[#F9FAFB]">Batch-first, not blob-first</h3>
                <p className="mt-3 text-sm leading-relaxed text-[#9CA3AF]">
                  Group recipients and amounts into batches you can name, review, and fund deliberately — instead of
                  one opaque file drop and a hope.
                </p>
              </SurfaceCard>
              <SurfaceCard hover={false} className="border-white/[0.07]">
                <h3 className="text-lg font-semibold text-[#F9FAFB]">Funding that matches reality</h3>
                <p className="mt-3 text-sm leading-relaxed text-[#9CA3AF]">
                  Tie funding to batch lifecycle so available balance reflects what you can still send — critical
                  when partners ask how you control disbursement risk.
                </p>
              </SurfaceCard>
            </div>
            <div className="mx-auto mt-10 max-w-4xl lg:mt-12">
              <ProductShot
                label="Batch & funding"
                hint="Screenshot: batch detail, CSV or row view, or fund confirmation step."
                aspectClassName="aspect-[16/11] sm:aspect-[16/9]"
              />
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* Audit */}
        <section id="audit" className="scroll-mt-24 py-20 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="lg:grid lg:grid-cols-2 lg:items-center lg:gap-14 xl:gap-20">
              <div>
                <SectionHeader
                  eyebrow="Governance"
                  title="Tracking and audit trail"
                  description="When a payment partner or internal audit asks what happened, you need a straight answer. PolyPayd surfaces wallet activity and batch-related movement so you can reconstruct the story from the product — not from ad-hoc exports."
                />
                <div className="mt-10 space-y-4">
                  {[
                    "Chronological activity tied to wallet credits, debits, and batch context where applicable.",
                    "Separation of available vs pending so “in flight” doesn’t look like “lost”.",
                    "Designed to complement your PSP and banking partners — we focus on operator truth inside PolyPayd.",
                  ].map((t) => (
                    <div
                      key={t}
                      className="flex gap-3 rounded-xl border border-white/[0.06] bg-[#121821]/80 px-4 py-3.5 text-sm leading-relaxed text-[#9CA3AF]"
                    >
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#3B82F6]" aria-hidden />
                      {t}
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-12 lg:mt-0">
                <ProductShot
                  label="Activity & audit"
                  hint="Screenshot: transaction list, filters, or export-friendly activity view."
                  aspectClassName="aspect-[4/3] sm:aspect-[3/2]"
                />
              </div>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* Problem — tight */}
        <section className="py-20 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeader
              eyebrow="Why change"
              title="What breaks today"
              description="Most teams don’t fail on intent — they fail on coherence between tools, bank reality, and what recipients experience."
            />
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:mt-14 lg:grid-cols-3 lg:gap-6">
              {[
                {
                  title: "Split-brain balances",
                  body: "Spreadsheets, the bank, and your app each tell a different story about what’s left to send.",
                },
                {
                  title: "Fragile handoffs",
                  body: "Files and emails don’t carry state — so every payout run becomes a bespoke rescue mission.",
                },
                {
                  title: "Recipient doubt",
                  body: "When claiming feels opaque, trust erodes fast — especially for stipends, refunds, and programme pay.",
                },
              ].map((item) => (
                <SurfaceCard key={item.title}>
                  <h3 className="text-base font-semibold text-[#F9FAFB]">{item.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-[#9CA3AF]">{item.body}</p>
                </SurfaceCard>
              ))}
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* Solution */}
        <section className="py-20 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeader
              eyebrow="Product"
              title="One system of record for the payout journey"
              description="PolyPayd anchors on the wallet and the batch — so funding, sending, and claiming read as one continuous flow."
            />
            <div className="mt-12 grid gap-6 lg:mt-14 lg:grid-cols-2 lg:gap-8">
              <SurfaceCard>
                <h3 className="text-xl font-semibold text-[#F9FAFB]">Operator-grade clarity</h3>
                <p className="mt-4 text-sm leading-relaxed text-[#9CA3AF] sm:text-[15px]">
                  Status and balance language that holds up in a stand-up and in a compliance thread — not a dashboard
                  that only looks good in a mock.
                </p>
              </SurfaceCard>
              <SurfaceCard>
                <h3 className="text-xl font-semibold text-[#F9FAFB]">Built to extend</h3>
                <p className="mt-4 text-sm leading-relaxed text-[#9CA3AF] sm:text-[15px]">
                  Structured for more orgs, wallets, and currencies over time — so you’re not boxed into a one-off
                  payout hack.
                </p>
              </SurfaceCard>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* Why PolyPayd */}
        <section className="py-20 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeader
              eyebrow="Principles"
              title="Why teams take PolyPayd seriously"
              description="We optimise for credibility with your users and with partners who care how money is moved — not for vanity metrics on a landing page."
            />
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:mt-14 lg:gap-5">
              {[
                {
                  title: "Honest surfaces",
                  body: "No dark patterns in claiming; no fake urgency. States match what the ledger can support.",
                },
                {
                  title: "Traceable movement",
                  body: "Activity is first-class — so you’re not reconstructing history from screenshots.",
                },
                {
                  title: "Serious UI discipline",
                  body: "Fintech-grade interaction design: readable typography, resilient layouts, calm feedback.",
                },
                {
                  title: "Partner-ready posture",
                  body: "We expect you’ll bring PSPs and infrastructure vendors — PolyPayd is built to sit clearly in that stack.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="flex gap-4 rounded-2xl border border-white/[0.06] bg-[#121821]/60 p-6 transition-colors duration-300 hover:border-white/[0.1] hover:bg-[#121821] sm:p-7"
                >
                  <span
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#3B82F6] shadow-[0_0_12px_rgba(59,130,246,0.45)]"
                    aria-hidden
                  />
                  <div>
                    <h3 className="font-semibold text-[#F9FAFB]">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#9CA3AF]">{item.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* Impact */}
        <section className="relative overflow-hidden py-20 sm:py-24 lg:py-28">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_20%_50%,rgba(34,197,94,0.05),transparent),radial-gradient(ellipse_55%_50%_at_85%_25%,rgba(59,130,246,0.07),transparent)]"
            aria-hidden
          />
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="lg:grid lg:grid-cols-12 lg:items-center lg:gap-12">
              <div className="lg:col-span-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6B7280]">Impact</p>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#F9FAFB] sm:text-4xl sm:leading-[1.15]">
                  Social impact, embedded — not bolted on
                </h2>
                <p className="mt-5 text-base leading-relaxed text-[#9CA3AF] sm:text-lg">
                  When payouts support stipends, community programmes, or matched giving, the mechanics should stay
                  as rigorous as commercial sends. PolyPayd keeps impact visible alongside the same wallet and batch
                  primitives your ops team already uses.
                </p>
              </div>
              <div className="mt-10 lg:col-span-7 lg:mt-0">
                <SurfaceCard className="border-emerald-500/[0.07] bg-gradient-to-br from-[#121821] to-[#0f141c]" hover={false}>
                  <ul className="space-y-4 text-sm leading-relaxed text-[#9CA3AF] sm:text-[15px]">
                    {[
                      "Align programme narrative with actual money movement — recipients and auditors see a coherent story.",
                      "Avoid “impact as a label” without ledger discipline; structure matters when funds are scrutinised.",
                      "Evolve programmes without rewriting your payout stack from scratch.",
                    ].map((line) => (
                      <li key={line} className="flex gap-3">
                        <span className="mt-2 h-px w-5 shrink-0 bg-emerald-500/35" aria-hidden />
                        {line}
                      </li>
                    ))}
                  </ul>
                </SurfaceCard>
              </div>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* How it works */}
        <section className="py-20 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeader
              eyebrow="Flow"
              title="How it works"
              description="Fund once, batch sends, recipients claim — with activity you can walk through in a review."
            />
            <ol className="mt-12 grid gap-6 lg:mt-14 lg:grid-cols-3 lg:gap-8">
              {[
                {
                  step: "01",
                  title: "Fund the wallet",
                  body: "Top up through your connected flow. Available vs pending is explicit before you allocate.",
                },
                {
                  step: "02",
                  title: "Create and fund batches",
                  body: "Define recipients and amounts per batch; fund when you’re ready so debits match intent.",
                },
                {
                  step: "03",
                  title: "Recipients claim",
                  body: "Individuals complete the claim path; credits land in wallets with clear activity behind them.",
                },
              ].map((item) => (
                <li key={item.step} className="relative">
                  <SurfaceCard className="h-full border-white/[0.07] pt-9">
                    <span className="absolute left-8 top-0 inline-flex -translate-y-1/2 rounded-lg border border-white/[0.08] bg-[#0B0F14] px-2.5 py-1 text-[11px] font-bold tabular-nums tracking-wide text-[#3B82F6] shadow-sm">
                      {item.step}
                    </span>
                    <h3 className="text-lg font-semibold text-[#F9FAFB]">{item.title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-[#9CA3AF]">{item.body}</p>
                  </SurfaceCard>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <SectionDivider />

        {/* Contact / waitlist */}
        <section className="py-20 sm:py-24 lg:pb-28 lg:pt-24" aria-labelledby="contact-heading">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <h2 id="contact-heading" className="sr-only">
              Contact and waitlist
            </h2>
            <LandingWaitlistForm id="contact" />
          </div>
        </section>

        {/* Closing CTA — partner tone */}
        <section id="footer-cta" className="scroll-mt-24 pb-20 sm:pb-24 lg:pb-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="relative overflow-hidden rounded-[1.35rem] border border-white/[0.1] bg-[#121821] px-6 py-12 shadow-[0_32px_64px_-32px_rgba(0,0,0,0.75)] sm:px-10 sm:py-14 lg:px-14 lg:py-16">
              <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#3B82F6]/15 blur-3xl" aria-hidden />
              <div className="pointer-events-none absolute -bottom-28 -left-20 h-80 w-80 rounded-full bg-[#3B82F6]/10 blur-3xl" aria-hidden />
              <div className="relative mx-auto max-w-3xl text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6B7280]">
                  Payment partners &amp; programmes
                </p>
                <h2 className="mt-4 text-2xl font-semibold tracking-tight text-[#F9FAFB] sm:text-3xl sm:leading-[1.15] lg:text-[2rem]">
                  Evaluating PolyPayd for a production payout stack?
                </h2>
                <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-[#9CA3AF] sm:text-base">
                  We work well alongside payment service providers and banking partners: PolyPayd is the operator and
                  recipient layer — wallet truth, batches, and claims — while you retain your acquiring, issuing, and
                  settlement relationships. No fabricated volumes; we&apos;ll walk through architecture and controls
                  directly.
                </p>
                <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:justify-center sm:gap-4">
                  <PrimaryCta href="#contact" className="w-full sm:w-auto">
                    Request access
                  </PrimaryCta>
                </div>
                <p className="mx-auto mt-8 max-w-lg text-xs leading-relaxed text-[#6B7280]">
                  Direct line:{" "}
                  <a
                    href={MAIL}
                    className="font-medium text-[#9CA3AF] underline decoration-white/15 underline-offset-[5px] transition-colors hover:text-[#F9FAFB]"
                  >
                    founder@polypayd.co.uk
                  </a>
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.06] bg-[#0B0F14] py-10 sm:py-12">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 sm:flex-row sm:items-start sm:justify-between sm:px-6 lg:px-8">
          <div className="max-w-md text-center sm:text-left">
            <p className="text-sm font-semibold text-[#F9FAFB]">PolyPayd</p>
            <p className="mt-2 text-xs leading-relaxed text-[#6B7280]">
              Payout software for wallet-led bulk sends and recipient claims. © {new Date().getFullYear()} PolyPayd.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6 sm:justify-end sm:gap-8">
            <a href="#contact" className="text-xs font-medium text-[#9CA3AF] transition-colors hover:text-[#F9FAFB]">
              Contact
            </a>
            <a href="#audit" className="text-xs font-medium text-[#9CA3AF] transition-colors hover:text-[#F9FAFB]">
              Audit &amp; activity
            </a>
            <Link href="/app" className="text-xs font-medium text-[#9CA3AF] transition-colors hover:text-[#F9FAFB]">
              App sign-in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
