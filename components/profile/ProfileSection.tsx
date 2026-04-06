import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Props = {
  title: string;
  children: ReactNode;
  className?: string;
};

function sectionId(title: string) {
  return `profile-section-${title.toLowerCase().replace(/\s+/g, "-")}`;
}

export function ProfileSection({ title, children, className }: Props) {
  const id = sectionId(title);
  return (
    <section className={cn("mt-10 scroll-mt-4", className)} aria-labelledby={id}>
      <h2 id={id} className="mb-2.5 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C6570]">
        {title}
      </h2>
      <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#121821]/90 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_8px_24px_-8px_rgba(0,0,0,0.45)]">
        <div className="divide-y divide-white/[0.055]">{children}</div>
      </div>
    </section>
  );
}
