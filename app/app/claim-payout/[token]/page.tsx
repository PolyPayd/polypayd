import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { ClaimToWalletButton } from "./ClaimToWalletButton";

export const dynamic = "force-dynamic";

type Params = { token: string };

const TOKEN_RE = /^[0-9a-f]{32,64}$/i;

export default async function ClaimPayoutPage({ params }: { params: Params | Promise<Params> }) {
  const { token } = await Promise.resolve(params as Params);
  const trimmed = String(token ?? "").trim();
  const tokenValid = TOKEN_RE.test(trimmed);

  const { userId } = await auth();

  return (
    <div className="min-h-[calc(100vh-5rem)] flex flex-col items-center justify-start px-4 py-10 sm:py-16">
      <div className="w-full max-w-md">
        {!tokenValid ? (
          <div className="rounded-2xl border border-red-900/40 bg-red-950/20 px-6 py-8 text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-red-300/80 mb-2">Invalid link</p>
            <h1 className="text-xl font-semibold text-white tracking-tight">This claim link isn&apos;t valid</h1>
            <p className="mt-3 text-sm text-neutral-400 leading-relaxed">
              Check the link you were sent, or ask the organiser to share it again.
            </p>
            <Link
              href="/app/wallet"
              className="mt-8 inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-neutral-950 hover:bg-neutral-100 transition-colors w-full sm:w-auto"
            >
              Go to wallet
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl border border-neutral-800/90 bg-neutral-900/40 px-6 py-8 sm:px-8 sm:py-10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
            <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full border border-emerald-800/50 bg-emerald-950/40">
              <svg className="h-6 w-6 text-emerald-400/90" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                />
              </svg>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold text-white text-center tracking-tight">
              Claim your payout
            </h1>
            <p className="mt-3 text-sm text-neutral-400 text-center leading-relaxed">
              Securely add this amount to your PolyPayd wallet. Bank withdrawals are a separate step from your wallet.
            </p>
            <div className="mt-8">
              {!userId ? (
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 px-4 py-5 text-center">
                  <p className="text-sm font-medium text-neutral-200">Sign in to claim</p>
                  <p className="mt-2 text-sm text-neutral-500 leading-relaxed">
                    Use the same account you used when you joined this payout.
                  </p>
                </div>
              ) : (
                <ClaimToWalletButton token={trimmed} />
              )}
            </div>
            <Link
              href="/app/wallet"
              className="mt-8 block text-center text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              Open wallet
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
