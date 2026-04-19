import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const rowClass =
  "group flex min-h-[3.5rem] w-full items-center gap-3 px-4 py-3.5 text-left transition-[background-color,box-shadow] sm:min-h-[3.25rem] sm:py-3";

const interactiveClass =
  "hover:bg-white/[0.035] active:bg-white/[0.06] focus:outline-none focus-visible:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#3B82F6]/35";

type ChevronProps = { show: boolean };

function Chevron({ show }: ChevronProps) {
  if (!show) return null;
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#525A6A] transition-colors group-hover:text-[#6B7280]">
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </span>
  );
}

export type ProfileValueTone = "default" | "muted" | "action";

function RowBody({ label, value, valueTone }: { label: string; value: string; valueTone: ProfileValueTone }) {
  const valueClass =
    valueTone === "action"
      ? "text-[15px] font-medium text-[#93C5FD]"
      : valueTone === "muted"
        ? "text-[15px] font-medium text-[#6B7280]"
        : "text-[15px] font-medium text-[#F9FAFB]";

  return (
    <div className="min-w-0 flex-1 pr-1">
      <span className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[#6B7280]">{label}</span>
      <span className={cn("mt-1 block leading-snug", value === "" ? "text-[#6B7280]" : valueClass)}>
        {value || "-"}
      </span>
    </div>
  );
}

type BaseRow = {
  label: string;
  value: string;
  /** `action` = empty-state CTA line; `muted` = secondary copy */
  valueTone?: ProfileValueTone;
};

type LinkProps = BaseRow & {
  variant: "link";
  href: string;
};

type ButtonProps = BaseRow & {
  variant: "button";
  onClick: () => void;
  disabled?: boolean;
};

type StaticProps = BaseRow & {
  variant: "static";
};

export type ProfileRowProps = LinkProps | ButtonProps | StaticProps;

export function ProfileRow(props: ProfileRowProps) {
  const tone = props.valueTone ?? "default";

  const inner: ReactNode = (
    <>
      <RowBody label={props.label} value={props.value} valueTone={tone} />
      <Chevron show={props.variant !== "static"} />
    </>
  );

  if (props.variant === "static") {
    return <div className={cn(rowClass, "cursor-default")}>{inner}</div>;
  }

  if (props.variant === "button") {
    return (
      <button type="button" onClick={props.onClick} disabled={props.disabled} className={cn(rowClass, interactiveClass, props.disabled && "pointer-events-none opacity-45")}>
        {inner}
      </button>
    );
  }

  return (
    <Link href={props.href} className={cn(rowClass, interactiveClass)}>
      {inner}
    </Link>
  );
}
