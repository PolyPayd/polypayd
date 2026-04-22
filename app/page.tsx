import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { GroupsWaitlistForm } from "@/components/marketing/GroupsWaitlistForm";

export const metadata: Metadata = {
  title: "PolyPayd: pay out to your group without the chase",
  description:
    "PolyPayd is the easy way to pay out to a group. Top up once, share a link, your people claim their share, and the money lands in their bank. Built for ajo, susu, pardner groups, small businesses, clubs, and creators.",
  alternates: { canonical: "/" },
};

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
  description?: string;
  align?: "left" | "center";
}) {
  const wrap = align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-3xl";
  return (
    <div className={wrap}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6B7280]">{eyebrow}</p>
      <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#F9FAFB] sm:text-4xl sm:leading-[1.12]">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-base leading-relaxed text-[#9CA3AF] sm:text-lg">{description}</p>
      ) : null}
    </div>
  );
}

function PrimaryCta({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
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

const AUDIENCE_CARDS: Array<{ title: string; body: string }> = [
  {
    title: "Ajo, susu and pardner groups",
    body: "Collect from members, pay out the pot when it's someone's turn, without WhatsApp screenshots and spreadsheets.",
  },
  {
    title: "Small businesses paying contractors",
    body: "Pay your freelancers, part-time staff, or referral commissions in one batch instead of ten separate bank transfers.",
  },
  {
    title: "Clubs, committees, and community groups",
    body: "Split costs, refund members, or pay out match fees. Everyone gets paid, nobody gets chased.",
  },
  {
    title: "Creators and online communities",
    body: "Share a claim link with your members or subscribers. They put in their bank details; you don't hold anyone's info.",
  },
];

const STEPS: Array<{ step: string; title: string; body: string }> = [
  {
    step: "01",
    title: "You top up your PolyPayd account.",
    body: "Pay in once from your bank. No card fees.",
  },
  {
    step: "02",
    title: "You create a batch and share the link.",
    body: "Say how much you want to pay out and to how many people. Share the link in your group chat.",
  },
  {
    step: "03",
    title: "Your people claim their share.",
    body: "They click, add their bank details, and lock in their share. No awkward \u201Csend me your account number\u201D messages.",
  },
  {
    step: "04",
    title: "You send the payout with one tap.",
    body: "The money lands in their bank straight away. You get a record of who got what.",
  },
];

const VALUE_PROPS: Array<{ title: string; body: string }> = [
  {
    title: "Nobody has to hand over their bank details to you.",
    body: "Recipients put their own details in. You don't collect, store, or see their account numbers.",
  },
  {
    title: "Everything is tracked, nothing is lost.",
    body: "Every top up, claim, and payout is logged in one place. Your treasurer can see exactly where the money went.",
  },
  {
    title: "The money moves fast.",
    body: "We use UK bank payments, so your people get paid in seconds, not days.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#0B0F14] text-[#F9FAFB] antialiased selection:bg-[#3B82F6]/30">
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[min(68vh,680px)] bg-[radial-gradient(ellipse_88%_58%_at_50%_-10%,rgba(59,130,246,0.12),transparent_56%)]"
        aria-hidden
      />

      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#0B0F14]/85 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
          <Link href="/" className="shrink-0 text-[15px] font-semibold tracking-tight text-[#F9FAFB]">
            PolyPayd
          </Link>
          <nav className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2 sm:gap-x-8">
            <a href="#who-its-for" className="hidden text-sm font-medium text-[#9CA3AF] transition-colors hover:text-[#F9FAFB] sm:inline">
              Who it&apos;s for
            </a>
            <a href="#how-it-works" className="hidden text-sm font-medium text-[#9CA3AF] transition-colors hover:text-[#F9FAFB] md:inline">
              How it works
            </a>
            <a href="#waitlist" className="text-sm font-medium text-[#9CA3AF] transition-colors hover:text-[#F9FAFB]">
              Waitlist
            </a>
          </nav>
        </div>
      </header>

      <main className="relative z-10">
        {/* Hero */}
        <section className="mx-auto max-w-7xl px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-20 lg:px-8 lg:pb-24 lg:pt-24">
          <div className="mx-auto max-w-4xl text-center">
            <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-[#121821]/80 px-3 py-1 text-[11px] font-medium text-[#9CA3AF] backdrop-blur-sm">
              Launching Q4 2026
            </span>
            <h1 className="mt-5 bg-gradient-to-b from-[#F9FAFB] via-[#F9FAFB] to-[#94a3b8] bg-clip-text text-[2rem] font-semibold leading-[1.12] tracking-tight text-transparent sm:text-5xl sm:leading-[1.08] lg:text-[3.25rem] lg:leading-[1.05]">
              Stop chasing bank details. Let your group claim their share.
            </h1>
            <p className="mx-auto mt-7 max-w-2xl text-base leading-[1.7] text-[#9CA3AF] sm:text-lg sm:leading-relaxed">
              PolyPayd is the easy way to pay out to a group. You top up once, share a link, your people claim
              their share, and the money lands in their bank.
            </p>
            <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:mt-11 sm:flex-row sm:justify-center sm:gap-4">
              <PrimaryCta href="#waitlist" className="w-full sm:w-auto sm:min-w-[200px]">
                Join the waitlist
              </PrimaryCta>
            </div>
            <p className="mt-5 text-xs leading-relaxed text-[#6B7280]">
              Free to join. No bank charges to claim.
            </p>
          </div>
        </section>

        <SectionDivider />

        {/* Who this is for */}
        <section id="who-its-for" className="scroll-mt-24 py-20 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeader
              eyebrow="Who it's for"
              title="Built for the people who actually run the group chat"
              description="If you're the one everyone asks about the money, this is for you."
            />
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:mt-14 lg:gap-6">
              {AUDIENCE_CARDS.map((item) => (
                <SurfaceCard key={item.title}>
                  <h3 className="text-base font-semibold text-[#F9FAFB] sm:text-lg">{item.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-[#9CA3AF] sm:text-[15px]">{item.body}</p>
                </SurfaceCard>
              ))}
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-24 py-20 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeader
              eyebrow="How it works"
              title="Four steps. No spreadsheets."
              description="Plain English, end to end. Here's what using PolyPayd actually looks like."
            />
            <ol className="mt-12 grid gap-6 lg:mt-14 lg:grid-cols-2 lg:gap-6">
              {STEPS.map((item) => (
                <li key={item.step} className="relative">
                  <SurfaceCard className="h-full border-white/[0.07] pt-9">
                    <span className="absolute left-8 top-0 inline-flex -translate-y-1/2 rounded-lg border border-white/[0.08] bg-[#0B0F14] px-2.5 py-1 text-[11px] font-bold tabular-nums tracking-wide text-[#3B82F6] shadow-sm">
                      {item.step}
                    </span>
                    <h3 className="text-lg font-semibold text-[#F9FAFB]">{item.title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-[#9CA3AF] sm:text-[15px]">{item.body}</p>
                  </SurfaceCard>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <SectionDivider />

        {/* Why people use it */}
        <section className="py-20 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeader
              eyebrow="Why people use it"
              title="The three things that make it actually work"
              description="Not features for the sake of features. These are the bits that save you time and arguments."
            />
            <div className="mt-12 grid gap-5 lg:mt-14 lg:grid-cols-3 lg:gap-6">
              {VALUE_PROPS.map((item) => (
                <div
                  key={item.title}
                  className="flex flex-col gap-4 rounded-2xl border border-white/[0.06] bg-[#121821]/60 p-6 transition-colors duration-300 hover:border-white/[0.1] hover:bg-[#121821] sm:p-7"
                >
                  <span
                    className="h-1.5 w-6 shrink-0 rounded-full bg-emerald-500/80 shadow-[0_0_12px_rgba(16,185,129,0.35)]"
                    aria-hidden
                  />
                  <div>
                    <h3 className="text-base font-semibold text-[#F9FAFB] sm:text-[17px]">{item.title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-[#9CA3AF] sm:text-[15px]">{item.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* Why now */}
        <section className="py-20 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6B7280]">Why now</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#F9FAFB] sm:text-4xl sm:leading-[1.15]">
                We&apos;re building this because it shouldn&apos;t be this hard.
              </h2>
              <div className="mt-6 space-y-5 text-base leading-relaxed text-[#9CA3AF] sm:text-lg">
                <p>
                  We&apos;re building PolyPayd because paying out to a group of people in the UK is still harder
                  than it should be. If you&apos;ve ever chased down ten different bank details, or sent the wrong
                  amount to someone, or had the dreaded &ldquo;did you get the money?&rdquo; question five times,
                  you know what we mean.
                </p>
                <p>
                  We&apos;re launching in Q4 2026, starting with early users who already run group payouts and
                  want a better way. If that&apos;s you, join the waitlist below and we&apos;ll get in touch when
                  you can try it.
                </p>
              </div>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* Credibility */}
        <section className="py-20 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl rounded-2xl border border-white/[0.08] bg-[#121821] p-8 sm:p-10 lg:p-12">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6B7280]">Safeguarding</p>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight text-[#F9FAFB] sm:text-[1.75rem] sm:leading-[1.2]">
                Built to the same standards as the banks
              </h2>
              <p className="mt-5 text-sm leading-relaxed text-[#9CA3AF] sm:text-[15px] sm:leading-[1.75]">
                PolyPayd runs on regulated UK payment rails through our partners. Your money is protected by the
                same safeguarding rules that apply to licensed payment institutions, not sitting in a random bank
                account.
              </p>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* Waitlist form */}
        <section className="py-20 sm:py-24 lg:pb-28 lg:pt-24" aria-labelledby="waitlist-heading">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <h2 id="waitlist-heading" className="sr-only">
              Join the waitlist
            </h2>
            <GroupsWaitlistForm id="waitlist" />
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.06] bg-[#0B0F14] py-10 sm:py-12">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 sm:flex-row sm:items-start sm:justify-between sm:px-6 lg:px-8">
          <div className="max-w-md text-center sm:text-left">
            <p className="text-sm font-semibold text-[#F9FAFB]">PolyPayd</p>
            <p className="mt-2 text-xs leading-relaxed text-[#6B7280]">
              Payout orchestration for bulk sends and recipient claims, built on regulated UK payment rails. © {new Date().getFullYear()} PolyPayd.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6 sm:justify-end sm:gap-8">
            <a href="#waitlist" className="text-xs font-medium text-[#9CA3AF] transition-colors hover:text-[#F9FAFB]">
              Waitlist
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
