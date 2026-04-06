import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Props = InputHTMLAttributes<HTMLInputElement>;

const inputStyles =
  "w-full rounded-xl border border-white/[0.04] bg-[#0B0F14]/60 px-4 py-3.5 text-base text-[#F9FAFB] placeholder:text-[#6B7280] transition-[border,box-shadow,background-color] duration-200 focus:border-[#3B82F6]/45 focus:bg-[#161F2B]/80 focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/20";

export function FintechInput({ className, ...rest }: Props) {
  return <input className={cn(inputStyles, className)} {...rest} />;
}
