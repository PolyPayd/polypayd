import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { formatExpiryDateTime, formatExpiryTimeLeft } from "@/lib/formatExpiry";
import { formatBatchCodeForDisplay } from "@/lib/batchCodePublic";
import { getClaimableBatchInfo, normalizeBatchCode } from "@/lib/claimableBatch";
import { CLAIMABLE_SCHEMA_MESSAGE } from "@/lib/dbSchema";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { joinClaimableBatch } from "./actions";
import { ClaimCodeToolbar } from "@/components/claim/ClaimCodeToolbar";
import { FintechButton, FintechCard, FintechInput, PageShell } from "@/components/fintech";

export const dynamic = "force-dynamic";

type Search = { code?: string; joined?: string; error?: string };

function formatMoney(amount: number | null | undefined, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(Number(amount ?? 0));
}

function errorMessage(errorParam: string): string {
  if (errorParam === "schema") return CLAIMABLE_SCHEMA_MESSAGE;
  if (errorParam === "not_found") return "Batch not found.";
  if (errorParam === "not_claimable") return "This batch cannot be joined with a code.";
  if (errorParam === "expired") return "This batch has expired.";
  if (errorParam === "full") return "This batch is full and no longer accepting new joins.";
  if (errorParam === "allocations_locked") return "This batch is no longer accepting claims.";
  if (errorParam === "already_joined") return "You have already joined this batch.";
  if (errorParam === "unauthorized") return "You must be signed in to join a batch.";
  return "Something went wrong. Please try again.";
}

export default async function JoinBatchPage({
  searchParams,
}: {
  searchParams?: Search | Promise<Search>;
}) {
  const sp =
    (await Promise.resolve(searchParams as Promise<Search> | Search | undefined)) ?? ({} as Search);
  const codeRaw = (sp.code ?? "").trim();
  const code = codeRaw ? normalizeBatchCode(codeRaw) : "";
  const joined = sp.joined === "1";
  const errorParam = sp.error ?? "";

  const { userId } = await auth();
  if (!userId) {
    return (
      <PageShell narrow className="py-10">
        <p className="text-center text-sm text-[#9CA3AF]">You must be signed in to join a batch.</p>
        <div className="mt-6 flex justify-center">
          <Link href="/sign-in" className="text-sm font-medium text-[#3B82F6] hover:text-[#60A5FA]">
            Sign in
          </Link>
        </div>
      </PageShell>
    );
  }

  const supabase = supabaseAdmin();

  let batch = null;
  let currentClaims = 0;
  let alreadyJoined = false;
  let statusMessage: string | null = null;
  let statusType: "success" | "error" = "error";

  let nextClaimAmount: number | null = null;
  let allocationMode: "even" | "custom" | null = null;
  if (code) {
    const info = await getClaimableBatchInfo(supabase, code, userId);
    batch = info.batch;
    currentClaims = info.currentClaims;
    alreadyJoined = info.alreadyJoined;
    statusMessage = info.statusMessage;
    statusType = info.statusType;
    nextClaimAmount = info.nextClaimAmount;
    allocationMode = info.allocationMode;
  }

  const displayCode = batch ? formatBatchCodeForDisplay(batch.batch_code ?? code) : code || "-";
  const canJoin = batch && statusType === "success" && !alreadyJoined && !!userId;

  return (
    <PageShell narrow className="py-8">
      <h1 className="text-xl font-semibold tracking-tight text-[#F9FAFB] sm:text-2xl">Claim payout</h1>
      <p className="mt-2 text-sm text-[#6B7280]">Enter a code or open an invite link.</p>

      {errorParam ? (
        <p className="mt-6 rounded-xl bg-[#EF4444]/10 px-4 py-3 text-sm text-[#FCA5A5]">{errorMessage(errorParam)}</p>
      ) : null}

      {joined ? (
        <p className="mt-6 rounded-xl bg-[#22C55E]/10 px-4 py-3 text-sm text-[#86EFAC]">
          You have successfully joined this batch.
        </p>
      ) : null}

      <FintechCard interactive={false} className="mt-8">
        <h2 className="text-base font-semibold text-[#F9FAFB]">Claim access</h2>
        <p className="mt-1 text-sm text-[#6B7280]">Invite code</p>

        <form action="/app/join-batch" method="get" className="mt-6 space-y-4">
          <div>
            <label htmlFor="code" className="sr-only">
              Claim code
            </label>
            <FintechInput id="code" name="code" type="text" defaultValue={code} placeholder="Paste claim code" />
          </div>
          <FintechButton type="submit" className="min-h-11 w-full sm:w-auto">
            Find payout
          </FintechButton>
        </form>

        {batch && statusType === "success" ? (
          <div className="mt-8 border-t border-white/[0.05] pt-8">
            <p className="text-xs font-medium text-[#6B7280]">Active code</p>
            <p className="mt-2 font-mono text-lg font-semibold tracking-wide text-[#F9FAFB]">{displayCode}</p>
            <div className="mt-4">
              <ClaimCodeToolbar displayCode={displayCode} />
            </div>
          </div>
        ) : null}
      </FintechCard>

      {code ? (
        <FintechCard interactive={false} className="mt-6">
          <h2 className="text-base font-semibold text-[#F9FAFB]">Campaign details</h2>

          {!batch ? (
            <p className="mt-4 text-sm text-[#FCA5A5]">{statusMessage ?? "Batch not found."}</p>
          ) : (
            <>
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
                  <dd className="mt-1 text-[#F9FAFB]">
                    {batch.expires_at ? formatExpiryDateTime(batch.expires_at) : "No expiry"}
                  </dd>
                  {batch.expires_at ? (
                    <dd className="mt-1 text-xs text-[#6B7280]">Time left: {formatExpiryTimeLeft(batch.expires_at)}</dd>
                  ) : null}
                </div>
              </dl>

              {statusMessage ? (
                <p
                  className={`mt-8 text-sm font-medium ${
                    statusType === "success" ? "text-[#86EFAC]" : "text-[#FCA5A5]"
                  }`}
                >
                  {statusMessage}
                </p>
              ) : null}

              {canJoin ? (
                <form action={joinClaimableBatch} className="mt-8">
                  <input type="hidden" name="batchId" value={batch.id} />
                  <input type="hidden" name="orgId" value={batch.org_id} />
                  <input type="hidden" name="batchCode" value={batch.batch_code ?? code} />
                  <FintechButton type="submit" className="min-h-12 w-full">
                    Claim payout
                  </FintechButton>
                </form>
              ) : null}

              {alreadyJoined ? (
                <p className="mt-6 text-sm font-medium text-[#86EFAC]">You have already joined this batch.</p>
              ) : null}
            </>
          )}
        </FintechCard>
      ) : null}
    </PageShell>
  );
}
