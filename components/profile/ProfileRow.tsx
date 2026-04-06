import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const rowClass =
  "flex min-h-[3.25rem] w-full items-center gap-3 px-4 py-3 text-left transition-colors sm:min-h-[3rem]";

const interactiveClass = "hover:bg-white/[0.04] active:bg-white/[0.07]";

type ChevronProps = { show: boolean };

function Chevron({ show }: ChevronProps) {
  if (!show) return null;
  return (
    <svg
      className="h-4 w-4 shrink-0 text-[#4B5563]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function RowBody({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 flex-1">
      <span className="block text-xs text-[#6B7280]">{label}</span>
      <span className="mt-0.5 block truncate text-[15px] font-medium text-[#F9FAFB]">{value}</span>
    </div>
  );
}

type LinkProps = {
  variant: "link";
  label: string;
  value: string;
  href: string;
};

type ButtonProps = {
  variant: "button";
  label: string;
  value: string;
  onClick: () => void;
};

type StaticProps = {
  variant: "static";
  label: string;
  value: string;
};

export type ProfileRowProps = LinkProps | ButtonProps | StaticProps;

export function ProfileRow(props: ProfileRowProps) {
  const inner: ReactNode = (
    <>
      <RowBody label={props.label} value={props.value} />
      <Chevron show={props.variant !== "static"} />
    </>
  );

  if (props.variant === "static") {
    return <div className={cn(rowClass, "cursor-default opacity-95")}>{inner}</div>;
  }

  if (props.variant === "button") {
    return (
      <button type="button" onClick={props.onClick} className={cn(rowClass, interactiveClass)}>
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
