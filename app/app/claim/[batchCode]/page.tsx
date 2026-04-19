import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { formatExpiryDateTime, formatExpiryTimeLeft } from "@/lib/formatExpiry";
import { claimJoinAppPath, formatBatchCodeForDisplay } from "@/lib/batchCodePublic";
import { getClaimableBatchInfo, normalizeBatchCode } from "@/lib/claimableBatch";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { joinClaimableBatch } from "../../join-batch/actions";
import { ClaimCodeToolbar } from "@/components/claim/ClaimCodeToolbar";
import { FintechButton, FintechCard, PageShell } from "@/components/fintech";

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
      <PageShell narrow className="py-12">
        <p className="text-center text-sm font-medium text-[#FCA5A5]">Batch not found.</p>
        <div className="mt-6 flex justify-center">
          <Link href="/app/join-batch" className="text-sm font-medium text-[#3B82F6] hover:text-[#60A5FA]">
            Join with a code
          </Link>
        </div>
      </PageShell>
    );
  }

  const { userId } = await auth();
  const supabase = supabaseAdmin();
  const { batch, currentClaims, alreadyJoined, statusMessage, statusType, nextClaimAmount, allocationMode } =
    await getClaimableBatchInfo(supabase, code, userId);

  const isError = !batch || statusType === "error";
  const canJoin = batch && statusType === "success" && !alreadyJoined && !!userId;
  const displayCode = formatBatchCodeForDisplay(batch?.batch_code ?? code);

  return (
    <PageShell narrow className="py-8">
      <h1 className="text-xl font-semibold tracking-tight text-[#F9FAFB] sm:text-2xl">Join batch</h1>
      <p className="mt-2 text-sm text-[#6B7280]">You were invited with a claim link.</p>

      {!batch && (
        <FintechCard interactive={false} className="mt-8">
          <p className="text-sm font-medium text-[#FCA5A5]">{statusMessage ?? "Batch not found."}</p>
          <Link href="/app/join-batch" className="mt-6 inline-block text-sm font-medium text-[#3B82F6] hover:text-[#60A5FA]">
            Try another code
          </Link>
        </FintechCard>
      )}

      {batch && isError && (
        <FintechCard interactive={false} className="mt-8">
          <p className="text-sm font-medium text-[#FCA5A5]">{statusMessage}</p>
          <Link href="/app/join-batch" className="mt-6 inline-block text-sm font-medium text-[#3B82F6] hover:text-[#60A5FA]">
            Join with a code
          </Link>
        </FintechCard>
      )}

      {batch && !isError && (
        <>
          <FintechCard interactive={false} className="mt-8">
            <h2 className="text-base font-semibold text-[#F9FAFB]">Claim access</h2>
            <p className="mt-1 text-xs font-medium text-[#6B7280]">Invite code</p>
            <p className="mt-3 font-mono text-lg font-semibold tracking-wide text-[#F9FAFB]">{displayCode}</p>
            <div className="mt-4">
              <ClaimCodeToolbar displayCode={displayCode} />
            </div>

            {!userId && (
              <div className="mt-8 border-t border-white/[0.05] pt-8">
                <p className="text-sm text-[#9CA3AF]">Sign in to join this batch.</p>
                <Link
                  href={`/sign-in?redirect_url=${encodeURIComponent(claimJoinAppPath(displayCode))}`}
                  className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#3B82F6] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#2563EB]"
                >
                  Sign in
                </Link>
              </div>
            )}
          </FintechCard>

          <FintechCard interactive={false} className="mt-6">
            <h2 className="text-base font-semibold text-[#F9FAFB]">Campaign details</h2>
            <dl className="mt-6 space-y-5 text-sm">
              <div>
                <dt className="text-xs font-medium text-[#6B7280]">Name</dt>
                <dd className="mt-1 font-medium text-[#F9FAFB]">{batch.name ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-[#6B7280]">Pool</dt>
                <dd className="mt-1 tabular-nums text-[#F9FAFB]">{formatMoney(batch.total_amount, batch.currency ?? "GBP")}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-[#6B7280]">Recipients</dt>
                <dd className="mt-1 text-[#F9FAFB]">
                  {currentClaims} joined
                  {batch.max_claims != null ? ` · max ${batch.max_claims}` : ""}
                </dd>
              </div>
              {(nextClaimAmount != null && nextClaimAmount > 0) && (
                <div>
                  <dt className="text-xs font-medium text-[#6B7280]">Your amount</dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums text-[#22C55E]">
                    {formatMoney(nextClaimAmount, batch.currency ?? "GBP")}
                  </dd>
                </div>
              )}
              {allocationMode === "custom" && (nextClaimAmount == null || nextClaimAmount <= 0) && canJoin && (
                <div>
                  <dt className="text-xs font-medium text-[#6B7280]">Your amount</dt>
                  <dd className="mt-1 text-[#9CA3AF]">Assigned from the next open slot when you join.</dd>
                </div>
              )}
              <div>
                <dt className="text-xs font-medium text-[#6B7280]">Expires</dt>
                <dd className="mt-1 text-[#F9FAFB]">{formatExpiryDateTime(batch.expires_at)}</dd>
                {batch.expires_at ? (
                  <dd className="mt-1 text-xs text-[#6B7280]">Time left: {formatExpiryTimeLeft(batch.expires_at)}</dd>
                ) : null}
              </div>
            </dl>

            {userId && alreadyJoined && (
              <p className="mt-8 text-sm font-medium text-[#86EFAC]">You have already joined this batch.</p>
            )}

            {canJoin && (
              <form action={joinClaimableBatch} className="mt-8">
                <input type="hidden" name="batchId" value={batch.id} />
                <input type="hidden" name="orgId" value={batch.org_id} />
                <input type="hidden" name="batchCode" value={batch.batch_code ?? code} />
                <FintechButton type="submit" className="min-h-12 w-full">
                  Join batch
                </FintechButton>
              </form>
            )}
          </FintechCard>
        </>
      )}

      <p className="mt-8 text-center text-sm text-[#6B7280]">
        <Link href="/app/join-batch" className="font-medium text-[#9CA3AF] transition-colors hover:text-[#F9FAFB]">
          Enter a batch code instead
        </Link>
      </p>
    </PageShell>
  );
}
