import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ClaimToWalletButton } from "./ClaimToWalletButton";
import { FintechCard, PageShell } from "@/components/fintech";

export const dynamic = "force-dynamic";

type Params = { token: string };

const TOKEN_RE = /^[0-9a-f]{32,64}$/i;

function fmtGbp(n: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);
}

export default async function ClaimPayoutPage({ params }: { params: Params | Promise<Params> }) {
  const { token } = await Promise.resolve(params as Params);
  const trimmed = String(token ?? "").trim();
  const tokenValid = TOKEN_RE.test(trimmed);

  const { userId } = await auth();

  let claimAmountGbp: number | null = null;
  let alreadyInWallet = false;

  if (tokenValid && userId) {
    const { data: row } = await supabaseAdmin()
      .from("batch_claims")
      .select("user_id, recipient_lifecycle_status, claim_amount")
      .eq("claim_token", trimmed)
      .maybeSingle();

    if (row?.user_id === userId && row.recipient_lifecycle_status === "claimed") {
      alreadyInWallet = true;
    }
    if (row?.claim_amount != null) {
      claimAmountGbp = Number(row.claim_amount);
    }
  }

  return (
    <PageShell narrow className="py-10 sm:py-16">
      {!tokenValid ? (
        <FintechCard>
          <p className="text-xs font-medium uppercase tracking-wide text-[#EF4444]">Invalid link</p>
          <h1 className="mt-2 text-xl font-semibold text-[#F9FAFB] sm:text-2xl">This link isn&apos;t valid</h1>
          <p className="mt-3 text-sm leading-relaxed text-[#9CA3AF]">
            Check the link you were sent, or ask the organiser to share it again.
          </p>
          <Link
            href="/app/wallet"
            className="mt-8 flex min-h-12 w-full items-center justify-center rounded-xl border border-white/[0.08] bg-[#161F2B] px-5 text-sm font-semibold text-[#F9FAFB] transition-colors hover:border-white/[0.12] hover:bg-[#1a2433]"
          >
            Go to wallet
          </Link>
        </FintechCard>
      ) : alreadyInWallet ? (
        <FintechCard elevated>
          <p className="text-xs font-medium uppercase tracking-wide text-[#22C55E]">Credited</p>
          <h1 className="mt-2 text-xl font-semibold text-[#F9FAFB] sm:text-2xl">Funds are in your wallet</h1>
          <p className="mt-3 text-sm leading-relaxed text-[#9CA3AF]">
            This payout was already added to your available balance. You can withdraw to your bank from your wallet when
            you&apos;re ready.
          </p>
          <Link
            href="/app/wallet"
            className="mt-8 flex min-h-12 w-full items-center justify-center rounded-xl bg-[#3B82F6] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#2563EB]"
          >
            Open wallet
          </Link>
        </FintechCard>
      ) : (
        <FintechCard elevated>
          {claimAmountGbp != null && Number.isFinite(claimAmountGbp) ? (
            <p className="text-4xl font-bold tabular-nums tracking-tight text-[#F9FAFB] sm:text-[2.5rem]">
              {fmtGbp(claimAmountGbp)}
            </p>
          ) : (
            <p className="text-lg font-semibold text-[#F9FAFB]">Your payout</p>
          )}
          <h1 className="mt-4 text-lg font-semibold text-[#F9FAFB] sm:text-xl">Claim to your wallet</h1>
          <p className="mt-2 text-sm leading-relaxed text-[#9CA3AF]">
            One tap adds this amount to your PolyPayd balance. Withdrawing to your bank is a separate step.
          </p>
          <div className="mt-8">
            {!userId ? (
              <p className="text-sm text-[#9CA3AF]">Sign in with the same account you used to join this payout.</p>
            ) : (
              <ClaimToWalletButton token={trimmed} />
            )}
          </div>
          <Link
            href="/app/wallet"
            className="mt-8 block text-center text-sm font-medium text-[#6B7280] transition-colors hover:text-[#9CA3AF]"
          >
            Open wallet
          </Link>
        </FintechCard>
      )}
    </PageShell>
  );
}
