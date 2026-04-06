import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "success" | "warning" | "error" | "info";

type Props = {
  children: ReactNode;
  tone?: Tone;
  className?: string;
};

const tones: Record<Tone, string> = {
  neutral: "border-white/[0.08] bg-white/[0.04] text-[#9CA3AF]",
  success: "border-[#22C55E]/25 bg-[#22C55E]/10 text-[#86EFAC]",
  warning: "border-[#F59E0B]/25 bg-[#F59E0B]/10 text-[#FCD34D]",
  error: "border-[#EF4444]/25 bg-[#EF4444]/10 text-[#FCA5A5]",
  info: "border-[#3B82F6]/25 bg-[#3B82F6]/10 text-[#93C5FD]",
};

export function FintechBadge({ children, tone = "neutral", className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
