import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Props = {
  children: ReactNode;
  className?: string;
  /** Slightly lighter surface for nested emphasis */
  elevated?: boolean;
  /** When false, no hover shadow (use for static sections) */
  interactive?: boolean;
} & Omit<HTMLAttributes<HTMLDivElement>, "className" | "children">;

export function FintechCard({ children, className, elevated, interactive = true, ...rest }: Props) {
  return (
    <div
      {...rest}
      className={cn(
        "rounded-2xl border border-white/[0.05] p-4 sm:p-5 transition-shadow duration-200",
        elevated ? "bg-[#161F2B] shadow-[0_8px_32px_rgba(0,0,0,0.35)]" : "bg-[#121821]",
        interactive && "hover:shadow-[0_4px_24px_rgba(0,0,0,0.25)]",
        className
      )}
    >
      {children}
    </div>
  );
}
