import Link from "next/link";

type Props = {
  label: string;
  value: string;
  /** Defaults to Clerk account hub */
  href?: string;
};

export function ProfileRow({ label, value, href = "/user" }: Props) {
  return (
    <Link
      href={href}
      className="flex min-h-[3.25rem] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.04] active:bg-white/[0.07] sm:min-h-[3rem]"
    >
      <div className="min-w-0 flex-1">
        <span className="block text-xs text-[#6B7280]">{label}</span>
        <span className="mt-0.5 block truncate text-[15px] font-medium text-[#F9FAFB]">{value}</span>
      </div>
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
    </Link>
  );
}
