"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  calculateWithdrawalFeeMinor,
  evaluateWithdrawalAmountInput,
  formatMinorAsGbp,
  resolveWithdrawalPricingFromWalletGbp,
} from "@/lib/payments/pricing";

const OPEN_WITHDRAW_EVENT = "polypayd:open-withdraw-panel";

export type WithdrawFundsPanelProps = {
  availableToWithdrawGbp: number;
  pendingFundsGbp: number;
  hasConnectedBank: boolean;
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

function friendlyConnectError(raw: string | undefined, httpStatus: number): string {
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
      const data = (await res.json()) as { error?: string; url?: string };
      if (!res.ok) {
        console.debug("[WithdrawFundsPanel] connect error", { status: res.status, body: data });
        setConnectError(friendlyConnectError(data.error, res.status));
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

  return (
    <div ref={rootRef} className="mb-8">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group box-border flex w-full min-h-[5.5rem] items-center justify-between gap-6 rounded-2xl border border-neutral-800/90 bg-neutral-900/35 px-6 py-6 text-left shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-neutral-700 hover:bg-neutral-900/50 sm:min-h-[6rem] sm:gap-8 sm:px-9 sm:py-7"
          aria-expanded="false"
          aria-controls="withdraw-funds-panel"
        >
          <div className="min-w-0 flex-1 space-y-2.5 pr-3 sm:pr-4">
            <p className="text-base font-semibold leading-snug tracking-tight text-white">Withdraw funds</p>
            <p className="max-w-lg text-sm leading-relaxed text-neutral-500">
              Send available balance to your connected bank account
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-4 sm:gap-5 sm:border-l sm:border-neutral-800/70 sm:pl-8">
            <div className="text-right sm:min-w-[8rem]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500 sm:text-[11px]">
                Available
              </p>
              <p className="mt-1.5 text-lg font-semibold tabular-nums leading-none tracking-tight text-white sm:text-xl">
                {formatMoneyGbp(availableToWithdrawGbp)}
              </p>
            </div>
            <span className="flex shrink-0 items-center justify-center pl-0.5 text-neutral-400">
              <AccordionChevron expanded={false} />
            </span>
          </div>
        </button>
      ) : (
    <section
      id="withdraw-funds-panel"
      className="rounded-2xl border border-neutral-800/90 bg-neutral-900/35 p-6 sm:p-7 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset]"
      aria-labelledby="withdraw-funds-heading"
    >
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800/80 pb-5">
        <div className="min-w-0 flex-1">
          <h2 id="withdraw-funds-heading" className="text-lg font-semibold tracking-tight text-white">
            Withdraw funds
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-neutral-500">
            Send available balance to your connected bank account
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">Available</p>
            <p className="mt-0.5 text-base font-semibold tabular-nums text-white">
              {formatMoneyGbp(availableToWithdrawGbp)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg border border-neutral-600 px-3 py-2 text-xs font-medium text-neutral-300 transition-colors hover:border-neutral-500 hover:bg-neutral-800/40 hover:text-white"
            aria-expanded="true"
            aria-controls="withdraw-funds-panel"
          >
            <span className="hidden sm:inline">Collapse</span>
            <AccordionChevron expanded />
          </button>
        </div>
      </header>

      <div className="mb-6 flex flex-col gap-4 rounded-xl border border-neutral-800/80 bg-neutral-950/45 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <span
            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${hasConnectedBank ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.45)]" : "bg-amber-400/90 shadow-[0_0_8px_rgba(251,191,36,0.35)]"}`}
            aria-hidden
          />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Bank connection
            </p>
            <p className="mt-1 text-sm font-medium text-neutral-100">
              {hasConnectedBank ? "Bank account connected" : "No bank account linked"}
            </p>
            {!hasConnectedBank && (
              <p className="mt-0.5 text-xs text-neutral-500">Connect a bank to receive withdrawals.</p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={handleConnectBank}
          disabled={connectLoading}
          className="shrink-0 rounded-lg border border-neutral-600 bg-transparent px-4 py-2.5 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-500 hover:bg-neutral-800/50 hover:text-white disabled:opacity-50"
        >
          {connectLoading ? "Opening secure setup…" : "Connect bank account"}
        </button>
      </div>

      {connectError && (
        <div
          className="mb-6 rounded-xl border border-red-500/15 bg-red-950/25 px-4 py-3"
          role="status"
        >
          <p className="text-sm leading-snug text-red-200/90">{connectError}</p>
        </div>
      )}

      <div className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
          Available to withdraw
        </p>
        <p className="mt-1.5 text-3xl font-semibold tabular-nums tracking-tight text-white">
          {formatMoneyGbp(availableToWithdrawGbp)}
        </p>
        {pendingNote ? (
          <p className="mt-2 max-w-md text-xs leading-relaxed text-neutral-500">{pendingNote}</p>
        ) : (
          <p className="mt-2 text-xs text-neutral-600">Only available balance can be withdrawn.</p>
        )}
      </div>

      <form onSubmit={handleWithdraw} className="space-y-4">
        <div>
          <label htmlFor="withdraw-amount" className="mb-2 block text-sm font-medium text-neutral-300">
            Withdrawal amount
          </label>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
            <input
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
              aria-describedby={withdrawInputInvalid ? "withdraw-amount-feedback" : undefined}
              className={`min-h-[48px] w-full flex-1 rounded-xl border bg-neutral-950/60 px-4 py-3 text-base text-white tabular-nums placeholder:text-neutral-600 outline-none transition-[border,box-shadow] focus:ring-1 focus:ring-neutral-500/30 ${
                withdrawInputInvalid
                  ? "border-red-500/50 focus:border-red-400/70"
                  : "border-neutral-700/90 focus:border-neutral-500"
              }`}
              placeholder="0.00"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={!canSubmitWithdraw}
              className="min-h-[48px] shrink-0 rounded-xl bg-neutral-100 px-6 py-3 text-sm font-semibold text-neutral-950 shadow-sm transition-colors hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed sm:min-w-[180px]"
            >
              {loading ? "Processing…" : "Withdraw to bank"}
            </button>
          </div>
          {withdrawInputInvalid && (
            <div
              id="withdraw-amount-feedback"
              className="mt-3 rounded-xl border border-red-500/20 bg-red-950/20 px-4 py-3 text-sm text-red-100/90"
              role="alert"
            >
              <p className="font-medium text-red-100">{withdrawalEval.message}</p>
              {withdrawalEval.hint ? (
                <p className="mt-1.5 text-xs leading-relaxed text-red-200/75">{withdrawalEval.hint}</p>
              ) : null}
            </div>
          )}
        </div>
        {withdrawalPreview && (
          <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/45 px-4 py-3 text-sm text-neutral-400">
            <p className="mb-2 text-xs font-medium text-neutral-500">
              {withdrawalPreview.feeMode === "charged_separately"
                ? "Fee charged separately — you receive your full withdrawal amount."
                : "Fee deducted from this withdrawal — your balance isn’t enough to pay the fee on top."}
            </p>
            <div className="flex justify-between gap-3">
              <span>Withdrawal amount</span>
              <span className="font-medium tabular-nums text-neutral-200">
                {formatMinorAsGbp(withdrawalPreview.withdrawalAmountMinor)}
              </span>
            </div>
            <div className="mt-2 flex justify-between gap-3">
              <span>Fee</span>
              <span className="font-medium tabular-nums text-neutral-200">
                {formatMinorAsGbp(withdrawalPreview.feeMinor)}
              </span>
            </div>
            <div className="mt-2 flex justify-between gap-3">
              <span>Total wallet debit</span>
              <span className="font-medium tabular-nums text-neutral-200">
                {formatMinorAsGbp(withdrawalPreview.totalWalletDebitMinor)}
              </span>
            </div>
            <div className="mt-2 flex justify-between gap-3 border-t border-neutral-800/80 pt-2">
              <span className="text-neutral-300">You will receive</span>
              <span className="font-semibold tabular-nums text-white">
                {formatMinorAsGbp(withdrawalPreview.netPayoutMinor)}
              </span>
            </div>
          </div>
        )}
      </form>

      {withdrawalSuccess && (
        <div
          className="mt-6 rounded-xl border border-emerald-500/20 bg-emerald-950/20 px-5 py-4"
          role="status"
        >
          <div className="mb-3">
            <span className="inline-flex items-center rounded-md border border-emerald-500/25 bg-emerald-950/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300/95">
              Submitted
            </span>
          </div>
          <p className="text-sm font-semibold text-emerald-50">
            {withdrawalSuccess.duplicate ? "Withdrawal already submitted" : "Withdrawal submitted"}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-emerald-100/75">
            {withdrawalSuccess.duplicate ? (
              <>
                {formatMinorAsGbp(withdrawalSuccess.netMinor)} to your bank was already submitted for this request.
                Your wallet was not debited again (
                {formatMinorAsGbp(withdrawalSuccess.requestedMinor)} requested,{" "}
                {formatMinorAsGbp(withdrawalSuccess.feeMinor)} fee).
              </>
            ) : (
              <>
                {formatMinorAsGbp(withdrawalSuccess.walletDebitMinor)} debited from your wallet.{" "}
                {formatMinorAsGbp(withdrawalSuccess.netMinor)} is on its way to your bank
                {withdrawalSuccess.feeMode === "deducted_from_withdrawal"
                  ? ` (${formatMinorAsGbp(withdrawalSuccess.feeMinor)} fee deducted from the withdrawal).`
                  : ` (full ${formatMinorAsGbp(withdrawalSuccess.requestedMinor)} to your bank; ${formatMinorAsGbp(withdrawalSuccess.feeMinor)} fee taken separately from your wallet).`}
              </>
            )}
          </p>
        </div>
      )}

      {withdrawalError && (
        <div
          className="mt-6 rounded-xl border border-red-500/15 bg-red-950/20 px-5 py-4"
          role="alert"
        >
          <p className="text-sm leading-relaxed text-red-100/90">{withdrawalError}</p>
        </div>
      )}
    </section>
      )}
    </div>
  );
}
