"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";

type Props = { orgId: string };

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "");

type CreateIntentResult = {
  clientSecret: string;
  paymentIntentId: string;
};

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

      // Localhost: Stripe cannot deliver webhooks here; sync the same RPC the webhook uses (idempotent).
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
              "Payment succeeded but the wallet did not update. Check the server log, Supabase migration apply_stripe_wallet_topup, or use Stripe CLI to forward webhooks."
          );
          return;
        }
      }

      // Stripe may redirect for some payment methods; return_url flow is handled by WalletTopUpReturnHandler.
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
        <button
          type="submit"
          disabled={loading || !stripe || !elements}
          className="rounded-lg border border-emerald-700/60 bg-emerald-950/30 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-900/40 disabled:opacity-50"
        >
          {loading ? "Processing…" : "Pay now"}
        </button>
      </div>
    </form>
  );
}

export function AddFundsButton({ orgId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [loadingIntent, setLoadingIntent] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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

      const data = (await res.json()) as Partial<CreateIntentResult> & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to start checkout.");
        return;
      }

      if (!data.clientSecret) {
        setError("Stripe client secret was missing.");
        return;
      }

      setClientSecret(data.clientSecret);
    } finally {
      setLoadingIntent(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-emerald-700/60 bg-emerald-950/30 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-900/40"
      >
        Add funds
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-white mb-4">Add funds with Stripe</h2>

            {!clientSecret ? (
              <form onSubmit={handleCreateIntent} className="space-y-4">
                <div>
                  <label className="block text-sm text-neutral-400 mb-1">Amount (GBP)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-white placeholder-neutral-500 focus:border-emerald-500 focus:outline-none"
                    placeholder="10.00"
                    required
                  />
                </div>
                {error && <p className="text-sm text-red-400">{error}</p>}
                <p className="text-xs text-neutral-500">
                  After payment, your wallet updates automatically (sync on success, or Stripe webhook in production).
                </p>
                <div className="flex gap-2 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      setError(null);
                      setSuccess(null);
                      setClientSecret(null);
                    }}
                    className="rounded-lg border border-neutral-600 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loadingIntent}
                    className="rounded-lg border border-emerald-700/60 bg-emerald-950/30 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-900/40 disabled:opacity-50"
                  >
                    {loadingIntent ? "Starting…" : "Continue to payment"}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <Elements stripe={stripePromise} options={{ clientSecret }}>
                  <CheckoutForm
                    orgId={orgId}
                    onSuccess={() => {
                      setSuccess(
                        "Payment submitted. Your wallet balance will update once Stripe webhook confirmation is processed."
                      );
                      setClientSecret(null);
                      setAmount("");
                      router.refresh();
                    }}
                  />
                </Elements>
                {success && <p className="mt-3 text-sm text-emerald-300">{success}</p>}
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setClientSecret(null);
                      setError(null);
                    }}
                    className="rounded-lg border border-neutral-600 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
                  >
                    Change amount
                  </button>
                </div>
              </>
            )}

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setError(null);
                  setSuccess(null);
                  setClientSecret(null);
                }}
                className="rounded-lg border border-neutral-600 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
