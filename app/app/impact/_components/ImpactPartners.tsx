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
      <div className="rounded-2xl border border-white/[0.05] bg-[#121821] p-6 sm:p-7">
        <h2 className="text-base font-semibold text-[#F9FAFB]">Where funds go</h2>
        <p className="mt-1 text-xs text-[#6B7280]">Partner selection and reporting will expand as distributions go live.</p>

        <div className="mt-8 grid gap-8 sm:grid-cols-3 sm:gap-6">
          {PARTNERS.map((p) => (
            <div key={p.title} className="min-w-0">
              <span className="inline-block rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200/90">
                {p.tag}
              </span>
              <h3 className="mt-3 text-sm font-semibold text-[#F9FAFB]">{p.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-[#9CA3AF]">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </FadeIn>
  );
}
