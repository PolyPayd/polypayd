"use client";

import { FintechButton } from "@/components/fintech";

const OPEN_EVENT = "polypayd:open-withdraw-panel";

export function WithdrawHeaderButton() {
  return (
    <FintechButton
      type="button"
      variant="secondary"
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_EVENT))}
    >
      Withdraw
    </FintechButton>
  );
}
