import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "PolyPayd — Bulk payouts, simplified",
  description:
    "Run batch payouts, fund wallets, and let recipients claim on their terms — with clear balances and a premium operator experience.",
};

const MAIL = "mailto:hello@polypayd.com";

function SectionDivider() {
  return (
    <div className="relative h-px w-full overflow-hidden" aria-hidden>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.12] to-transparent" />
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
      <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#F9FAFB] sm:text-4xl sm:leading-[1.15]">
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
      className={`group relative inline-flex min-h-12 items-center justify-center overflow-hidden rounded-xl bg-[#3B82F6] px-7 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset,0_1px_2px_rgba(0,0,0,0.2),0_8px_24px_-6px_rgba(59,130,246,0.45)] transition-all duration-200 hover:bg-[#2563EB] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.1)_inset,0_12px_32px_-8px_rgba(59,130,246,0.55)] active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0F14] ${className}`}
    >
      <span className="relative z-10">{children}</span>
      <span
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-white/0 via-white/[0.07] to-white/0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        aria-hidden
      />
    </a>
  );
}

function SecondaryCta({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={href}
      className={`inline-flex min-h-12 items-center justify-center rounded-xl border border-white/[0.1] bg-[#121821]/80 px-7 text-sm font-semibold text-[#F9FAFB] shadow-sm shadow-black/20 backdrop-blur-sm transition-all duration-200 hover:border-white/[0.18] hover:bg-[#161F2B] hover:shadow-md hover:shadow-black/30 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0F14] ${className}`}
    >
      {children}
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

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#0B0F14] text-[#F9FAFB] antialiased selection:bg-[#3B82F6]/30">
      {/* Ambient hero glow */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[min(70vh,720px)] bg-[radial-gradient(ellipse_85%_55%_at_50%_-8%,rgba(59,130,246,0.14),transparent_55%)]"
        aria-hidden
      />

      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#0B0F14]/80 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
          <Link href="/" className="text-[15px] font-semibold tracking-tight text-[#F9FAFB] transition-opacity hover:opacity-90">
            PolyPayd
          </Link>
          <nav className="flex items-center gap-6">
            <a
              href="#footer-cta"
              className="hidden text-sm font-medium text-[#9CA3AF] transition-colors hover:text-[#F9FAFB] sm:inline"
            >
              Get started
            </a>
            <Link
              href="/app"
              className="text-sm font-medium text-[#9CA3AF] transition-colors hover:text-[#F9FAFB]"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main className="relative z-10">
        {/* Hero */}
        <section className="mx-auto max-w-7xl px-4 pb-20 pt-16 sm:px-6 sm:pb-24 sm:pt-20 lg:px-8 lg:pb-28 lg:pt-24">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#6B7280]">
              Payout infrastructure
            </p>
            <h1 className="mt-5 bg-gradient-to-b from-[#F9FAFB] via-[#F9FAFB] to-[#9CA3AF] bg-clip-text text-4xl font-semibold tracking-tight text-transparent sm:text-5xl sm:leading-[1.08] lg:text-[3.5rem] lg:leading-[1.06]">
              Bulk payouts, simplified
            </h1>
            <p className="mx-auto mt-8 max-w-2xl text-lg leading-[1.65] text-[#9CA3AF] sm:text-xl sm:leading-relaxed">
              PolyPayd helps teams send money at scale — fund batches, track every movement, and give recipients
              a calm, credible path to claim. Built for operators who need control without spreadsheet chaos.
            </p>
            <div className="mt-11 flex flex-col items-stretch justify-center gap-3 sm:mt-12 sm:flex-row sm:items-center sm:gap-4">
              <PrimaryCta
                id="early-access"
                href={`${MAIL}?subject=${encodeURIComponent("Early access request")}`}
                className="w-full sm:w-auto"
              >
                Request Early Access
              </PrimaryCta>
              <SecondaryCta
                href={`${MAIL}?subject=${encodeURIComponent("Contact — PolyPayd")}`}
                className="w-full sm:w-auto"
              >
                Contact
              </SecondaryCta>
            </div>
          </div>

          <div className="mx-auto mt-16 max-w-6xl sm:mt-20 lg:mt-24">
            <div className="group relative overflow-hidden rounded-[1.25rem] border border-white/[0.08] bg-[#121821] shadow-[0_32px_80px_-28px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.04)_inset] transition-[border-color,box-shadow] duration-500 hover:border-white/[0.12] hover:shadow-[0_40px_96px_-32px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.06)_inset]">
              <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(59,130,246,0.06)_0%,transparent_42%,transparent_100%)]" aria-hidden />
              <div className="aspect-[16/9] w-full bg-gradient-to-br from-[#1a2433] via-[#121821] to-[#0B0F14] sm:aspect-[16/8]" />
              <div className="absolute inset-0 flex items-center justify-center p-10">
                <div className="text-center">
                  <p className="text-sm font-medium text-[#9CA3AF] sm:text-base">Product preview</p>
                  <p className="mt-2 text-xs text-[#6B7280]">Drop in a hero image, Lottie, or embedded demo</p>
                </div>
              </div>
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0B0F14]/90 to-transparent opacity-60"
                aria-hidden
              />
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* Who it's for */}
        <section className="py-20 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeader
              eyebrow="Audience"
              title="Who it’s for"
              description="Teams that run recurring or one-off payouts and can’t afford ambiguity — from internal programs to external recipient networks."
            />
            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:mt-16 lg:grid-cols-3 lg:gap-6">
              {[
                {
                  title: "Program operators",
                  body: "Foundations, agencies, and ops leads who batch funds, monitor balances, and need a single source of truth.",
                },
                {
                  title: "Product & platform teams",
                  body: "Builders embedding payouts into a flow — you want APIs and UX that feel as serious as the money moving.",
                },
                {
                  title: "Finance & compliance",
                  body: "Stakeholders who care about clear audit trails, predictable states, and fewer manual reconciliations.",
                },
              ].map((item) => (
                <SurfaceCard key={item.title}>
                  <div className="mb-4 h-1 w-8 rounded-full bg-[#3B82F6]/80" aria-hidden />
                  <h3 className="text-lg font-semibold text-[#F9FAFB]">{item.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-[#9CA3AF]">{item.body}</p>
                </SurfaceCard>
              ))}
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* Problem */}
        <section className="py-20 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeader
              eyebrow="Reality"
              title="Where bulk payouts break"
              description="Volume isn’t the hard part — coherence is. When systems don’t agree, everyone pays in time and trust."
            />
            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:mt-16 lg:grid-cols-3 lg:gap-6">
              {[
                {
                  title: "Opaque balances",
                  body: "Hard to see what’s funded, pending, or already sent — especially across batches and time zones.",
                },
                {
                  title: "Fragile workflows",
                  body: "CSV gymnastics and one-off emails don’t scale when timing, approvals, and audit matter.",
                },
                {
                  title: "Recipient friction",
                  body: "People need a simple, trustworthy way to claim without ticket queues and follow-up churn.",
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
              eyebrow="Approach"
              title="One surface for fund → send → reconcile"
              description="PolyPayd centres the wallet and the batch — so your team sees the same numbers your recipients experience."
            />
            <div className="mt-14 grid gap-6 lg:mt-16 lg:grid-cols-2 lg:gap-8">
              <SurfaceCard>
                <h3 className="text-xl font-semibold text-[#F9FAFB]">Operational clarity</h3>
                <p className="mt-4 text-sm leading-relaxed text-[#9CA3AF] sm:text-[15px] sm:leading-relaxed">
                  Available vs pending, batch status, and activity in one premium dashboard — fewer surprises,
                  faster decisions, less back-and-forth.
                </p>
              </SurfaceCard>
              <SurfaceCard>
                <h3 className="text-xl font-semibold text-[#F9FAFB]">Built to grow with you</h3>
                <p className="mt-4 text-sm leading-relaxed text-[#9CA3AF] sm:text-[15px] sm:leading-relaxed">
                  From funding to distribution, PolyPayd is structured for real-money programs — with a path to
                  more wallets, currencies, and account types as you expand.
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
              eyebrow="Trust"
              title="Why PolyPayd"
              description="Principles we design around — so your payout story holds up in the room where decisions get made."
            />
            <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:mt-16 lg:gap-5">
              {[
                {
                  title: "Money-grade UX",
                  body: "Interfaces that respect the weight of moving cash — clear states, no noisy chrome.",
                },
                {
                  title: "Honest ledgers",
                  body: "Activity you can trace; balances that match what operators and recipients see.",
                },
                {
                  title: "Operational rigour",
                  body: "Flows that hold up under scale, edge cases, and the occasional long day in finance.",
                },
                {
                  title: "Partnership posture",
                  body: "We’re building with teams who ship — feedback shapes the roadmap, not slide decks.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="flex gap-4 rounded-2xl border border-white/[0.06] bg-[#121821]/50 p-6 transition-colors duration-300 hover:border-white/[0.1] hover:bg-[#121821] sm:p-7"
                >
                  <span
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#3B82F6] shadow-[0_0_12px_rgba(59,130,246,0.5)]"
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

        {/* Social impact */}
        <section className="relative overflow-hidden py-20 sm:py-24 lg:py-28">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_20%_50%,rgba(34,197,94,0.06),transparent),radial-gradient(ellipse_60%_50%_at_80%_30%,rgba(59,130,246,0.08),transparent)]"
            aria-hidden
          />
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="lg:grid lg:grid-cols-12 lg:gap-12 lg:items-center">
              <div className="lg:col-span-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6B7280]">Impact</p>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#F9FAFB] sm:text-4xl sm:leading-[1.15]">
                  Built for embedded social impact
                </h2>
                <p className="mt-5 text-base leading-relaxed text-[#9CA3AF] sm:text-lg">
                  When payouts carry purpose — community support, participant stipends, matched giving — the
                  product should make that intent visible without complicating the ledger. PolyPayd is designed so
                  impact can sit alongside commercial flows, not as an afterthought.
                </p>
              </div>
              <div className="mt-12 lg:col-span-7 lg:mt-0">
                <SurfaceCard className="border-emerald-500/[0.08] bg-gradient-to-br from-[#121821] to-[#0f141c]">
                  <ul className="space-y-5">
                    {[
                      "Surface contribution context where it helps recipients and admins — not as marketing fluff.",
                      "Keep impact accounting aligned with payout mechanics so reporting stays credible.",
                      "Room to evolve: programs change; your stack shouldn’t force a rewrite to do good.",
                    ].map((line) => (
                      <li key={line} className="flex gap-3 text-sm leading-relaxed text-[#9CA3AF] sm:text-[15px]">
                        <span className="mt-2 h-px w-6 shrink-0 bg-emerald-500/40" aria-hidden />
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
              description="From wallet funding to recipient claim — a straight line your team can explain in one sentence."
            />
            <ol className="mt-14 grid gap-6 lg:mt-16 lg:grid-cols-3 lg:gap-8">
              {[
                {
                  step: "01",
                  title: "Fund your wallet",
                  body: "Top up through a controlled flow and know exactly what’s available for the next batch.",
                },
                {
                  step: "02",
                  title: "Create and send batches",
                  body: "Define recipients and amounts — PolyPayd keeps states honest as money moves through the system.",
                },
                {
                  step: "03",
                  title: "Recipients claim",
                  body: "A clear, guided experience on their side — with visibility your team can rely on.",
                },
              ].map((item) => (
                <li key={item.step} className="relative">
                  <SurfaceCard className="h-full pt-8">
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

        {/* Footer CTA */}
        <section id="footer-cta" className="py-20 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="relative overflow-hidden rounded-[1.35rem] border border-white/[0.1] bg-[#121821] px-6 py-14 shadow-[0_32px_64px_-32px_rgba(0,0,0,0.75)] sm:px-12 sm:py-16 lg:px-16 lg:py-20">
              <div
                className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#3B82F6]/20 blur-3xl"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-[#3B82F6]/10 blur-3xl"
                aria-hidden
              />
              <div className="relative mx-auto max-w-3xl text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6B7280]">Start the conversation</p>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#F9FAFB] sm:text-4xl sm:leading-[1.12] lg:text-[2.75rem]">
                  Ship payouts your team is proud to stand behind
                </h2>
                <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-[#9CA3AF] sm:text-lg">
                  We&apos;re onboarding a small group of design partners. Share your use case, volumes, and
                  timeline — we&apos;ll respond with a focused next step, not a generic deck.
                </p>
                <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:justify-center sm:gap-4">
                  <PrimaryCta
                    href={`${MAIL}?subject=${encodeURIComponent("Early access request")}`}
                    className="w-full sm:w-auto"
                  >
                    Request Early Access
                  </PrimaryCta>
                  <SecondaryCta
                    href={`${MAIL}?subject=${encodeURIComponent("Contact — PolyPayd")}`}
                    className="w-full border-white/[0.12] bg-transparent sm:w-auto hover:bg-white/[0.04]"
                  >
                    Talk to us
                  </SecondaryCta>
                </div>
                <p className="mx-auto mt-8 max-w-md text-xs leading-relaxed text-[#6B7280]">
                  Prefer email?{" "}
                  <a
                    href={MAIL}
                    className="font-medium text-[#9CA3AF] underline decoration-white/20 underline-offset-4 transition-colors hover:text-[#F9FAFB] hover:decoration-white/40"
                  >
                    hello@polypayd.com
                  </a>
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.06] bg-[#0B0F14] py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 sm:flex-row sm:px-6 lg:px-8">
          <div className="text-center sm:text-left">
            <p className="text-sm font-semibold text-[#F9FAFB]">PolyPayd</p>
            <p className="mt-1 text-xs text-[#6B7280]">© {new Date().getFullYear()} PolyPayd. All rights reserved.</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6 sm:justify-end">
            <a
              href="#footer-cta"
              className="text-xs font-medium text-[#9CA3AF] transition-colors hover:text-[#F9FAFB]"
            >
              Early access
            </a>
            <Link href="/app" className="text-xs font-medium text-[#9CA3AF] transition-colors hover:text-[#F9FAFB]">
              Sign in to app
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
