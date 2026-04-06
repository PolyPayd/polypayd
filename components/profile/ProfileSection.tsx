import type { ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
};

function sectionId(title: string) {
  return `profile-section-${title.toLowerCase().replace(/\s+/g, "-")}`;
}

export function ProfileSection({ title, children }: Props) {
  const id = sectionId(title);
  return (
    <section className="mt-8" aria-labelledby={id}>
      <h2 id={id} className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#6B7280]">
        {title}
      </h2>
      <div className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl bg-[#121821]">{children}</div>
    </section>
  );
}
