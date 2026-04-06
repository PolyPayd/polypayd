import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Props = InputHTMLAttributes<HTMLInputElement>;

const inputStyles =
  "w-full rounded-xl border border-white/[0.06] bg-[#161F2B] px-4 py-3.5 text-base text-[#F9FAFB] placeholder:text-[#6B7280] transition-[border,box-shadow] duration-200 focus:border-[#3B82F6]/50 focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/25";

export function FintechInput({ className, ...rest }: Props) {
  return <input className={cn(inputStyles, className)} {...rest} />;
}
