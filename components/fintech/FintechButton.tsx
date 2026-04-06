import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "danger" | "ghost";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: Variant;
  /** Full width on mobile */
  block?: boolean;
};

const base =
  "inline-flex min-h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0F14] disabled:pointer-events-none disabled:opacity-40 sm:min-h-12";

const variants: Record<Variant, string> = {
  primary: "bg-[#3B82F6] text-white hover:bg-[#2563EB] active:scale-[0.99]",
  secondary:
    "border border-white/[0.08] bg-[#161F2B] text-[#F9FAFB] hover:border-white/[0.12] hover:bg-[#1a2433]",
  danger: "bg-[#EF4444] text-white hover:bg-[#DC2626] active:scale-[0.99]",
  ghost: "text-[#9CA3AF] hover:bg-white/[0.04] hover:text-[#F9FAFB]",
};

export function FintechButton({
  children,
  className,
  variant = "primary",
  block,
  type = "button",
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={cn(base, variants[variant], block && "w-full", className)}
      {...rest}
    >
      {children}
    </button>
  );
}
