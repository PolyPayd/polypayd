import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { formatExpiryDateTime, formatExpiryTimeLeft } from "@/lib/formatExpiry";
import { getClaimableBatchInfo, normalizeBatchCode } from "@/lib/claimableBatch";
import { CLAIMABLE_SCHEMA_MESSAGE } from "@/lib/dbSchema";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { joinClaimableBatch } from "./actions";

export const dynamic = "force-dynamic";

type Search = { code?: string; joined?: string; error?: string };

function formatMoney(amount: number | null | undefined, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(Number(amount ?? 0));
}

export default async function JoinBatchPage({
  searchParams,
}: {
  searchParams?: Search | Promise<Search>;
}) {
  const sp = (await Promise.resolve(searchParams as any)) ?? ({} as Search);
  const codeRaw = (sp.code ?? "").trim();
  const code = codeRaw ? normalizeBatchCode(codeRaw) : "";
  const joined = sp.joined === "1";
  const errorParam = sp.error ?? "";

  const { userId } = await auth();
  if (!userId) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-6">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-8 max-w-md text-center">
          <p className="text-neutral-300">You must be signed in to join a batch.</p>
          <Link
            href="/sign-in"
            className="mt-4 inline-block text-sm text-neutral-400 hover:text-white"
          >
            Sign in
          </Link>
        </div>
      </div>
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

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-lg px-4 py-8">
        <h1 className="text-2xl font-semibold text-white mb-6">Claim payout</h1>

        {errorParam && (
          <div className="rounded-xl border border-red-800/50 bg-red-950/20 p-4 mb-6">
            <p className="text-red-300 font-medium">
              {errorParam === "schema" && CLAIMABLE_SCHEMA_MESSAGE}
              {errorParam === "not_found" && "Batch not found."}
              {errorParam === "not_claimable" && "This batch cannot be joined with a code."}
              {errorParam === "expired" && "This batch has expired."}
              {errorParam === "full" && "This batch is full and no longer accepting new joins."}
              {errorParam === "allocations_locked" && "This batch is no longer accepting claims."}
              {errorParam === "already_joined" && "You have already joined this batch."}
              {errorParam === "unauthorized" && "You must be signed in to join a batch."}
              {!["schema", "not_found", "not_claimable", "expired", "full", "allocations_locked", "already_joined", "unauthorized"].includes(errorParam) && "Something went wrong. Please try again."}
            </p>
          </div>
        )}

        {joined && (
          <div className="rounded-xl border border-emerald-800/50 bg-emerald-950/20 p-4 mb-6">
            <p className="text-emerald-300 font-medium">You have successfully joined this batch.</p>
          </div>
        )}

        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6 mb-6">
          <form
            action="/app/join-batch"
            method="get"
            className="space-y-4"
          >
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-neutral-300 mb-2">
                Claim code
              </label>
              <input
                id="code"
                name="code"
                type="text"
                defaultValue={code}
                placeholder="Paste claim code"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:border-neutral-500"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
            >
              Find payout
            </button>
          </form>
        </div>

        {code && (
          <div
            className={`rounded-xl border p-6 ${
              batch && statusType === "success"
                ? "border-emerald-800/50 bg-emerald-950/20"
                : "border-neutral-800 bg-neutral-900/50"
            }`}
          >
            <h2 className="text-lg font-semibold text-white mb-4">Claim result</h2>

            {!batch ? (
              <p className="text-red-300">{statusMessage}</p>
            ) : (
              <>
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-neutral-500">Batch name</dt>
                    <dd className="font-medium text-neutral-200">{batch.name ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500">Batch code</dt>
                    <dd className="font-mono text-neutral-300">{batch.batch_code ?? "—"}</dd>
                  </div>
                  {(nextClaimAmount != null && nextClaimAmount > 0) && (
                    <div>
                      <dt className="text-neutral-500">Amount you will receive</dt>
                      <dd className="font-medium text-emerald-200">
                        {formatMoney(nextClaimAmount, batch.currency ?? "GBP")}
                      </dd>
                    </div>
                  )}
                  {allocationMode === "custom" && (nextClaimAmount == null || nextClaimAmount <= 0) && batch && statusType === "success" && !alreadyJoined && (
                    <div>
                      <dt className="text-neutral-500">Claim amount</dt>
                      <dd className="text-neutral-300 text-sm">Will be assigned from the next available slot.</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-neutral-500">Expires</dt>
                    <dd className="text-neutral-300">
                      {batch.expires_at ? formatExpiryDateTime(batch.expires_at) : "No expiry"}
                    </dd>
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
                    <dd className="text-neutral-300">{batch.max_claims ?? "—"}</dd>
                  </div>
                  {batch.batch_type === "claimable" && (
                    <div>
                      <dt className="text-neutral-500">Current claims</dt>
                      <dd className="text-neutral-300">{currentClaims}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-neutral-500">Status</dt>
                    <dd className="text-neutral-300">{batch.status ?? "—"}</dd>
                  </div>
                </dl>

                <div className="mt-4 pt-4 border-t border-neutral-800 space-y-4">
                  <p
                    className={
                      statusType === "success"
                        ? "text-emerald-300 font-medium"
                        : "text-red-300 font-medium"
                    }
                  >
                    {statusMessage}
                  </p>
                  {batch && statusType === "success" && !alreadyJoined && (
                    <form action={joinClaimableBatch} className="pt-2">
                      <input type="hidden" name="batchId" value={batch.id} />
                      <input type="hidden" name="orgId" value={batch.org_id} />
                      <input type="hidden" name="batchCode" value={batch.batch_code ?? code} />
                      <button
                        type="submit"
                        className="rounded-lg border border-emerald-700/50 bg-emerald-900/30 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-800/40"
                      >
                        Claim payout
                      </button>
                    </form>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
