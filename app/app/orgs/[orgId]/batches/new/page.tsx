import { auth } from "@clerk/nextjs/server";
import { createBatch } from "./actions";
import { CreateBatchForm } from "./CreateBatchForm";
import { ensureWalletForUser } from "@/lib/wallet";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type Params = Promise<{ orgId: string }>;

export default async function NewBatchPage({ params }: { params: Params }) {
  const { orgId } = await params;

  if (!orgId) {
    return (
      <div className="p-6 text-red-500">Missing orgId in route.</div>
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
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-8 text-2xl font-semibold text-white">New Payout</h1>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
          <CreateBatchForm
            orgId={orgId}
            createBatch={createBatch}
            spendableBalance={spendableBalance}
            currency={currency}
          />
        </div>
      </div>
    </div>
  );
}
