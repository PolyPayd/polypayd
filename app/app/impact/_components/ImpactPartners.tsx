"use client";

import { FadeIn } from "@/components/impact/FadeIn";

const PARTNERS = [
  {
    title: "Youth empowerment",
    body: "Skills, mentorship, and safe spaces for young people building financial futures.",
    tag: "Primary focus",
  },
  {
    title: "Financial inclusion",
    body: "Community programmes that improve access to fair money tools and education.",
    tag: "Aligned",
  },
  {
    title: "Transparent distribution",
    body: "Outbound grants will appear in distribution history as programmes go live.",
    tag: "Coming soon",
  },
];

export function ImpactPartners() {
  return (
    <FadeIn delayMs={160}>
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
        <h2 className="text-sm font-semibold text-white">Where funds go</h2>
        <p className="mt-1 text-xs text-neutral-500">Partner selection and reporting will expand as distributions go live.</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {PARTNERS.map((p) => (
            <div
              key={p.title}
              className="rounded-xl border border-neutral-800/80 bg-neutral-950/50 p-4 transition-transform duration-300 hover:-translate-y-0.5"
            >
              <span className="inline-block rounded-full border border-emerald-500/30 bg-emerald-950/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-300/90">
                {p.tag}
              </span>
              <h3 className="mt-3 text-sm font-semibold text-white">{p.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-neutral-400">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </FadeIn>
  );
}
