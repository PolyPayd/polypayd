import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { createBatch } from "./actions";
import { CreateBatchForm } from "./CreateBatchForm";
import { ensureWalletForUser } from "@/lib/wallet";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { PageShell } from "@/components/fintech";

export const dynamic = "force-dynamic";

type Params = Promise<{ orgId: string }>;

export default async function NewBatchPage({ params }: { params: Params }) {
  const { orgId } = await params;

  if (!orgId) {
    return (
      <PageShell>
        <p className="text-sm text-[#EF4444]">Missing orgId in route.</p>
      </PageShell>
    );
  }

  const { userId } = await auth();
  const currency = "GBP";
  let spendableBalance = 0;
  if (userId) {
    const wallet = await ensureWalletForUser(supabaseAdmin(), userId, currency);
    if (wallet) spendableBalance = wallet.pending_balance + wallet.current_balance;
  }

  return (
    <PageShell>
      <Link
        href="/app/batches"
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-[#9CA3AF] transition-colors hover:text-[#F9FAFB]"
      >
        <span className="text-[#6B7280]" aria-hidden>
          ←
        </span>
        Back to payouts
      </Link>
      <h1 className="text-xl font-semibold text-[#F9FAFB] sm:text-2xl">New payout</h1>
      <p className="mt-2 text-sm text-[#6B7280]">Set up in a few steps—recipients and amounts come next.</p>
      <div className="mt-8">
        <CreateBatchForm
          orgId={orgId}
          createBatch={createBatch}
          spendableBalance={spendableBalance}
          currency={currency}
        />
      </div>
    </PageShell>
  );
}
