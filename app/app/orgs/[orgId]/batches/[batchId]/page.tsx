import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { formatExpiryDateTime, formatExpiryTimeLeft } from "@/lib/formatExpiry";
import { isClaimableSchemaError, CLAIMABLE_SCHEMA_MESSAGE } from "@/lib/dbSchema";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { updateClaimAmounts } from "./actions";
import { ApproveBatchButton } from "./ApproveBatchButton";
import { ClaimableBatchShare } from "./ClaimableBatchShare";
import { ClaimablePayoutEditor } from "./ClaimablePayoutEditor";
import { CsvUploadForm } from "./CsvUploadForm";
import { SendClaimablePayoutsButton } from "./SendClaimablePayoutsButton";
import { UnlockAllocationsButton } from "./UnlockAllocationsButton";
import { DownloadResultsButton } from "./DownloadResultsButton";
import { RetryFailedButton } from "./RetryFailedButton";
import { ReplaceCsvButton } from "./ReplaceCsvButton";
import { RunBatchButton } from "./RunBatchButton";
import { UploadCsvButton } from "./UploadCsvButton";
import { ImpactQueryToast } from "@/components/impact/ImpactQueryToast";

export const dynamic = "force-dynamic";

type Params = { orgId: string; batchId: string };
type Search = {
  tab?: string;
  q?: string;
  uploadId?: string;
  status?: string;
  error?: string;
  /** Set after Bulk Send when platform fee produces an impact allocation */
  impactToast?: string;
};

function moneyGBP(n: unknown) {
  const num = Number(n ?? 0);
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(num);
}

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function statusBadge(status?: string | null) {
  const s = (status ?? "unknown").toLowerCase();
  const base = "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium border";

  if (s === "draft") return clsx(base, "border-neutral-700 text-neutral-200 bg-neutral-900/30");
  if (s === "ready") return clsx(base, "border-blue-700 text-blue-200 bg-blue-900/20");
  if (s === "processing") return clsx(base, "border-yellow-700 text-yellow-200 bg-yellow-900/20");
  if (s === "completed") return clsx(base, "border-emerald-700 text-emerald-200 bg-emerald-900/20");
  if (s === "failed") return clsx(base, "border-red-700 text-red-200 bg-red-900/20");

  return clsx(base, "border-neutral-700 text-neutral-200 bg-neutral-900/30");
}

function buildUrl(basePath: string, next: Record<string, string | undefined>) {
  const u = new URL(basePath, "http://local");
  Object.entries(next).forEach(([k, v]) => {
    if (!v) return;
    u.searchParams.set(k, v);
  });
  const qs = u.searchParams.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export default async function BatchDetailsPage({
  params,
  searchParams,
}: {
  params: Params | Promise<Params>;
  searchParams?: Search | Promise<Search>;
}) {
  // Next can deliver params/searchParams as Promises, unwrap safely
  const { orgId, batchId } = await Promise.resolve(params as any);
  const sp = (await Promise.resolve(searchParams as any)) ?? ({} as Search);
  const actionError = sp.error ? String(sp.error) : null;
  const impactToastRaw = sp.impactToast != null ? String(sp.impactToast).trim() : "";
  const impactToastPounds =
    impactToastRaw !== "" && Number.isFinite(Number(impactToastRaw)) ? Number(impactToastRaw) : null;

  // Guard so it never crashes
  if (!orgId || !batchId) {
    return <div className="p-6 text-red-500">Missing orgId or batchId in route.</div>;
  }

  const tab = (sp.tab ?? "items").toLowerCase(); // items | uploads | errors | activity
  const q = (sp.q ?? "").trim();
  const statusFilter = (sp.status ?? "all").toLowerCase();
  const supabase = supabaseAdmin();

  // 1) Batch — base columns only so page loads when extended claimable columns are missing
  const baseBatchSelect = "id, org_id, name, status, currency, total_amount, recipient_count, created_at, batch_type, batch_code, expires_at, max_claims";
  const { data: batchBase, error: batchErr } = await supabase
    .from("batches")
    .select(baseBatchSelect)
    .eq("id", batchId)
    .maybeSingle();

  if (batchErr) {
    return <div className="p-6 text-red-500">Failed to load batch: {batchErr.message}</div>;
  }
  if (!batchBase) {
    return <div className="p-6">Batch not found.</div>;
  }

  const isClaimable = batchBase.batch_type === "claimable";
  const payoutKindLabel = isClaimable ? "Claim Link" : "Bulk Send";
  let claimableSchemaReady = true;
  let amountPerClaim: number | null = null;
  let allocationMode: string | null = null;

  let allocationsLockedAt: string | null = null;
  if (isClaimable) {
    const ext = await supabase
      .from("batches")
      .select("amount_per_claim, allocation_mode, allocations_locked_at")
      .eq("id", batchId)
      .maybeSingle();
    if (ext.error && isClaimableSchemaError(ext.error)) {
      claimableSchemaReady = false;
    } else if (ext.data) {
      amountPerClaim = ext.data.amount_per_claim != null ? Number(ext.data.amount_per_claim) : null;
      allocationMode = ext.data.allocation_mode ?? null;
      allocationsLockedAt = ext.data.allocations_locked_at ?? null;
    }
  }
  const allocationsLocked = !!allocationsLockedAt;

  const computedAmountPerClaim =
    amountPerClaim != null
      ? amountPerClaim
      : isClaimable && typeof batchBase.total_amount === "number" && typeof batchBase.max_claims === "number" && batchBase.max_claims > 0
        ? Number(batchBase.total_amount) / batchBase.max_claims
        : null;
  const batch = { ...batchBase, amount_per_claim: amountPerClaim ?? computedAmountPerClaim, allocation_mode: allocationMode, allocations_locked_at: allocationsLockedAt };

  let claimSlots: Array<{ id: string; slot_index: number; amount: number; status: string; claimed_by_user_id: string | null; claimed_at: string | null }> = [];
  if (isClaimable) {
    const slotsRes = await supabase
      .from("claim_slots")
      .select("id, slot_index, amount, status, claimed_by_user_id, claimed_at")
      .eq("batch_id", batchId)
      .order("slot_index", { ascending: true });
    if (slotsRes.error) {
      claimableSchemaReady = false;
    } else if (slotsRes.data) {
      claimSlots = slotsRes.data.map((s) => ({
        id: s.id,
        slot_index: s.slot_index,
        amount: Number(s.amount ?? 0),
        status: String(s.status ?? "open"),
        claimed_by_user_id: s.claimed_by_user_id ?? null,
        claimed_at: s.claimed_at ?? null,
      }));
    }
  }

  const totalClaimedFromSlots = claimSlots.filter((s) => s.status === "claimed").reduce((sum, s) => sum + s.amount, 0);
  const hasSlots = claimSlots.length > 0;
  const openSlotsCount = claimSlots.filter((s) => s.status === "open").length;

  let claimableClaims: Array<{
    id: string;
    user_id: string;
    polypayd_username: string | null;
    claim_amount: number;
    payout_status?: string | null;
    paid_at?: string | null;
    failure_reason?: string | null;
  }> = [];
  if (isClaimable) {
    const baseSelect = "id, user_id, polypayd_username, claim_amount";
    const extendedSelect = "id, user_id, polypayd_username, claim_amount, payout_status, paid_at, failure_reason";
    let claimsRows: Array<Record<string, unknown>> | null = null;
    const { data: extendedRows, error: extendedErr } = await supabase
      .from("batch_claims")
      .select(extendedSelect)
      .eq("batch_id", batchId)
      .order("created_at", { ascending: true });
    if (!extendedErr && extendedRows?.length !== undefined) {
      claimsRows = extendedRows as Array<Record<string, unknown>>;
    } else {
      const { data: baseRows, error: baseErr } = await supabase
        .from("batch_claims")
        .select(baseSelect)
        .eq("batch_id", batchId)
        .order("created_at", { ascending: true });
      if (!baseErr && baseRows) claimsRows = baseRows as Array<Record<string, unknown>>;
    }
    if (claimsRows) {
      claimableClaims = claimsRows.map((c) => ({
        id: String(c.id ?? ""),
        user_id: String(c.user_id ?? ""),
        polypayd_username: (c.polypayd_username as string | null) ?? null,
        claim_amount: Number(c.claim_amount ?? 0),
        payout_status: (c.payout_status as string | null) ?? null,
        paid_at: (c.paid_at as string | null) ?? null,
        failure_reason: (c.failure_reason as string | null) ?? null,
      }));
    }
  }

  // Current user's org role (viewer = read-only; owner/operator = can perform actions)
  const { userId } = await auth();
  let role: string | null = null;
  if (userId) {
    const { data: membership } = await supabase
      .from("org_members")
      .select("role")
      .eq("org_id", orgId)
      .eq("clerk_user_id", userId)
      .maybeSingle();
    role = membership?.role ?? null;
  }
  const canPerformActions = role === "owner" || role === "operator";

  const totalClaimedFromClaims = isClaimable ? claimableClaims.reduce((s, c) => s + c.claim_amount, 0) : 0;

  const claimablePayoutStats = isClaimable
    ? {
        paidCount: claimableClaims.filter((c) => c.payout_status === "paid").length,
        failedCount: claimableClaims.filter((c) => c.payout_status === "failed").length,
        paidAmount: claimableClaims
          .filter((c) => c.payout_status === "paid")
          .reduce((s, c) => s + c.claim_amount, 0),
        failedAmount: claimableClaims
          .filter((c) => c.payout_status === "failed")
          .reduce((s, c) => s + c.claim_amount, 0),
      }
    : null;

  const batchStatus = String(batch.status ?? "").toLowerCase();
  const bulkSendLocked = !isClaimable && (batchStatus === "completed" || batchStatus === "completed_with_errors");
  const claimableSendEligible =
    isClaimable &&
    allocationsLocked &&
    batchStatus !== "completed" &&
    batchStatus !== "completed_with_errors" &&
    canPerformActions &&
    claimableClaims.length >= 1 &&
    Math.abs(claimableClaims.reduce((s, c) => s + c.claim_amount, 0) - Number(batch.total_amount ?? 0)) < 0.01;
  // Include status "processing" so stuck batches (e.g. after RPC was missing) can retry Send payouts.

  // 2) Uploads (for tab + latest)
  const { data: uploads, error: uploadsErr } = await supabase
    .from("batch_uploads")
    .select("id, original_filename, row_count, valid_count, invalid_count, file_hash, created_at")
    .eq("batch_id", batchId)
    .order("created_at", { ascending: false })
    .limit(25);

  if (uploadsErr) {
    return <div className="p-6 text-red-500">Failed to load uploads: {uploadsErr.message}</div>;
  }

  const latestUpload = uploads?.[0] ?? null;
  const selectedUploadId = (sp.uploadId ?? latestUpload?.id ?? "").trim();
  const latestInvalidRows = Number(latestUpload?.invalid_count ?? 0);

  // Failed count for Retry Failed button (when batch is completed_with_errors)
  let failedCount = 0;
  if (batch.status === "completed_with_errors") {
    const { data: failedItems } = await supabase
      .from("batch_items")
      .select("id")
      .eq("batch_id", batchId)
      .eq("status", "failed");
    failedCount = failedItems?.length ?? 0;
  }

  // Summary stats from batch_items (success/failed counts and amounts)
  const { data: summaryItems } = await supabase
    .from("batch_items")
    .select("status, amount")
    .eq("batch_id", batchId);
  const successCount = (summaryItems ?? []).filter((i) => i.status === "success").length;
  const failedCountSummary = (summaryItems ?? []).filter((i) => i.status === "failed").length;
  const successAmount = (summaryItems ?? [])
    .filter((i) => i.status === "success")
    .reduce((sum, i) => sum + Number(i.amount ?? 0), 0);
  const failedAmount = (summaryItems ?? [])
    .filter((i) => i.status === "failed")
    .reduce((sum, i) => sum + Number(i.amount ?? 0), 0);

  // Bulk Send eligibility: require at least one pending recipient and pending total > 0.
  const pendingItems = (summaryItems ?? []).filter((i) => !i.status || i.status === "pending");
  const bulkPendingCount = pendingItems.length;
  const bulkPendingTotal = pendingItems.reduce((sum, i) => sum + Number(i.amount ?? 0), 0);
  const bulkSendReady = bulkPendingCount > 0 && bulkPendingTotal > 0 && Number(batch.total_amount ?? 0) > 0;

  const totalProcessed = successCount + failedCountSummary;
  const successRate =
    totalProcessed > 0 ? Math.round((successCount / totalProcessed) * 100) : 0;

  // 3) Items (server-side search)
  let items: any[] = [];
  let itemsErr: any = null;

  if (tab === "items") {
    let itemsQuery = supabase
      .from("batch_items")
      .select("id, recipient_name, account_identifier, amount, reference, status, failure_reason, created_at")
      .eq("batch_id", batchId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (statusFilter === "success") {
      itemsQuery = itemsQuery.eq("status", "success");
    }
    if (statusFilter === "failed") {
      itemsQuery = itemsQuery.eq("status", "failed");
    }

    if (q) {
      const safe = q.replace(/[%_]/g, "\\$&"); // basic escaping for ilike wildcards
      itemsQuery = itemsQuery.or(
        `recipient_name.ilike.%${safe}%,account_identifier.ilike.%${safe}%,reference.ilike.%${safe}%`
      );
    }

    const res = await itemsQuery;
    items = res.data ?? [];
    itemsErr = res.error ?? null;

    if (itemsErr) {
      return <div className="p-6 text-red-500">Failed to load batch items: {itemsErr.message}</div>;
    }
  }

  // 4) Audit events for activity tab
  let auditEvents: Array<{
    id: string;
    event_type: string;
    event_data: Record<string, unknown>;
    created_at: string | null;
    actor_user_id: string | null;
  }> = [];
  if (tab === "activity" || isClaimable) {
    const { data: events } = await supabase
      .from("audit_events")
      .select("id, event_type, event_data, created_at, actor_user_id")
      .eq("batch_id", batchId)
      .order("created_at", { ascending: false })
      .limit(100);
    auditEvents = (events ?? []).map((e) => ({
      id: e.id,
      event_type: e.event_type ?? "",
      event_data: (e.event_data as Record<string, unknown>) ?? {},
      created_at: e.created_at ?? null,
      actor_user_id: e.actor_user_id ?? null,
    }));
  }

  // 5) Errors for selected upload
  let uploadErrors: any[] = [];
  let errorsErr: any = null;

  if (tab === "errors") {
    if (selectedUploadId) {
      const res = await supabase
        .from("batch_item_errors")
        .select("id, row_number, field, message, created_at")
        .eq("batch_upload_id", selectedUploadId)
        .order("row_number", { ascending: true })
        .limit(300);

      uploadErrors = res.data ?? [];
      errorsErr = res.error ?? null;

      if (errorsErr) {
        return <div className="p-6 text-red-500">Failed to load upload errors: {errorsErr.message}</div>;
      }
    }
  }

  const basePath = `/app/batches/${batchId}`;

  const tabLink = (t: string) =>
    buildUrl(basePath, {
      tab: t,
      q: t === "items" ? q : undefined,
      status: t === "items" ? statusFilter : undefined,
      uploadId: t === "errors" ? selectedUploadId || undefined : undefined,
    });

  const timeline = [
    {
      label: "Batch created",
      time: batch.created_at,
      status: "done",
    },
    {
      label: "CSV uploaded",
      time: latestUpload?.created_at ?? null,
      status: latestUpload ? "done" : "pending",
    },
    {
      label: "Batch approved",
      status: batch.status !== "draft" ? "done" : "pending",
    },
    {
      label: "Processing started",
      status:
        batch.status === "processing" ||
        batch.status === "completed" ||
        batch.status === "completed_with_errors"
          ? "done"
          : "pending",
    },
    {
      label: "Processing completed",
      status:
        batch.status === "completed" || batch.status === "completed_with_errors"
          ? "done"
          : "pending",
    },
  ];

  const claimableExpired =
    batch.expires_at && new Date(batch.expires_at).getTime() < Date.now();
  const claimableFull = hasSlots
    ? openSlotsCount === 0
    : typeof batch.max_claims === "number" &&
      batch.max_claims > 0 &&
      (batch.recipient_count ?? 0) >= batch.max_claims;
  const claimableTimeline = [
    { label: "Batch created", time: batch.created_at, status: "done" as const },
    {
      label: "Live for claims",
      time: null,
      status: !claimableExpired && !claimableFull ? "done" : "pending",
    },
    {
      label: "Full or Expired",
      time: null,
      status: claimableExpired || claimableFull ? "done" : "pending",
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <ImpactQueryToast impactPounds={impactToastPounds} batchId={batchId} />
      {actionError && (
        <div className="rounded-xl border border-red-800/50 bg-red-950/20 p-4 text-red-200">
          {actionError}
        </div>
      )}
      {/* Header */}
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <Link
            href={`/app/batches`}
            className="inline-flex items-center text-sm text-neutral-400 hover:text-white mb-4"
          >
            ← Back to payouts
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold truncate">{batch.name ?? "Untitled batch"}</h1>
            <span className={statusBadge(batch.status)}>{batch.status ?? "unknown"}</span>
          </div>

          <div className="mt-2 space-y-1 text-sm text-neutral-400">
            <div>
              Batch ID: <span className="font-mono text-neutral-300">{batch.id}</span>
            </div>
            <div>
              Org ID: <span className="font-mono text-neutral-300">{batch.org_id}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-3">
          {!isClaimable && (
            <div className="flex items-center gap-2">
              {canPerformActions && !bulkSendLocked && (
                <UploadCsvButton orgId={orgId} batchId={batchId} />
              )}
              <DownloadResultsButton orgId={orgId} batchId={batchId} />
              {batch.status === "draft" && canPerformActions && (
                bulkSendReady ? <ApproveBatchButton orgId={orgId} batchId={batchId} /> : null
              )}
              {batch.status === "processing" && canPerformActions && (
                <RunBatchButton
                  orgId={orgId}
                  batchId={batchId}
                  pendingTotal={bulkPendingTotal}
                  pendingCount={bulkPendingCount}
                  disabled={!bulkSendReady}
                />
              )}
              {batch.status === "completed_with_errors" && failedCount > 0 && canPerformActions && (
                <RetryFailedButton orgId={orgId} batchId={batchId} />
              )}
            </div>
          )}
          {!isClaimable && (batch.status === "draft" || batch.status === "processing") && !bulkSendReady && (
            <div className="text-xs text-amber-300 mt-2">
              This Bulk Send has no recipients yet. Upload a CSV to continue.
            </div>
          )}
          {!isClaimable && latestInvalidRows > 0 && (
            <div className="text-xs text-amber-300 mt-2">
              Warning: {latestInvalidRows} invalid row{latestInvalidRows === 1 ? "" : "s"} were skipped. Sending will process only valid recipients.
            </div>
          )}
          {!isClaimable && (
            <div className="hidden md:block rounded-xl border border-neutral-800 p-4 text-sm min-w-[240px]">
              <div className="text-neutral-400">Latest Upload</div>
              {latestUpload ? (
                <div className="mt-2 space-y-1">
                  <div className="font-medium text-neutral-200">{latestUpload.original_filename ?? "—"}</div>
                  <div className="text-neutral-400">
                    Rows: <span className="text-neutral-200">{latestUpload.row_count ?? 0}</span>
                  </div>
                  <div className="text-neutral-400">
                    Valid/Invalid:{" "}
                    <span className="text-neutral-200">
                      {latestUpload.valid_count ?? 0}/{latestUpload.invalid_count ?? 0}
                    </span>
                  </div>

                  {canPerformActions && !bulkSendLocked && (
                    <ReplaceCsvButton orgId={orgId} batchId={batchId} />
                  )}
                </div>
              ) : (
                <div className="mt-2 text-neutral-400">No uploads yet</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {isClaimable ? (
          <>
            <div className="rounded-xl border border-neutral-800 p-4">
              <div className="text-sm text-neutral-400">Total amount</div>
              <div className="text-2xl font-semibold">{moneyGBP(batch.total_amount)}</div>
            </div>
            <div className="rounded-xl border border-neutral-800 p-4">
              <div className="text-sm text-neutral-400">Joined recipients</div>
              <div className="text-2xl font-semibold">{batch.recipient_count ?? 0}</div>
            </div>
            <div className="rounded-xl border border-neutral-800 p-4">
              <div className="text-sm text-neutral-400">Created</div>
              <div className="text-base font-medium">
                {batch.created_at ? new Date(batch.created_at).toLocaleString("en-GB") : "—"}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-xl border border-neutral-800 p-4">
              <div className="text-sm text-neutral-400">Total</div>
              <div className="text-2xl font-semibold">{moneyGBP(batch.total_amount)}</div>
            </div>
            <div className="rounded-xl border border-neutral-800 p-4">
              <div className="text-sm text-neutral-400">Recipients</div>
              <div className="text-2xl font-semibold">{batch.recipient_count ?? 0}</div>
            </div>
            <div className="rounded-xl border border-neutral-800 p-4">
              <div className="text-sm text-neutral-400">Created</div>
              <div className="text-base font-medium">
                {batch.created_at ? new Date(batch.created_at).toLocaleString("en-GB") : "—"}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Claimable batch dashboard */}
      {isClaimable && batch.batch_code && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <h2 className="text-sm font-medium text-neutral-400">{payoutKindLabel}</h2>
            {allocationsLocked && (
              <span className={clsx(
                "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium border",
                "border-emerald-700 text-emerald-200 bg-emerald-900/20"
              )}>
                Payouts locked
              </span>
            )}
            {claimableFull && (
              <span className={clsx(
                "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium border",
                "border-amber-700 text-amber-200 bg-amber-900/20"
              )}>
                Full
              </span>
            )}
          </div>
          {claimableFull && (
            <p className="text-sm text-amber-200/90 mb-4 rounded-lg border border-amber-800/50 bg-amber-950/20 px-3 py-2">
              This batch is no longer accepting claims.
            </p>
          )}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <ClaimableBatchShare batchCode={batch.batch_code} />
            {claimableSendEligible && (
              <SendClaimablePayoutsButton
                orgId={batch.org_id}
                batchId={batch.id}
                poolTotalGbp={Number(batch.total_amount ?? 0)}
              />
            )}
          </div>
          {claimablePayoutStats && (batch.status === "completed" || batch.status === "completed_with_errors") && (
            <div className={clsx(
              "mb-4 rounded-xl border p-4",
              batch.status === "completed"
                ? "border-emerald-800/50 bg-emerald-950/20"
                : "border-amber-800/40 bg-amber-950/20"
            )}>
              <h3 className="text-sm font-medium text-neutral-300 mb-2">Payout results</h3>
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <dt className="text-neutral-500">Paid recipients</dt>
                  <dd className="font-medium text-emerald-200">{claimablePayoutStats.paidCount}</dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Paid amount</dt>
                  <dd className="font-medium text-emerald-200">{moneyGBP(claimablePayoutStats.paidAmount)}</dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Failed recipients</dt>
                  <dd className="font-medium text-amber-200">{claimablePayoutStats.failedCount}</dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Failed amount</dt>
                  <dd className="font-medium text-amber-200">{moneyGBP(claimablePayoutStats.failedAmount)}</dd>
                </div>
              </dl>
            </div>
          )}
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-sm">
            <div>
              <dt className="text-neutral-500">Total amount</dt>
              <dd className="font-medium text-neutral-200">{moneyGBP(batch.total_amount)}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Joined recipients</dt>
              <dd className="font-medium text-neutral-200">{batch.recipient_count ?? 0}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Max recipients</dt>
              <dd className="font-medium text-neutral-200">{batch.max_claims ?? "—"}</dd>
            </div>
            {(() => {
              const amounts = claimableClaims.map((c) => c.claim_amount);
              const hasClaims = amounts.length > 0;
              const allEqual =
                amounts.length <= 1 ||
                amounts.every((a) => Math.round(a * 100) === Math.round(amounts[0] * 100));
              const minAmount = hasClaims ? Math.min(...amounts) : 0;
              const maxAmount = hasClaims ? Math.max(...amounts) : 0;
              if (hasClaims && !allEqual) {
                return (
                  <>
                    <div>
                      <dt className="text-neutral-500">Distribution</dt>
                      <dd className="font-medium text-neutral-200">Customised</dd>
                    </div>
                    <div>
                      <dt className="text-neutral-500">Payout range</dt>
                      <dd className="font-medium text-neutral-200">{moneyGBP(minAmount)} to {moneyGBP(maxAmount)}</dd>
                    </div>
                  </>
                );
              }
              const displayAmount = hasClaims && allEqual ? amounts[0] : batch.amount_per_claim;
              if (displayAmount != null && Number(displayAmount) > 0) {
                return (
                  <div>
                    <dt className="text-neutral-500">Amount per recipient</dt>
                    <dd className="font-medium text-neutral-200">{moneyGBP(displayAmount)}</dd>
                  </div>
                );
              }
              return null;
            })()}
            <div>
              <dt className="text-neutral-500">Expires</dt>
              <dd className="text-neutral-200">
                {formatExpiryDateTime(batch.expires_at)}
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
              <dt className="text-neutral-500">Total claimed so far</dt>
              <dd className="text-neutral-200">
                {hasSlots ? moneyGBP(totalClaimedFromSlots) : moneyGBP(totalClaimedFromClaims)}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Remaining pool</dt>
              <dd className="text-neutral-200">
                {moneyGBP(Math.max(0, Number(batch.total_amount ?? 0) - (hasSlots ? totalClaimedFromSlots : totalClaimedFromClaims)))}
              </dd>
            </div>
          </dl>
          {hasSlots && claimSlots.length > 0 && (
            <div className="mt-4 pt-4 border-t border-neutral-800">
              <h3 className="text-sm font-medium text-neutral-400 mb-2">Joined recipients / claim status</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-neutral-500">
                    <tr>
                      <th className="text-left py-1.5 pr-3">Slot</th>
                      <th className="text-left py-1.5 pr-3">Amount</th>
                      <th className="text-left py-1.5 pr-3">Status</th>
                      <th className="text-left py-1.5">Claimed by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {claimSlots.map((slot) => (
                      <tr key={slot.id} className="border-t border-neutral-800">
                        <td className="py-1.5 pr-3 text-neutral-300">{slot.slot_index + 1}</td>
                        <td className="py-1.5 pr-3">{moneyGBP(slot.amount)}</td>
                        <td className="py-1.5 pr-3">
                          <span className={slot.status === "claimed" ? "text-amber-300" : "text-emerald-300"}>
                            {slot.status === "claimed" ? "Claimed" : "Open"}
                          </span>
                        </td>
                        <td className="py-1.5 text-neutral-400 font-mono text-xs">
                          {slot.status === "claimed" && slot.claimed_by_user_id ? slot.claimed_by_user_id : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {(hasSlots ? claimSlots.length > 0 : typeof batch.max_claims === "number" && batch.max_claims > 0) && (
            <div className="mt-4 pt-4 border-t border-neutral-800">
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-neutral-400">Claim progress</span>
                <span className="text-neutral-200">
                  {hasSlots
                    ? `${claimSlots.filter((s) => s.status === "claimed").length} / ${claimSlots.length} claimed`
                    : `${batch.recipient_count ?? 0} / ${batch.max_claims} claimed`}
                </span>
              </div>
              <div className="h-2 rounded-full bg-neutral-800 overflow-hidden">
                <div
                  className={clsx(
                    "h-full rounded-full transition-all",
                    claimableFull ? "bg-amber-600" : "bg-emerald-600"
                  )}
                  style={{
                    width: hasSlots
                      ? `${Math.min(100, claimSlots.length > 0 ? Math.round((claimSlots.filter((s) => s.status === "claimed").length / claimSlots.length) * 100) : 0)}%`
                      : `${Math.min(100, Math.round(((batch.recipient_count ?? 0) / (batch.max_claims ?? 1)) * 100))}%`,
                  }}
                />
              </div>
            </div>
          )}
          <div className="mt-4 pt-4 border-t border-neutral-800">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h3 className="text-sm font-medium text-neutral-400">Customise payouts</h3>
              {allocationsLocked && canPerformActions && (
                <UnlockAllocationsButton orgId={batch.org_id} batchId={batch.id} />
              )}
            </div>
            <ClaimablePayoutEditor
              key={`${batchId}-${claimableClaims.map((c) => `${c.id}:${c.claim_amount}`).join("|")}`}
              claims={claimableClaims}
              totalPool={Number(batch.total_amount ?? 0)}
              currency={batch.currency ?? "GBP"}
              canEdit={canPerformActions && !allocationsLocked}
              orgId={orgId}
              batchId={batchId}
              saveAction={updateClaimAmounts}
            />
          </div>
          {!claimableSchemaReady && (
            <p className="mt-4 text-xs text-amber-600/90">Admin: {CLAIMABLE_SCHEMA_MESSAGE}</p>
          )}
        </div>
      )}

      {/* Summary cards (standard batches only) */}
      {!isClaimable && (
        <div
          className="mt-4"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            gap: "16px",
          }}
        >
          <div
            className="rounded-xl p-4"
            style={{
              border: "1px solid rgb(38, 38, 38)",
              background: "rgba(255,255,255,0.02)",
            }}
          >
            <div className="text-xs text-neutral-500 uppercase tracking-wide">Successful payouts</div>
            <div className="text-3xl font-semibold tracking-tight" style={{ color: "#34d399" }}>
              {successCount}
            </div>
          </div>

          <div
            className="rounded-xl p-4"
            style={{
              border: "1px solid rgb(38, 38, 38)",
              background: "rgba(255,255,255,0.02)",
            }}
          >
            <div className="text-xs text-neutral-500 uppercase tracking-wide">Failed payouts</div>
            <div className="text-3xl font-semibold tracking-tight" style={{ color: "#f87171" }}>
              {failedCountSummary}
            </div>
          </div>

          <div
            className="rounded-xl p-4"
            style={{
              border: "1px solid rgb(38, 38, 38)",
              background: "rgba(255,255,255,0.02)",
            }}
          >
            <div className="text-xs text-neutral-500 uppercase tracking-wide">Successful amount</div>
            <div className="text-3xl font-semibold tracking-tight" style={{ color: "#34d399" }}>
              {moneyGBP(successAmount)}
            </div>
          </div>

          <div
            className="rounded-xl p-4"
            style={{
              border: "1px solid rgb(38, 38, 38)",
              background: "rgba(255,255,255,0.02)",
            }}
          >
            <div className="text-xs text-neutral-500 uppercase tracking-wide">Failed amount</div>
            <div className="text-3xl font-semibold tracking-tight" style={{ color: "#f87171" }}>
              {moneyGBP(failedAmount)}
            </div>
          </div>

          <div className="rounded-xl border border-neutral-800 p-4">
            <div className="text-sm text-neutral-400">Success rate</div>
            <div
              className="text-2xl font-semibold"
              style={{
                color: successRate >= 90
                  ? "#34d399"
                  : successRate >= 70
                  ? "#fbbf24"
                  : "#f87171",
              }}
            >
              {successRate}%
            </div>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="rounded-xl border border-neutral-800 p-5">
        <div className="text-sm text-neutral-400 mb-4">{payoutKindLabel} Timeline</div>

        <div className="flex items-center justify-between">
          {(isClaimable ? claimableTimeline : timeline).map((step, i) => (
            <div key={i} className="flex flex-col items-center flex-1 relative">
              <div
                className="w-3 h-3 rounded-full"
                style={{
                  background: step.status === "done" ? "#34d399" : "rgb(64,64,64)",
                }}
              />

              <div className="text-xs text-neutral-400 mt-2 text-center">
                {step.label}
              </div>

              {step.time && (
                <div className="text-[10px] text-neutral-500 mt-1">
                  {new Date(step.time).toLocaleString("en-GB")}
                </div>
              )}

              {i < (isClaimable ? claimableTimeline : timeline).length - 1 && (
                <div
                  className="absolute top-1.5 left-1/2 w-full h-px"
                  style={{ background: "rgb(64,64,64)" }}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Run Summary (standard batches only, when there are failed payouts) */}
      {!isClaimable && batch.status === "completed_with_errors" && (
        <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-amber-200">{payoutKindLabel} completed with errors</h2>
              <p className="text-sm text-amber-200/80 mt-1">
                Some payouts failed. Successful: {successCount}. Failed: {failedCountSummary}.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center rounded-lg border border-amber-700/50 bg-amber-900/30 px-3 py-2 text-sm text-amber-200">
                {successCount} successful
              </span>
              <span className="inline-flex items-center rounded-lg border border-red-700/50 bg-red-900/30 px-3 py-2 text-sm text-red-200">
                {failedCountSummary} failed
              </span>
              <span className="inline-flex items-center rounded-lg border border-amber-700/50 bg-amber-900/30 px-3 py-2 text-sm text-amber-200">
                {moneyGBP(successAmount)}
              </span>
              <span className="inline-flex items-center rounded-lg border border-red-700/50 bg-red-900/30 px-3 py-2 text-sm text-red-200">
                {moneyGBP(failedAmount)}
              </span>
              <Link
                href={buildUrl(basePath, { tab: "items", status: "failed" })}
                className="rounded-lg border border-amber-700/50 px-3 py-2 text-sm text-amber-200 hover:bg-amber-900/30"
              >
                View failed
              </Link>
              {failedCountSummary > 0 && canPerformActions && (
                <RetryFailedButton orgId={orgId} batchId={batchId} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {!isClaimable && (
          <>
            <a
              href={tabLink("items")}
              className={clsx(
                "rounded-lg border px-3 py-2 text-sm",
                tab === "items" ? "border-neutral-600 bg-neutral-900/40" : "border-neutral-800 hover:border-neutral-700"
              )}
            >
              Items
            </a>
            <a
              href={tabLink("uploads")}
              className={clsx(
                "rounded-lg border px-3 py-2 text-sm",
                tab === "uploads" ? "border-neutral-600 bg-neutral-900/40" : "border-neutral-800 hover:border-neutral-700"
              )}
            >
              Uploads
            </a>
            <a
              href={tabLink("errors")}
              className={clsx(
                "rounded-lg border px-3 py-2 text-sm",
                tab === "errors" ? "border-neutral-600 bg-neutral-900/40" : "border-neutral-800 hover:border-neutral-700"
              )}
            >
              Errors
            </a>
          </>
        )}
        <a
          href={tabLink("activity")}
          className={clsx(
            "rounded-lg border px-3 py-2 text-sm",
            (isClaimable ? true : tab === "activity") ? "border-neutral-600 bg-neutral-900/40" : "border-neutral-800 hover:border-neutral-700"
          )}
        >
          Activity
        </a>
      </div>

      {/* ITEMS TAB (standard batches only) */}
      {!isClaimable && tab === "items" && (
        <div className="rounded-xl border border-neutral-800 overflow-hidden">
          <div className="p-4 border-b border-neutral-800 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Batch Items</h2>
              <div className="text-sm text-neutral-400">{items.length} shown (max 200)</div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <a
                href={buildUrl(basePath, { tab: "items", q: q || undefined, status: "all" })}
                className={clsx(
                  "rounded-lg border px-3 py-2 text-sm",
                  statusFilter === "all" ? "border-neutral-600 bg-neutral-900/40" : "border-neutral-800 hover:border-neutral-700"
                )}
              >
                All
              </a>
              <a
                href={buildUrl(basePath, { tab: "items", q: q || undefined, status: "success" })}
                className={clsx(
                  "rounded-lg border px-3 py-2 text-sm",
                  statusFilter === "success" ? "border-neutral-600 bg-neutral-900/40" : "border-neutral-800 hover:border-neutral-700"
                )}
              >
                Success
              </a>
              <a
                href={buildUrl(basePath, { tab: "items", q: q || undefined, status: "failed" })}
                className={clsx(
                  "rounded-lg border px-3 py-2 text-sm",
                  statusFilter === "failed" ? "border-neutral-600 bg-neutral-900/40" : "border-neutral-800 hover:border-neutral-700"
                )}
              >
                Failed
              </a>
              <form action={basePath} className="flex items-center gap-2">
              <input type="hidden" name="tab" value="items" />
              <input type="hidden" name="status" value={statusFilter} />
              <input
                name="q"
                defaultValue={q}
                placeholder="Search recipient, account, reference"
                className="w-full md:w-[360px] rounded-lg border border-neutral-800 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-600"
              />
              <button className="rounded-lg border border-neutral-800 px-3 py-2 text-sm hover:border-neutral-700">
                Search
              </button>
              {q ? (
                <a
                  href={tabLink("items").replace(/(\?|&)q=[^&]*/g, "").replace(/\?&/g, "?").replace(/\?$/g, "")}
                  className="rounded-lg border border-neutral-800 px-3 py-2 text-sm hover:border-neutral-700"
                >
                  Clear
                </a>
              ) : null}
              </form>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-900/50 text-neutral-300">
                <tr>
                  <th className="text-left p-3">Recipient</th>
                  <th className="text-left p-3">Account</th>
                  <th className="text-left p-3">Amount</th>
                  <th className="text-left p-3">Reference</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Failure</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-t border-neutral-800">
                    <td className="p-3">{it.recipient_name ?? "—"}</td>
                    <td className="p-3 font-mono text-xs">{it.account_identifier ?? "—"}</td>
                    <td className="p-3">{moneyGBP(it.amount)}</td>
                    <td className="p-3">{it.reference ?? "—"}</td>
                    <td className="p-3">
                      <span className={statusBadge(it.status)}>{it.status ?? "—"}</span>
                    </td>
                    <td className="p-3 text-red-300">{it.failure_reason ?? "—"}</td>
                  </tr>
                ))}

                {!items.length && (
                  <tr>
                    <td className="p-4 text-neutral-400" colSpan={6}>
                      No batch items found. If you only ran dryRun=true, it will not write items.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* UPLOADS TAB (standard batches only) */}
      {!isClaimable && tab === "uploads" && (
        <div className="rounded-xl border border-neutral-800 overflow-hidden">
          <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Uploads</h2>
              <div className="text-sm text-neutral-400">{uploads?.length ?? 0} shown (max 25)</div>
            </div>
          </div>

          <CsvUploadForm
            orgId={orgId}
            batchId={batchId}
            openPicker={sp.openPicker === "1" || sp.openPicker === "true"}
            disabled={bulkSendLocked}
          />

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-900/50 text-neutral-300">
                <tr>
                  <th className="text-left p-3">Created</th>
                  <th className="text-left p-3">File</th>
                  <th className="text-left p-3">Rows</th>
                  <th className="text-left p-3">Valid</th>
                  <th className="text-left p-3">Invalid</th>
                  <th className="text-left p-3">Hash</th>
                  <th className="text-left p-3">Errors</th>
                </tr>
              </thead>
              <tbody>
                {(uploads ?? []).map((u) => (
                  <tr key={u.id} className="border-t border-neutral-800">
                    <td className="p-3">
                      {u.created_at ? new Date(u.created_at).toLocaleString("en-GB") : "—"}
                    </td>
                    <td className="p-3 font-medium">{u.original_filename ?? "—"}</td>
                    <td className="p-3">{u.row_count ?? 0}</td>
                    <td className="p-3">{u.valid_count ?? 0}</td>
                    <td className="p-3">{u.invalid_count ?? 0}</td>
                    <td className="p-3 font-mono text-xs max-w-[420px] truncate" title={u.file_hash ?? ""}>
                      {u.file_hash ?? "—"}
                    </td>
                    <td className="p-3">
                      <a
                        className="text-sm underline text-neutral-200 hover:text-white"
                        href={buildUrl(basePath, { tab: "errors", uploadId: u.id })}
                      >
                        View errors
                      </a>
                    </td>
                  </tr>
                ))}

                {!uploads?.length && (
                  <tr>
                    <td className="p-4 text-neutral-400" colSpan={7}>
                      No uploads yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ERRORS TAB (standard batches only) */}
      {!isClaimable && tab === "errors" && (
        <div className="rounded-xl border border-neutral-800 overflow-hidden">
          <div className="p-4 border-b border-neutral-800 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Upload Errors</h2>
              <div className="text-sm text-neutral-400">
                {selectedUploadId ? (
                  <>
                    Selected upload: <span className="font-mono text-neutral-300">{selectedUploadId}</span>
                  </>
                ) : (
                  "No upload selected"
                )}
              </div>
            </div>

            <form action={basePath} className="flex items-center gap-2">
              <input type="hidden" name="tab" value="errors" />
              <select
                name="uploadId"
                defaultValue={selectedUploadId || ""}
                className="w-full md:w-[520px] rounded-lg border border-neutral-800 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-600"
              >
                <option value="">Select an upload</option>
                {(uploads ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.created_at ? new Date(u.created_at).toLocaleString("en-GB") : "—"} · {u.original_filename ?? "—"}
                    {u.invalid_count ? ` · invalid:${u.invalid_count}` : ""}
                  </option>
                ))}
              </select>
              <button className="rounded-lg border border-neutral-800 px-3 py-2 text-sm hover:border-neutral-700">
                Load
              </button>
            </form>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-900/50 text-neutral-300">
                <tr>
                  <th className="text-left p-3">Row</th>
                  <th className="text-left p-3">Field</th>
                  <th className="text-left p-3">Message</th>
                </tr>
              </thead>
              <tbody>
                {(uploadErrors ?? []).map((e) => (
                  <tr key={e.id} className="border-t border-neutral-800">
                    <td className="p-3">{e.row_number ?? "—"}</td>
                    <td className="p-3 font-mono text-xs">{e.field ?? "—"}</td>
                    <td className="p-3 text-red-300">{e.message ?? "—"}</td>
                  </tr>
                ))}

                {!selectedUploadId && (
                  <tr>
                    <td className="p-4 text-neutral-400" colSpan={3}>
                      Pick an upload to view its validation errors.
                    </td>
                  </tr>
                )}

                {selectedUploadId && !uploadErrors?.length && (
                  <tr>
                    <td className="p-4 text-neutral-400" colSpan={3}>
                      No errors for this upload.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ACTIVITY TAB */}
      {(tab === "activity" || isClaimable) && (
        <div className="rounded-xl border border-neutral-800 overflow-hidden">
          <div className="p-4 border-b border-neutral-800">
            <h2 className="text-lg font-semibold">Activity</h2>
            <div className="text-sm text-neutral-400">Show latest 100 events</div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-900/50 text-neutral-300">
                <tr>
                  <th className="text-left p-3">Time</th>
                  <th className="text-left p-3">Event</th>
                  <th className="text-left p-3">Actor</th>
                  <th className="text-left p-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {auditEvents.map((e) => (
                  <tr key={e.id} className="border-t border-neutral-800">
                    <td className="p-3 text-neutral-300">
                      {e.created_at ? new Date(e.created_at).toLocaleString("en-GB") : "—"}
                    </td>
                    <td className="p-3 font-medium">{e.event_type}</td>
                    <td className="p-3">{e.actor_user_id ?? "System"}</td>
                    <td className="p-3 font-mono text-xs text-neutral-400 max-w-md truncate" title={JSON.stringify(e.event_data)}>
                      {JSON.stringify(e.event_data)}
                    </td>
                  </tr>
                ))}

                {!auditEvents.length && (
                  <tr>
                    <td className="p-4 text-neutral-400" colSpan={4}>
                      No activity events for this batch.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}