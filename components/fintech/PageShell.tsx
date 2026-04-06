import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Props = {
  children: ReactNode;
  className?: string;
  /** Narrower reading width */
  narrow?: boolean;
};

export function PageShell({ children, className, narrow }: Props) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-5xl px-4 py-6 sm:px-5 sm:py-8",
        narrow && "max-w-lg",
        className
      )}
    >
      {children}
    </div>
  );
}
