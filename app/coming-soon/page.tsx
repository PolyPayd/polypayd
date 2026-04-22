import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "PolyPayd is launching Q4 2026",
  description:
    "PolyPayd is launching Q4 2026. Join the waitlist on our homepage to be among the first to try it.",
  robots: { index: false, follow: false },
};

export default function ComingSoonPage() {
  return (
    <div className="relative flex min-h-screen flex-col bg-[#0B0F14] text-[#F9FAFB] antialiased selection:bg-[#3B82F6]/30">
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[min(68vh,680px)] bg-[radial-gradient(ellipse_88%_58%_at_50%_-10%,rgba(59,130,246,0.12),transparent_56%)]"
        aria-hidden
      />

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-xl text-center">
          <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-[#121821]/80 px-3 py-1 text-[11px] font-medium text-[#9CA3AF] backdrop-blur-sm">
            Launching Q4 2026
          </span>
          <h1 className="mt-6 bg-gradient-to-b from-[#F9FAFB] via-[#F9FAFB] to-[#94a3b8] bg-clip-text text-3xl font-semibold leading-[1.15] tracking-tight text-transparent sm:text-4xl sm:leading-[1.1]">
            PolyPayd is launching Q4 2026
          </h1>
          <p className="mx-auto mt-6 max-w-md text-base leading-relaxed text-[#9CA3AF] sm:text-lg">
            We&apos;re still building. Join the waitlist on our homepage to be among the first to try PolyPayd
            when it launches.
          </p>
          <div className="mt-10">
            <Link
              href="/"
              className="group relative inline-flex min-h-[48px] items-center justify-center overflow-hidden rounded-xl bg-[#3B82F6] px-7 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset,0_1px_2px_rgba(0,0,0,0.2),0_8px_24px_-6px_rgba(59,130,246,0.45)] transition-all duration-200 hover:bg-[#2563EB] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.1)_inset,0_12px_32px_-8px_rgba(59,130,246,0.55)] active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0F14]"
            >
              Back to homepage
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
