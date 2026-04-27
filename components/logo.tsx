import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type LogoSize = "sm" | "md" | "lg";

const sizeClasses: Record<LogoSize, string> = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-3xl",
};

export function Logo({
  href,
  size = "md",
  className,
}: {
  href?: string;
  size?: LogoSize;
  className?: string;
}): ReactNode {
  const wordmark = (
    <span
      className={cn(
        "font-bold tracking-tight",
        sizeClasses[size],
        className
      )}
    >
      <span className="text-teal-600">Poly</span>
      <span className="text-slate-800">Payd</span>
    </span>
  );

  if (href) {
    return (
      <Link href={href} aria-label="PolyPayd home">
        {wordmark}
      </Link>
    );
  }
  return wordmark;
}
