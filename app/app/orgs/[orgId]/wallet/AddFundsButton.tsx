"use client";

import { useEffect, useMemo, useState } from "react";
import { calculateTopupChargeFromWalletCredit } from "@/lib/payments/pricing";
import { useRouter } from "next/navigation";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { FintechButton } from "@/components/fintech";

type Props = {
  orgId: string;
  /** When set, the user cannot add funds until Connect + charges are ready. */
  addFundsBlockedReason: string | null;
};

type CreateIntentResult = {
  clientSecret: string;
  paymentIntentId: string;
  stripeAccountId?: string;
  walletCreditMinor?: number;
  processingFeeMinor?: number;
  totalChargeMinor?: number;
};

function fmtGbpFromMinor(minor: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(minor / 100);
}

type CheckoutFormProps = {
  orgId: string;
  onSuccess: () => void;
};

function CheckoutForm({ orgId, onSuccess }: CheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!stripe || !elements) {
      setError("Stripe is still loading. Please try again.");
      return;
    }

    setLoading(true);
    try {
      const returnUrl = `${window.location.origin}/app/orgs/${orgId}/wallet?topup=processing`;
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: returnUrl,
        },
      });

      if (result.error) {
        setError(result.error.message ?? "Payment failed. Please try again.");
        return;
      }

      const pi = (result as { paymentIntent?: { id?: string; status?: string } }).paymentIntent;
      if (pi?.status === "succeeded" && pi.id) {
        const syncRes = await fetch("/api/wallet/topups/sync-payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ paymentIntentId: pi.id }),
        });
        const syncJson = (await syncRes.json()) as { error?: string };
        if (!syncRes.ok) {
          setError(
            syncJson.error ??
              "Payment succeeded but the wallet did not update. Check the server log or Stripe webhook delivery."
          );
          return;
        }
      }

      onSuccess();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex justify-end">
        <FintechButton type="submit" disabled={loading || !stripe || !elements}>
          {loading ? "Processing…" : "Pay now"}
        </FintechButton>
      </div>
    </form>
  );
}

function ElementsOnConnectedAccount({
  clientSecret,
  stripeAccountId,
  orgId,
  onSuccess,
}: {
  clientSecret: string;
  stripeAccountId: string;
  orgId: string;
  onSuccess: () => void;
}) {
  const [stripe, setStripe] = useState<Stripe | null | undefined>(undefined);

  useEffect(() => {
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
    if (!pk) {
      setStripe(null);
      return;
    }
    let cancelled = false;
    loadStripe(pk, { stripeAccount: stripeAccountId }).then((s) => {
      if (!cancelled) setStripe(s ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [stripeAccountId]);

  if (stripe === undefined) {
    return <p className="text-sm text-neutral-400">Loading Stripe…</p>;
  }
  if (!stripe) {
    return (
      <p className="text-sm text-red-400">
        Stripe could not load. Check NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY in your environment.
      </p>
    );
  }

  return (
    <Elements stripe={stripe} options={{ clientSecret }}>
      <CheckoutForm orgId={orgId} onSuccess={onSuccess} />
    </Elements>
  );
}

export function AddFundsButton({ orgId, addFundsBlockedReason }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [loadingIntent, setLoadingIntent] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripeAccountForPi, setStripeAccountForPi] = useState<string | null>(null);
  const [topupBreakdown, setTopupBreakdown] = useState<{
    walletCreditMinor: number;
    processingFeeMinor: number;
    totalChargeMinor: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const topupPreview = useMemo(() => {
    const num = parseFloat(amount);
    if (Number.isNaN(num) || !Number.isFinite(num) || num < 1 || num > 100_000) return null;
    const walletCreditMinor = Math.round(num * 100);
    if (walletCreditMinor < 100) return null;
    try {
      return calculateTopupChargeFromWalletCredit(walletCreditMinor);
    } catch {
      return null;
    }
  }, [amount]);

  async function handleCreateIntent(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const num = parseFloat(amount);
    if (Number.isNaN(num) || num < 1) {
      setError("Enter a valid amount of at least 1.00 GBP.");
      return;
    }

    setLoadingIntent(true);
    try {
      const res = await fetch("/api/wallet/topups/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          orgId,
          amountGbp: num,
        }),
      });

      const data = (await res.json()) as Partial<CreateIntentResult> & {
        error?: string;
        errorCode?: string;
      };
      if (!res.ok) {
        if (data.errorCode === "MISSING_CONNECT_ACCOUNT") {
          setError(
            data.error ??
              "Create a Stripe Connect account first (wallet → connect bank), then return here to add funds."
          );
          return;
        }
        if (data.errorCode === "CONNECT_CHARGES_NOT_ENABLED") {
          setError(
            data.error ??
              "Finish Stripe Connect onboarding until card payments are enabled, then try again."
          );
          return;
        }
        setError(data.error ?? "Failed to start checkout.");
        return;
      }

      if (!data.clientSecret) {
        setError("Stripe client secret was missing.");
        return;
      }

      const acct = typeof data.stripeAccountId === "string" ? data.stripeAccountId.trim() : "";
      if (!acct) {
        setError("Server did not return a Connect account for this payment.");
        return;
      }
      setStripeAccountForPi(acct);

      if (
        typeof data.walletCreditMinor === "number" &&
        typeof data.processingFeeMinor === "number" &&
        typeof data.totalChargeMinor === "number"
      ) {
        setTopupBreakdown({
          walletCreditMinor: data.walletCreditMinor,
          processingFeeMinor: data.processingFeeMinor,
          totalChargeMinor: data.totalChargeMinor,
        });
      } else {
        setTopupBreakdown(null);
      }

      setClientSecret(data.clientSecret);
    } finally {
      setLoadingIntent(false);
    }
  }

  const blocked = Boolean(addFundsBlockedReason);

  return (
    <>
      <FintechButton
        type="button"
        onClick={() => setOpen(true)}
        disabled={blocked}
        title={addFundsBlockedReason ?? undefined}
      >
        Add funds
      </FintechButton>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/[0.06] bg-[#121821] p-6 shadow-2xl">
            <h2 className="mb-4 text-lg font-semibold text-[#F9FAFB]">Add funds</h2>

            {blocked && (
              <div className="mb-4 rounded-xl border border-[#F59E0B]/20 bg-[#F59E0B]/10 px-4 py-3 text-sm text-[#FCD34D]">
                {addFundsBlockedReason}
                <p className="mt-2 text-xs text-[#9CA3AF]">
                  Complete Connect onboarding until card payments are enabled, then add funds.
                </p>
              </div>
            )}

            {!clientSecret ? (
              <form onSubmit={handleCreateIntent} className="space-y-4">
                <div>
                  <label className="mb-2 block text-xs font-medium text-[#9CA3AF]">Amount (GBP)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={blocked}
                    className="w-full rounded-xl border border-white/[0.06] bg-[#161F2B] px-4 py-3 text-[#F9FAFB] placeholder-[#6B7280] focus:border-[#3B82F6]/50 focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/25 disabled:opacity-50"
                    placeholder="10.00"
                    required
                  />
                </div>
                {topupPreview && (
                  <div className="rounded-lg border border-neutral-700 bg-neutral-950/50 px-3 py-2.5 text-xs text-neutral-400 space-y-1">
                    <div className="flex justify-between gap-2">
                      <span>Wallet credit</span>
                      <span className="font-medium text-neutral-200 tabular-nums">
                        {fmtGbpFromMinor(topupPreview.walletCreditMinor)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span>Processing fee (platform)</span>
                      <span className="font-medium text-neutral-200 tabular-nums">
                        {fmtGbpFromMinor(topupPreview.processingFeeMinor)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2 border-t border-neutral-800 pt-1.5 mt-1.5">
                      <span className="text-neutral-300">Total charge</span>
                      <span className="font-semibold text-white tabular-nums">
                        {fmtGbpFromMinor(topupPreview.totalChargeMinor)}
                      </span>
                    </div>
                  </div>
                )}
                {error && <p className="text-sm text-red-400">{error}</p>}
                <p className="text-xs text-neutral-500">
                  Payment is processed on your Stripe Connect account; the platform fee is taken as an
                  application fee. Your wallet credit matches the amount you choose above.
                </p>
                <div className="flex flex-wrap justify-end gap-2 pt-2">
                  <FintechButton
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setOpen(false);
                      setError(null);
                      setSuccess(null);
                      setClientSecret(null);
                      setStripeAccountForPi(null);
                      setTopupBreakdown(null);
                    }}
                  >
                    Cancel
                  </FintechButton>
                  <FintechButton type="submit" disabled={loadingIntent || blocked}>
                    {loadingIntent ? "Starting…" : "Continue"}
                  </FintechButton>
                </div>
              </form>
            ) : (
              stripeAccountForPi && (
                <>
                  {topupBreakdown && (
                    <div className="mb-4 rounded-lg border border-neutral-700 bg-neutral-950/50 px-3 py-2.5 text-xs text-neutral-400 space-y-1">
                      <div className="flex justify-between gap-2">
                        <span>Wallet credit</span>
                        <span className="font-medium text-neutral-200 tabular-nums">
                          {fmtGbpFromMinor(topupBreakdown.walletCreditMinor)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span>Processing fee (platform)</span>
                        <span className="font-medium text-neutral-200 tabular-nums">
                          {fmtGbpFromMinor(topupBreakdown.processingFeeMinor)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2 border-t border-neutral-800 pt-1.5 mt-1.5">
                        <span className="text-neutral-300">Total charge</span>
                        <span className="font-semibold text-white tabular-nums">
                          {fmtGbpFromMinor(topupBreakdown.totalChargeMinor)}
                        </span>
                      </div>
                    </div>
                  )}
                  <ElementsOnConnectedAccount
                    clientSecret={clientSecret}
                    stripeAccountId={stripeAccountForPi}
                    orgId={orgId}
                    onSuccess={() => {
                      setSuccess("Payment succeeded. Your wallet has been updated.");
                      setClientSecret(null);
                      setStripeAccountForPi(null);
                      setAmount("");
                      router.refresh();
                    }}
                  />
                  {success && <p className="mt-3 text-sm text-emerald-300">{success}</p>}
                  <div className="mt-4 flex justify-end">
                    <FintechButton
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setClientSecret(null);
                        setStripeAccountForPi(null);
                        setTopupBreakdown(null);
                        setError(null);
                      }}
                    >
                      Change amount
                    </FintechButton>
                  </div>
                </>
              )
            )}

            <div className="mt-4 flex justify-end">
              <FintechButton
                type="button"
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                  setError(null);
                  setSuccess(null);
                  setClientSecret(null);
                  setStripeAccountForPi(null);
                  setTopupBreakdown(null);
                }}
              >
                Close
              </FintechButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
