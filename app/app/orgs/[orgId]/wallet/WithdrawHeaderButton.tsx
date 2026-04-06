"use client";

import { FintechButton } from "@/components/fintech";
import { cn } from "@/lib/cn";

const OPEN_EVENT = "polypayd:open-withdraw-panel";

export function WithdrawHeaderButton({ className }: { className?: string }) {
  return (
    <FintechButton
      type="button"
      variant="secondary"
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_EVENT))}
      className={cn("min-h-12", className)}
    >
      Withdraw
    </FintechButton>
  );
}
