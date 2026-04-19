"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  calculateWithdrawalFeeMinor,
  evaluateWithdrawalAmountInput,
  formatMinorAsGbp,
  resolveWithdrawalPricingFromWalletGbp,
} from "@/lib/payments/pricing";
import { FintechButton, FintechCard, FintechInput } from "@/components/fintech";

const OPEN_WITHDRAW_EVENT = "polypayd:open-withdraw-panel";

export type WithdrawFundsPanelProps = {
  availableToWithdrawGbp: number;
  pendingFundsGbp: number;
  hasConnectedBank: boolean;
  /** No accordion row or nested card, use inside WalletAccountCard. */
  embedded?: boolean;
};

function formatMoneyGbp(amount: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount);
}

function AccordionChevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`h-5 w-5 shrink-0 text-neutral-400 transition-transform duration-200 ease-out ${expanded ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.75}
      stroke="currentColor"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
    </svg>
  );
}

function friendlyConnectError(raw: string | undefined, httpStatus: number, errorCode?: string): string {
  if (
    errorCode === "STRIPE_CONNECT_ACCOUNT_INVALID_OR_MISSING" ||
    errorCode === "STRIPE_CONNECT_ACCOUNT_LINK_REJECTED"
  ) {
    const t = (raw ?? "").trim();
    if (t.length > 0 && t.length < 280 && !t.includes("http")) return t;
    return "Your saved bank connection doesn’t match this app’s Stripe mode (e.g. staging vs production). Click Connect again to create a fresh connection.";
  }
  const t = (raw ?? "").trim();
  if (t === "You must be signed in." || httpStatus === 401) {
    return "Sign in again to connect your bank.";
  }
  if (t === "No onboarding URL returned.") {
    return "We couldn’t open bank setup. Refresh and try again.";
  }
  if (httpStatus >= 500) {
    return "Bank setup is unavailable right now. Please try again shortly.";
  }
  if (t.length > 0 && t.length < 100 && !t.includes("http")) {
    return t;
  }
  return "Bank setup is unavailable right now. Please try again shortly.";
}

function friendlyWithdrawError(
  raw: string | undefined,
  httpStatus: number,
  withdrawalFailureKind?: string,
  errorCode?: string
): string {
  if (errorCode === "MISSING_CONNECT_ACCOUNT") {
    return "Connect your Stripe account before withdrawing.";
  }
  if (errorCode === "PAYOUTS_NOT_ENABLED") {
    return "Complete your bank setup so Stripe payouts are enabled.";
  }
  if (withdrawalFailureKind === "internal_wallet_insufficient") {
    return "Your internal wallet doesn’t have enough available balance for this withdrawal (pending top-ups don’t count yet).";
  }
  if (withdrawalFailureKind === "connected_stripe_available_insufficient") {
    return "Your connected Stripe account doesn’t have enough available GBP to send to the bank yet. If you just initiated this, wait a moment and try again.";
  }

  if (raw?.includes("PAYOUTS_NOT_ENABLED") || raw?.includes("payouts are not enabled")) {
    return "Complete your bank setup so Stripe payouts are enabled.";
  }

  const t = (raw ?? "").trim();
  if (!t) {
    if (httpStatus === 401) return "Sign in again to continue.";
    if (httpStatus >= 500) return "Withdrawal is unavailable right now. Please try again shortly.";
    return "Withdrawal is unavailable right now. Please try again shortly.";
  }
  if (t === "You must be signed in.") return "Sign in again to continue.";
  if (t.includes("Amount must be a valid GBP")) {
    return "Enter an amount between £1 and £100,000.";
  }
  if (t.startsWith("Connect account required") || t.includes("Stripe Connect account is required")) {
    return "Connect your bank account before withdrawing funds.";
  }
  if (t.includes("payouts are not enabled")) {
    return "Complete your bank setup so withdrawals are enabled.";
  }
  if (t.includes("Insufficient available balance") || t.includes("Internal wallet available balance")) {
    return "You don’t have enough available balance to withdraw this amount.";
  }
  if (t === "Failed to load wallet.") {
    return "Your wallet couldn’t be loaded. Refresh the page and try again.";
  }
  if (httpStatus === 502) {
    return "Withdrawal is unavailable right now. Please try again shortly.";
  }
  if (httpStatus >= 500) {
    return "Withdrawal is unavailable right now. Please try again shortly.";
  }
  if (t.length < 120 && !/[a-z]{3}_[A-Za-z0-9]+/.test(t) && !t.includes("http")) {
    return t;
  }
  return "Withdrawal is unavailable right now. Please try again shortly.";
}

type WithdrawalSuccess = {
  requestedMinor: number;
  walletDebitMinor: number;
  feeMinor: number;
  netMinor: number;
  feeDeductedFromWithdrawal: boolean;
  feeMode: "charged_separately" | "deducted_from_withdrawal";
  duplicate: boolean;
};

export function WithdrawTestPanel({
  availableToWithdrawGbp,
  pendingFundsGbp,
  hasConnectedBank,
  embedded = false,
}: WithdrawFundsPanelProps) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [withdrawalSuccess, setWithdrawalSuccess] = useState<WithdrawalSuccess | null>(null);
  const [withdrawalError, setWithdrawalError] = useState<string | null>(null);

  const withdrawalEval = useMemo(
    () => evaluateWithdrawalAmountInput(amount, availableToWithdrawGbp),
    [amount, availableToWithdrawGbp]
  );

  const withdrawalPreview = withdrawalEval.variant === "ready" ? withdrawalEval.pricing : null;

  const withdrawInputInvalid =
    withdrawalEval.variant === "invalid" && amount.trim() !== "";

  const canSubmitWithdraw =
    hasConnectedBank && withdrawalEval.variant === "ready" && !loading;

  const isZeroAvailable = availableToWithdrawGbp < 0.005;

  const withdrawBlockedHint = (() => {
    if (!hasConnectedBank) return "Connect your bank account to enable withdrawals.";
    if (isZeroAvailable) return "There’s no available balance to withdraw. Pending funds will show above when they clear.";
    if (withdrawalEval.variant === "empty") return "Enter how much you’d like to send to your bank.";
    return null;
  })();

  useEffect(() => {
    function openPanel() {
      setOpen(true);
      requestAnimationFrame(() => {
        rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    window.addEventListener(OPEN_WITHDRAW_EVENT, openPanel);
    return () => window.removeEventListener(OPEN_WITHDRAW_EVENT, openPanel);
  }, []);

  async function handleConnectBank() {
    setConnectError(null);
    setConnectLoading(true);
    try {
      const res = await fetch("/api/stripe/connect/create-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: "{}",
      });
      const data = (await res.json()) as { error?: string; url?: string; errorCode?: string };
      if (!res.ok) {
        console.debug("[WithdrawFundsPanel] connect error", { status: res.status, body: data });
        setConnectError(friendlyConnectError(data.error, res.status, data.errorCode));
        return;
      }
      if (typeof data.url === "string" && data.url.length > 0) {
        window.location.assign(data.url);
        return;
      }
      console.debug("[WithdrawFundsPanel] connect missing url", { body: data });
      setConnectError(friendlyConnectError("No onboarding URL returned.", res.status));
    } catch (err) {
      console.debug("[WithdrawFundsPanel] connect network error", err);
      setConnectError("Check your connection and try again.");
    } finally {
      setConnectLoading(false);
    }
  }

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    setWithdrawalSuccess(null);
    setWithdrawalError(null);

    const live = evaluateWithdrawalAmountInput(amount, availableToWithdrawGbp);
    if (live.variant !== "ready") {
      if (live.variant === "invalid") {
        setWithdrawalError(live.hint ? `${live.message} ${live.hint}` : live.message);
      } else {
        setWithdrawalError("Enter an amount to withdraw.");
      }
      return;
    }

    const num = parseFloat(amount.trim());

    setLoading(true);
    try {
      const idempotencyKey = `ui-withdraw-${crypto.randomUUID()}`;
      const res = await fetch("/api/stripe/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ amountGbp: num, idempotencyKey }),
      });
      const data = (await res.json()) as {
        error?: string;
        errorCode?: string;
        withdrawalFailureKind?: string;
        ok?: boolean;
        duplicate?: boolean;
        stripeTransferId?: string;
        stripePayoutId?: string;
        ledgerTransactionId?: string;
        requestedAmountMinor?: number;
        walletDebitMinor?: number;
        amountMinor?: number;
        feeMinor?: number;
        netPayoutMinor?: number;
        feeDeductedFromWithdrawal?: boolean;
        feeChargedSeparately?: boolean;
        feeMode?: "charged_separately" | "deducted_from_withdrawal";
        warning?: string;
        rpc?: unknown;
      };

      if (!res.ok) {
        console.debug("[WithdrawFundsPanel] payout error", { status: res.status, body: data });
        setWithdrawalError(
          friendlyWithdrawError(
            data.error,
            res.status,
            data.withdrawalFailureKind,
            data.errorCode
          )
        );
        return;
      }

      console.debug("[WithdrawFundsPanel] payout success", {
        duplicate: data.duplicate,
        stripeTransferId: data.stripeTransferId,
        stripePayoutId: data.stripePayoutId,
        ledgerTransactionId: data.ledgerTransactionId,
      });

      const requestedMinor =
        typeof data.requestedAmountMinor === "number" && Number.isFinite(data.requestedAmountMinor)
          ? data.requestedAmountMinor
          : Math.round(num * 100);

      const walletDebitMinor =
        typeof data.walletDebitMinor === "number" && Number.isFinite(data.walletDebitMinor)
          ? data.walletDebitMinor
          : typeof data.amountMinor === "number" && Number.isFinite(data.amountMinor)
            ? data.amountMinor
            : resolveWithdrawalPricingFromWalletGbp(requestedMinor, availableToWithdrawGbp).totalWalletDebitMinor;

      const feeMinor =
        typeof data.feeMinor === "number" && Number.isFinite(data.feeMinor)
          ? data.feeMinor
          : calculateWithdrawalFeeMinor(requestedMinor);

      const netMinor =
        typeof data.netPayoutMinor === "number" && Number.isFinite(data.netPayoutMinor)
          ? data.netPayoutMinor
          : resolveWithdrawalPricingFromWalletGbp(requestedMinor, availableToWithdrawGbp).netPayoutMinor;

      const feeDeductedFromWithdrawal =
        typeof data.feeDeductedFromWithdrawal === "boolean"
          ? data.feeDeductedFromWithdrawal
          : walletDebitMinor === requestedMinor;

      const feeMode: WithdrawalSuccess["feeMode"] =
        data.feeMode === "charged_separately" || data.feeMode === "deducted_from_withdrawal"
          ? data.feeMode
          : feeDeductedFromWithdrawal
            ? "deducted_from_withdrawal"
            : "charged_separately";

      setWithdrawalSuccess({
        requestedMinor,
        walletDebitMinor,
        feeMinor,
        netMinor,
        feeDeductedFromWithdrawal,
        feeMode,
        duplicate: Boolean(data.duplicate),
      });
      setAmount("");
      router.refresh();
    } catch (err) {
      console.debug("[WithdrawFundsPanel] payout network error", err);
      setWithdrawalError("Withdrawal is unavailable right now. Please try again shortly.");
    } finally {
      setLoading(false);
    }
  }

  const pendingNote =
    pendingFundsGbp > 0.0001
      ? `${formatMoneyGbp(pendingFundsGbp)} is still pending and can’t be withdrawn yet.`
      : null;

  const expandedHeader = embedded ? (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm font-semibold text-[#F9FAFB]">Withdraw to bank</p>
      <FintechButton variant="ghost" type="button" onClick={() => setOpen(false)} className="min-h-9 px-2 text-xs">
        Close
      </FintechButton>
    </div>
  ) : (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-[#6B7280]">
        Available{" "}
        <span className="font-semibold tabular-nums text-[#F9FAFB]">
          {formatMoneyGbp(availableToWithdrawGbp)}
        </span>
        {pendingNote ? <span className="mt-1 block font-normal text-[#6B7280]">{pendingNote}</span> : null}
      </p>
      <FintechButton variant="ghost" type="button" onClick={() => setOpen(false)} className="min-h-9 px-2 text-xs">
        Close
      </FintechButton>
    </div>
  );

  const expandedBody = (
    <>
      {expandedHeader}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5 text-sm text-[#9CA3AF]">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${hasConnectedBank ? "bg-[#22C55E]" : "bg-[#F59E0B]"}`}
            aria-hidden
          />
          <span className="text-[#6B7280]">Bank</span>
          <span className="font-medium text-[#F9FAFB]">
            {hasConnectedBank ? "Connected" : "Not connected"}
          </span>
        </div>
        <FintechButton
          variant="secondary"
          type="button"
          onClick={handleConnectBank}
          disabled={connectLoading}
          className="w-full min-h-10 sm:w-auto"
        >
          {connectLoading ? "Opening…" : hasConnectedBank ? "Update bank" : "Connect bank"}
        </FintechButton>
      </div>

      {connectError ? (
        <p className="mt-4 text-sm text-[#EF4444]/90" role="status">
          {connectError}
        </p>
      ) : null}

      <form onSubmit={handleWithdraw} className="mt-8 space-y-8">
        <div>
          <label htmlFor="withdraw-amount" className="mb-2 block text-xs font-medium text-[#6B7280]">
            Amount
          </label>
          <FintechInput
            id="withdraw-amount"
            type="number"
            step="0.01"
            min="1"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setWithdrawalError(null);
            }}
            aria-invalid={withdrawInputInvalid}
            aria-describedby={
              withdrawInputInvalid ? "withdraw-amount-feedback" : withdrawBlockedHint ? "withdraw-blocked-hint" : undefined
            }
            className={`text-2xl font-semibold tabular-nums sm:text-3xl ${
              withdrawInputInvalid ? "border-[#EF4444]/40 ring-[#EF4444]/15" : ""
            }`}
            placeholder="0.00"
            disabled={loading}
          />
          {withdrawBlockedHint && !withdrawInputInvalid ? (
            <p id="withdraw-blocked-hint" className="mt-2 text-sm text-[#6B7280]">
              {withdrawBlockedHint}
            </p>
          ) : null}
          {withdrawInputInvalid ? (
            <p id="withdraw-amount-feedback" className="mt-2 text-sm text-[#EF4444]" role="alert">
              {withdrawalEval.message}
              {withdrawalEval.hint ? ` ${withdrawalEval.hint}` : ""}
            </p>
          ) : null}
        </div>

        {withdrawalPreview ? (
          <div className="space-y-2.5 text-sm text-[#9CA3AF]">
            <p className="text-xs leading-relaxed text-[#6B7280]">
              {withdrawalPreview.feeMode === "charged_separately"
                ? "Fee charged on top, you receive the full amount below."
                : "Fee deducted from this withdrawal."}
            </p>
            <div className="flex justify-between gap-4">
              <span>Withdrawal</span>
              <span className="tabular-nums text-[#F9FAFB]">
                {formatMinorAsGbp(withdrawalPreview.withdrawalAmountMinor)}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Fee</span>
              <span className="tabular-nums text-[#F9FAFB]">{formatMinorAsGbp(withdrawalPreview.feeMinor)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Wallet debit</span>
              <span className="tabular-nums text-[#F9FAFB]">
                {formatMinorAsGbp(withdrawalPreview.totalWalletDebitMinor)}
              </span>
            </div>
            <div className="flex justify-between gap-4 pt-2 text-base font-semibold text-[#F9FAFB]">
              <span>You receive</span>
              <span className="tabular-nums">{formatMinorAsGbp(withdrawalPreview.netPayoutMinor)}</span>
            </div>
          </div>
        ) : null}

        <FintechButton type="submit" disabled={!canSubmitWithdraw} block className="min-h-12 text-[15px]">
          {loading ? "Processing…" : "Withdraw to bank"}
        </FintechButton>
      </form>

      {withdrawalSuccess ? (
        <p className="mt-6 text-sm leading-relaxed text-[#22C55E]" role="status">
          {withdrawalSuccess.duplicate ? "Already submitted. " : ""}
          {withdrawalSuccess.duplicate ? (
            <>
              {formatMinorAsGbp(withdrawalSuccess.netMinor)} to your bank, wallet unchanged (
              {formatMinorAsGbp(withdrawalSuccess.requestedMinor)} requested, fee{" "}
              {formatMinorAsGbp(withdrawalSuccess.feeMinor)}).
            </>
          ) : (
            <>
              {formatMinorAsGbp(withdrawalSuccess.walletDebitMinor)} debited.{" "}
              {formatMinorAsGbp(withdrawalSuccess.netMinor)} heading to your bank.
            </>
          )}
        </p>
      ) : null}

      {withdrawalError ? (
        <p className="mt-4 text-sm text-[#EF4444]/90" role="alert">
          {withdrawalError}
        </p>
      ) : null}
    </>
  );

  return (
    <div ref={rootRef}>
      {!embedded && !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-between gap-4 rounded-2xl bg-[#121821] px-5 py-4 text-left transition-colors duration-200 hover:bg-[#161F2B]/90 sm:py-5"
          aria-expanded="false"
          aria-controls="withdraw-funds-panel"
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#F9FAFB]">Withdraw to bank</p>
            <p className="mt-0.5 text-sm text-[#6B7280]">
              {isZeroAvailable ? "Available when funds clear." : "Send to your linked account."}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <p className="text-right text-sm tabular-nums text-[#9CA3AF]">
              <span className="block text-[11px] font-medium text-[#6B7280]">Up to</span>
              {formatMoneyGbp(availableToWithdrawGbp)}
            </p>
            <AccordionChevron expanded={false} />
          </div>
        </button>
      ) : null}
      {open ? (
        embedded ? (
          <div id="withdraw-funds-panel" className="scroll-mt-4 mt-6 border-t border-white/[0.06] pt-6">
            {expandedBody}
          </div>
        ) : (
          <FintechCard id="withdraw-funds-panel" interactive={false} className="scroll-mt-4">
            {expandedBody}
          </FintechCard>
        )
      ) : null}
    </div>
  );
}
