import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { formatExpiryDateTime, formatExpiryTimeLeft } from "@/lib/formatExpiry";
import { getClaimableBatchInfo, normalizeBatchCode } from "@/lib/claimableBatch";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { joinClaimableBatch } from "../../join-batch/actions";

export const dynamic = "force-dynamic";

type Params = Promise<{ batchCode: string }>;

function formatMoney(amount: number | null | undefined, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(Number(amount ?? 0));
}

export default async function ClaimPage({ params }: { params: Params }) {
  const { batchCode: rawCode } = await params;
  const code = normalizeBatchCode(rawCode ?? "");

  if (!code) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-6">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-8 max-w-md text-center">
          <p className="text-red-300 font-medium">Batch not found.</p>
          <Link href="/app/join-batch" className="mt-4 inline-block text-sm text-neutral-400 hover:text-white">
            Join with a code
          </Link>
        </div>
      </div>
    );
  }

  const { userId } = await auth();
  const supabase = supabaseAdmin();
  const { batch, currentClaims, alreadyJoined, statusMessage, statusType, nextClaimAmount, allocationMode } = await getClaimableBatchInfo(
    supabase,
    code,
    userId
  );

  const isError = !batch || statusType === "error";
  const canJoin = batch && statusType === "success" && !alreadyJoined && !!userId;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-lg px-4 py-8">
        <h1 className="text-2xl font-semibold text-white mb-6">Join batch</h1>

        {!batch && (
          <div className="rounded-xl border border-red-800/50 bg-red-950/20 p-6">
            <p className="text-red-300 font-medium">{statusMessage ?? "Batch not found."}</p>
            <Link href="/app/join-batch" className="mt-4 inline-block text-sm text-neutral-400 hover:text-white">
              Try another code
            </Link>
          </div>
        )}

        {batch && isError && (
          <div className="rounded-xl border border-red-800/50 bg-red-950/20 p-6">
            <p className="text-red-300 font-medium">{statusMessage}</p>
            <Link href="/app/join-batch" className="mt-4 inline-block text-sm text-neutral-400 hover:text-white">
              Join with a code
            </Link>
          </div>
        )}

        {batch && !isError && (
          <div className="rounded-xl border border-emerald-800/50 bg-emerald-950/20 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">Batch summary</h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-neutral-500">Batch name</dt>
                <dd className="font-medium text-neutral-200">{batch.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Batch code</dt>
                <dd className="font-mono text-neutral-200">{batch.batch_code ?? "—"}</dd>
              </div>
              {(nextClaimAmount != null && nextClaimAmount > 0) && (
                <div>
                  <dt className="text-neutral-500">Amount you will receive</dt>
                  <dd className="font-medium text-emerald-200">
                    {formatMoney(nextClaimAmount, batch.currency ?? "GBP")}
                  </dd>
                </div>
              )}
              {allocationMode === "custom" && (nextClaimAmount == null || nextClaimAmount <= 0) && !isError && canJoin && (
                <div>
                  <dt className="text-neutral-500">Claim amount</dt>
                  <dd className="text-neutral-300 text-sm">Will be assigned from the next available slot.</dd>
                </div>
              )}
              <div>
                <dt className="text-neutral-500">Expires</dt>
                <dd className="text-neutral-200">{formatExpiryDateTime(batch.expires_at)}</dd>
                {batch.expires_at && (
                  <>
                    <dd className="text-xs text-neutral-500 mt-0.5">Timezone: Local time</dd>
                    <dd className="text-xs text-neutral-400 mt-0.5">
                      Time left: {formatExpiryTimeLeft(batch.expires_at)}
                    </dd>
                  </>
                )}
              </div>
              <div>
                <dt className="text-neutral-500">Max claims</dt>
                <dd className="text-neutral-200">{batch.max_claims ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Current claims</dt>
                <dd className="text-neutral-200">{currentClaims}</dd>
              </div>
            </dl>

            {!userId && (
              <div className="pt-4 border-t border-neutral-700">
                <p className="text-neutral-300 mb-3">Sign in to join this batch.</p>
                <Link
                  href={`/sign-in?redirect_url=${encodeURIComponent(`/app/claim/${code}`)}`}
                  className="rounded-lg border border-neutral-600 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-800"
                >
                  Sign in
                </Link>
              </div>
            )}

            {userId && alreadyJoined && (
              <p className="text-emerald-300 font-medium pt-2">You have already joined this batch.</p>
            )}

            {canJoin && (
              <form action={joinClaimableBatch} className="pt-2">
                <input type="hidden" name="batchId" value={batch.id} />
                <input type="hidden" name="orgId" value={batch.org_id} />
                <input type="hidden" name="batchCode" value={batch.batch_code ?? code} />
                <button
                  type="submit"
                  className="rounded-lg border border-emerald-700/50 bg-emerald-900/30 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-800/40"
                >
                  Join Batch
                </button>
              </form>
            )}
          </div>
        )}

        <p className="mt-6 text-sm text-neutral-500">
          <Link href="/app/join-batch" className="text-neutral-400 hover:text-white">
            Enter a batch code instead
          </Link>
        </p>
      </div>
    </div>
  );
}
