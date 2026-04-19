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
import { FundBatchFromWalletButton } from "./FundBatchFromWalletButton";
import { UnlockAllocationsButton } from "./UnlockAllocationsButton";
import { DownloadResultsButton } from "./DownloadResultsButton";
import { RetryFailedButton } from "./RetryFailedButton";
import { ReplaceCsvButton } from "./ReplaceCsvButton";
import { RunBatchButton } from "./RunBatchButton";
import { UploadCsvButton } from "./UploadCsvButton";
import { ImpactQueryToast } from "@/components/impact/ImpactQueryToast";
import { isBatchStatusFundableFromWallet } from "@/lib/batchClaimableFunding";
import { batchStatusDisplayLabel } from "@/lib/batchStatusUi";
import { fetchClerkRecipientProfiles } from "@/lib/clerkUserDisplay";
import { formatRecipientLifecycleLabel, resolveRecipientDisplay } from "@/lib/recipientDisplay";
import { getPublicSiteUrl } from "@/lib/publicSiteUrl";
import { FintechCard } from "@/components/fintech";
import { BatchActivityExpandable } from "@/components/batches/BatchActivityExpandable";

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

function recipientLifecyclePill(status?: string | null) {
  const s = (status ?? "").toLowerCase();
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border";
  if (s === "claimed" || s === "paid_out") {
    return clsx(base, "border-emerald-800/60 text-emerald-200/90 bg-emerald-950/25");
  }
  if (s === "claimable" || s === "pending") {
    return clsx(base, "border-amber-800/50 text-amber-200/90 bg-amber-950/20");
  }
  if (s === "failed") {
    return clsx(base, "border-red-800/50 text-red-200/90 bg-red-950/20");
  }
  return clsx(base, "border-neutral-700 text-neutral-400 bg-neutral-900/20");
}

function statusBadge(status?: string | null) {
  const s = (status ?? "unknown").toLowerCase();
  const base = "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium border";

  if (s === "draft") return clsx(base, "border-neutral-700 text-neutral-200 bg-neutral-900/30");
  if (s === "ready") return clsx(base, "border-blue-700 text-blue-200 bg-blue-900/20");
  if (s === "processing") return clsx(base, "border-yellow-700 text-yellow-200 bg-yellow-900/20");
  if (s === "funded") return clsx(base, "border-sky-700 text-sky-200 bg-sky-900/20");
  if (s === "claiming") return clsx(base, "border-violet-700 text-violet-200 bg-violet-900/20");
  if (s === "completed") return clsx(base, "border-emerald-700 text-emerald-200 bg-emerald-900/20");
  if (s === "completed_with_errors") return clsx(base, "border-amber-700 text-amber-200 bg-amber-900/20");
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

  // 1) Batch, base columns only so page loads when extended claimable columns are missing
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
  const claimableFull = hasSlots
    ? openSlotsCount === 0
    : typeof batch.max_claims === "number" &&
      batch.max_claims > 0 &&
      (batch.recipient_count ?? 0) >= batch.max_claims;

  let claimableClaims: Array<{
    id: string;
    user_id: string;
    polypayd_username: string | null;
    recipient_display_name: string | null;
    recipient_email: string | null;
    claim_amount: number;
    payout_status?: string | null;
    paid_at?: string | null;
    failure_reason?: string | null;
    claim_token?: string | null;
    recipient_lifecycle_status?: string | null;
    display_primary: string;
    display_subtext?: string | undefined;
  }> = [];
  let recipientProfiles = new Map<string, { displayName: string; primaryEmail: string | null }>();
  if (isClaimable) {
    const baseSelect = "id, user_id, polypayd_username, claim_amount";
    const extendedSelect =
      "id, user_id, polypayd_username, claim_amount, payout_status, paid_at, failure_reason, claim_token, recipient_lifecycle_status";
    const extendedSelectWithRecipient = `${extendedSelect}, recipient_display_name, recipient_email`;
    let claimsRows: Array<Record<string, unknown>> | null = null;

    const claimsQuery = (sel: string) =>
      supabase.from("batch_claims").select(sel).eq("batch_id", batchId).order("created_at", { ascending: true });

    const withRecipientRes = await claimsQuery(extendedSelectWithRecipient);
    if (!withRecipientRes.error && withRecipientRes.data) {
      claimsRows = withRecipientRes.data as unknown as Array<Record<string, unknown>>;
    } else {
      const extendedRes = await claimsQuery(extendedSelect);
      if (!extendedRes.error && extendedRes.data) {
        claimsRows = extendedRes.data as unknown as Array<Record<string, unknown>>;
      } else {
        const baseRes = await claimsQuery(baseSelect);
        if (!baseRes.error && baseRes.data) {
          claimsRows = baseRes.data as unknown as Array<Record<string, unknown>>;
        }
      }
    }
    if (claimsRows) {
      const recipientClerkIds = [
        ...new Set([
          ...claimsRows.map((c) => String(c.user_id ?? "")),
          ...claimSlots.flatMap((s) => (s.claimed_by_user_id ? [s.claimed_by_user_id] : [])),
        ]),
      ];
      recipientProfiles =
        recipientClerkIds.length > 0 ? await fetchClerkRecipientProfiles(recipientClerkIds) : new Map();

      claimableClaims = claimsRows.map((c) => {
        const user_id = String(c.user_id ?? "");
        const base = {
          id: String(c.id ?? ""),
          user_id,
          polypayd_username: (c.polypayd_username as string | null) ?? null,
          recipient_display_name: (c.recipient_display_name as string | null) ?? null,
          recipient_email: (c.recipient_email as string | null) ?? null,
          claim_amount: Number(c.claim_amount ?? 0),
          payout_status: (c.payout_status as string | null) ?? null,
          paid_at: (c.paid_at as string | null) ?? null,
          failure_reason: (c.failure_reason as string | null) ?? null,
          claim_token: (c.claim_token as string | null) ?? null,
          recipient_lifecycle_status: (c.recipient_lifecycle_status as string | null) ?? null,
        };
        const r = resolveRecipientDisplay({
          clerkUserId: user_id,
          polypaydUsername: base.polypayd_username,
          recipientDisplayName: base.recipient_display_name,
          recipientEmail: base.recipient_email,
          clerkProfile: recipientProfiles.get(user_id),
        });
        return { ...base, display_primary: r.primary, display_subtext: r.subtext };
      });
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
        paidCount: claimableClaims.filter(
          (c) =>
            c.payout_status === "paid" ||
            c.recipient_lifecycle_status === "claimed" ||
            c.recipient_lifecycle_status === "paid_out"
        ).length,
        failedCount: claimableClaims.filter((c) => c.payout_status === "failed").length,
        paidAmount: claimableClaims
          .filter(
            (c) =>
              c.payout_status === "paid" ||
              c.recipient_lifecycle_status === "claimed" ||
              c.recipient_lifecycle_status === "paid_out"
          )
          .reduce((s, c) => s + c.claim_amount, 0),
        failedAmount: claimableClaims
          .filter((c) => c.payout_status === "failed")
          .reduce((s, c) => s + c.claim_amount, 0),
      }
    : null;

  const batchStatus = String(batch.status ?? "").toLowerCase();
  const claimableExpired = Boolean(
    batch.expires_at && new Date(batch.expires_at).getTime() < Date.now()
  );
  const bulkSendLocked = !isClaimable && (batchStatus === "completed" || batchStatus === "completed_with_errors");
  const claimPoolTotal = Number(batch.total_amount ?? 0);
  const claimsAllocSum = isClaimable
    ? claimableClaims.reduce((s, c) => s + c.claim_amount, 0)
    : 0;
  const fundBatchClaimsMatchPool =
    isClaimable &&
    claimableClaims.length >= 1 &&
    Math.abs(claimsAllocSum - claimPoolTotal) < 0.01;

  const hasClaimableMissingToken = claimableClaims.some(
    (c) =>
      c.recipient_lifecycle_status === "claimable" &&
      String(c.claim_token ?? "").trim() === ""
  );

  /** After fund: every claimable row has a token; joined/credited rows legitimately have no token. */
  const claimLinksReserveConsistent =
    claimableClaims.length > 0 &&
    !hasClaimableMissingToken &&
    claimableClaims.every((c) => {
      if (c.recipient_lifecycle_status === "claimable") {
        return String(c.claim_token ?? "").trim() !== "";
      }
      return true;
    });

  const batchReserveComplete =
    (batchStatus === "funded" ||
      batchStatus === "claiming" ||
      batchStatus === "completed") &&
    claimLinksReserveConsistent;

  const batchReserveIncomplete =
    (batchStatus === "funded" || batchStatus === "claiming") && !claimLinksReserveConsistent;

  const claimFlowTerminal =
    batchStatus === "failed" ||
    batchStatus === "completed" ||
    batchStatus === "completed_with_errors";

  const showFundBatchFromWalletButton =
    isClaimable &&
    claimableSchemaReady &&
    allocationsLocked &&
    canPerformActions &&
    !batchReserveComplete &&
    !batchReserveIncomplete &&
    !claimFlowTerminal &&
    isBatchStatusFundableFromWallet(batchStatus);

  const canFundBatchFromWallet =
    showFundBatchFromWalletButton && fundBatchClaimsMatchPool && !claimableExpired;

  let fundBatchBlockedReason: string | null = null;
  if (showFundBatchFromWalletButton && !canFundBatchFromWallet) {
    if (claimableExpired) {
      fundBatchBlockedReason =
        "This claim link has expired, so this batch can't be funded.";
    } else if (!fundBatchClaimsMatchPool) {
      fundBatchBlockedReason =
        "Recipients and amounts must match the pool total before you can fund.";
    } else {
      fundBatchBlockedReason = "This batch can't be funded right now.";
    }
  }

  let claimableFundStatusMessage: string | null = null;
  if (isClaimable && claimableSchemaReady && allocationsLocked) {
    if (batchReserveIncomplete) {
      claimableFundStatusMessage =
        "This batch did not fully finish reserving the pool and enabling claim links. Do not ask recipients to claim yet. Contact support with this batch ID.";
    } else if (batchStatus === "completed" || batchStatus === "completed_with_errors") {
      claimableFundStatusMessage =
        "Wallet moves for this batch are complete. Results are shown below.";
    } else if (batchStatus === "failed") {
      claimableFundStatusMessage =
        "This batch is in a failed state. You cannot fund it from your wallet.";
    } else if (batchReserveComplete) {
      const hasOutstandingPrivateLinks = claimableClaims.some(
        (c) =>
          c.recipient_lifecycle_status === "claimable" &&
          String(c.claim_token ?? "").trim() !== ""
      );
      claimableFundStatusMessage = hasOutstandingPrivateLinks
        ? "Recipients can now claim using their personal links."
        : "Joined recipients were credited to their PolyPayd wallets. There are no open private claim links.";
    }
  }
  // Fund-from-wallet replaces legacy one-shot Send for new claimable batches (per-recipient claim links after fund).

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

  let auditActorProfiles = new Map<string, { displayName: string; primaryEmail: string | null }>();
  if (auditEvents.length > 0) {
    const actorIds = [
      ...new Set(
        auditEvents.map((e) => e.actor_user_id).filter((id): id is string => Boolean(id && String(id).trim()))
      ),
    ];
    if (actorIds.length > 0) {
      auditActorProfiles = await fetchClerkRecipientProfiles(actorIds);
    }
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
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-[#F9FAFB] truncate">
              {batch.name ?? "Untitled batch"}
            </h1>
            <span className={statusBadge(batch.status)} title={batch.status ?? undefined}>
              {batchStatusDisplayLabel(batch.status)}
            </span>
          </div>
          {isClaimable && batch.created_at ? (
            <p className="mt-2 text-sm text-[#6B7280]">
              Created{" "}
              {new Date(batch.created_at).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          ) : null}

          <details className="mt-3 text-xs text-neutral-600">
            <summary className="cursor-pointer text-neutral-500 hover:text-neutral-400 select-none">
              Technical details
            </summary>
            <div className="mt-2 space-y-1 pl-1 font-mono text-[11px] text-neutral-500 break-all">
              <div>
                <span className="text-neutral-600">Batch ID</span> {batch.id}
              </div>
              <div>
                <span className="text-neutral-600">Org ID</span> {batch.org_id}
              </div>
            </div>
          </details>
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
                  <div className="font-medium text-neutral-200">{latestUpload.original_filename ?? "-"}</div>
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

      {/* Stats, bulk send only */}
      {!isClaimable ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
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
              {batch.created_at ? new Date(batch.created_at).toLocaleString("en-GB") : "-"}
            </div>
          </div>
        </div>
      ) : null}

      {isClaimable ? (
        <FintechCard elevated interactive={false} className="mt-6 p-5 sm:p-6">
          <p className="text-xs font-medium text-[#6B7280]">Payout pool</p>
          <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-[#F9FAFB] sm:text-4xl">
            {moneyGBP(batch.total_amount)}
          </p>
          <p className="mt-2 text-xs text-[#6B7280]">Total in this Claim Link pool</p>
          <div className="mt-6 space-y-4 border-t border-white/[0.05] pt-6 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[#6B7280]">Joined</span>
              <span className="font-semibold tabular-nums text-[#F9FAFB]">
                {hasSlots
                  ? `${claimSlots.filter((s) => s.status === "claimed").length} of ${claimSlots.length} slots`
                  : `${batch.recipient_count ?? 0}${batch.max_claims != null ? ` · max ${batch.max_claims}` : ""}`}
              </span>
            </div>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <span className="text-[#6B7280]">Expires</span>
              <span className="max-w-[min(100%,18rem)] text-right">
                <span className="font-medium text-[#F9FAFB]">{formatExpiryDateTime(batch.expires_at)}</span>
                {batch.expires_at ? (
                  <span className="mt-1 block text-xs font-normal text-[#6B7280]">
                    {formatExpiryTimeLeft(batch.expires_at)}
                  </span>
                ) : null}
              </span>
            </div>
          </div>
        </FintechCard>
      ) : null}

      {/* Claimable: access + campaign (split cards) */}
      {isClaimable && batch.batch_code && (
        <>
          <FintechCard interactive={false} className="mt-5 p-5 sm:p-6">
            <h2 className="text-base font-semibold tracking-tight text-[#F9FAFB]">Claim access</h2>
            <p className="mt-1 text-xs text-[#6B7280]">{payoutKindLabel}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {allocationsLocked && (
                <span className="inline-flex items-center rounded-full bg-[#22C55E]/12 px-2.5 py-0.5 text-xs font-medium text-[#86EFAC]">
                  Payouts locked
                </span>
              )}
              {claimableFull && (
                <span className="inline-flex items-center rounded-full bg-[#F59E0B]/12 px-2.5 py-0.5 text-xs font-medium text-[#FCD34D]">
                  Full
                </span>
              )}
            </div>
            {claimableFull && (
              <p className="mt-4 text-sm text-[#FCD34D]/90">This batch is no longer accepting claims.</p>
            )}
            <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center">
              {showFundBatchFromWalletButton && (
                <FundBatchFromWalletButton
                  orgId={batch.org_id}
                  batchId={batch.id}
                  poolTotalGbp={Number(batch.total_amount ?? 0)}
                  fundEnabled={canFundBatchFromWallet}
                  fundBlockedReason={fundBatchBlockedReason}
                />
              )}
              {claimableFundStatusMessage && (
                <p className="text-sm leading-relaxed text-[#86EFAC]/90 sm:max-w-md">{claimableFundStatusMessage}</p>
              )}
            </div>
            <div className="mt-8 border-t border-white/[0.05] pt-8">
              <ClaimableBatchShare embedded storedBatchCode={batch.batch_code} publicSiteUrl={getPublicSiteUrl()} />
            </div>
          </FintechCard>

          <FintechCard interactive={false} className="mt-5 p-5 sm:p-6">
          {claimablePayoutStats && (batch.status === "completed" || batch.status === "completed_with_errors") && (
            <div className="mb-8 space-y-4 border-b border-white/[0.05] pb-8">
              <div>
                <h3 className="text-sm font-semibold text-[#F9FAFB]">Wallet credit results</h3>
                <p className="mt-1 text-xs leading-relaxed text-[#6B7280]">
                  Recipients who completed the claim flow and amounts credited (or attempted).
                </p>
              </div>
              <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-[#6B7280]">Credited (recipients)</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-[#86EFAC]">{claimablePayoutStats.paidCount}</p>
                </div>
                <div>
                  <p className="text-xs text-[#6B7280]">Credited (total)</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-[#86EFAC]">
                    {moneyGBP(claimablePayoutStats.paidAmount)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#6B7280]">Did not complete</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-[#FCD34D]">{claimablePayoutStats.failedCount}</p>
                </div>
                <div>
                  <p className="text-xs text-[#6B7280]">At risk (amount)</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-[#FCD34D]">
                    {moneyGBP(claimablePayoutStats.failedAmount)}
                  </p>
                </div>
              </div>
              {claimablePayoutStats.failedCount === 0 && (
                <p className="text-xs text-[#6B7280]">No failed wallet credits for this batch.</p>
              )}
            </div>
          )}
          <div className="mb-6">
            <h3 className="text-base font-semibold tracking-tight text-[#F9FAFB]">Campaign details</h3>
            <p className="mt-1 text-xs text-[#6B7280]">Pool, limits, timing, and allocation.</p>
          </div>
          <dl className="divide-y divide-white/[0.05] text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2 py-3 first:pt-0">
              <dt className="text-xs font-medium text-[#6B7280]">Pool total</dt>
              <dd className="font-semibold tabular-nums text-[#F9FAFB]">{moneyGBP(batch.total_amount)}</dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 py-3">
              <dt className="text-xs font-medium text-[#6B7280]">Joined recipients</dt>
              <dd className="font-semibold tabular-nums text-[#F9FAFB]">{batch.recipient_count ?? 0}</dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 py-3">
              <dt className="text-xs font-medium text-[#6B7280]">Recipient cap</dt>
              <dd className="font-semibold tabular-nums text-[#F9FAFB]">{batch.max_claims ?? "-"}</dd>
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
                    <div className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                      <dt className="text-xs font-medium text-[#6B7280]">Allocation</dt>
                      <dd className="font-semibold text-[#F9FAFB]">Custom per recipient</dd>
                    </div>
                    <div className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                      <dt className="text-xs font-medium text-[#6B7280]">Per-recipient range</dt>
                      <dd className="font-semibold tabular-nums text-[#F9FAFB]">
                        {moneyGBP(minAmount)} – {moneyGBP(maxAmount)}
                      </dd>
                    </div>
                  </>
                );
              }
              const displayAmount = hasClaims && allEqual ? amounts[0] : batch.amount_per_claim;
              if (displayAmount != null && Number(displayAmount) > 0) {
                return (
                  <div className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                    <dt className="text-xs font-medium text-[#6B7280]">Default per recipient</dt>
                    <dd className="font-semibold tabular-nums text-[#F9FAFB]">{moneyGBP(displayAmount)}</dd>
                  </div>
                );
              }
              return null;
            })()}
            <div className="flex flex-wrap items-start justify-between gap-2 py-3">
              <dt className="text-xs font-medium text-[#6B7280]">Link expires</dt>
              <dd className="max-w-[min(100%,16rem)] text-right">
                <span className="font-medium text-[#F9FAFB]">{formatExpiryDateTime(batch.expires_at)}</span>
                {batch.expires_at ? (
                  <>
                    <span className="mt-1 block text-xs text-[#6B7280]">Your local time</span>
                    <span className="mt-0.5 block text-xs text-[#9CA3AF]">{formatExpiryTimeLeft(batch.expires_at)}</span>
                  </>
                ) : null}
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 py-3">
              <dt className="text-xs font-medium text-[#6B7280]">Allocated so far</dt>
              <dd className="font-semibold tabular-nums text-[#F9FAFB]">
                {hasSlots ? moneyGBP(totalClaimedFromSlots) : moneyGBP(totalClaimedFromClaims)}
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 py-3">
              <dt className="text-xs font-medium text-[#6B7280]">Unallocated pool</dt>
              <dd className="font-semibold tabular-nums text-[#F9FAFB]">
                {moneyGBP(Math.max(0, Number(batch.total_amount ?? 0) - (hasSlots ? totalClaimedFromSlots : totalClaimedFromClaims)))}
              </dd>
            </div>
          </dl>
          {hasSlots && claimSlots.length > 0 && (
            <div className="mt-8 border-t border-white/[0.05] pt-8">
              <h3 className="text-sm font-semibold text-[#F9FAFB]">Slots</h3>
              <p className="mt-1 text-xs text-[#6B7280]">Fixed places in this batch and who claimed each one.</p>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-[#6B7280]">
                        #
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-[#6B7280]">
                        Amount
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-[#6B7280]">
                        Status
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-[#6B7280]">
                        Recipient
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {claimSlots.map((slot) => {
                      const claimedBy =
                        slot.status === "claimed" && slot.claimed_by_user_id
                          ? (() => {
                              const match = claimableClaims.find((c) => c.user_id === slot.claimed_by_user_id);
                              if (match) {
                                return { primary: match.display_primary, subtext: match.display_subtext };
                              }
                              return resolveRecipientDisplay({
                                clerkUserId: slot.claimed_by_user_id,
                                polypaydUsername: null,
                                recipientDisplayName: null,
                                recipientEmail: null,
                                clerkProfile: recipientProfiles.get(slot.claimed_by_user_id),
                              });
                            })()
                          : null;
                      return (
                        <tr key={slot.id} className="transition-colors hover:bg-white/[0.02]">
                          <td className="px-3 py-3 text-[#6B7280] tabular-nums">{slot.slot_index + 1}</td>
                          <td className="px-3 py-3 font-medium tabular-nums text-[#F9FAFB]">{moneyGBP(slot.amount)}</td>
                          <td className="px-3 py-3">
                            <span
                              className={clsx(
                                "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                                slot.status === "claimed"
                                  ? "bg-[#F59E0B]/12 text-[#FCD34D]"
                                  : "bg-[#22C55E]/12 text-[#86EFAC]"
                              )}
                            >
                              {slot.status === "claimed" ? "Claimed" : "Open"}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-sm text-[#E5E7EB]">
                            {claimedBy ? (
                              <div>
                                <div>{claimedBy.primary}</div>
                                {claimedBy.subtext ? (
                                  <div className="mt-0.5 text-xs text-[#6B7280]">{claimedBy.subtext}</div>
                                ) : null}
                              </div>
                            ) : (
                              "-"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {(hasSlots ? claimSlots.length > 0 : typeof batch.max_claims === "number" && batch.max_claims > 0) && (
            <div className="mt-8 border-t border-white/[0.05] pt-8">
              <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                <span className="text-sm font-semibold text-[#F9FAFB]">Fill rate</span>
                <span className="text-sm tabular-nums text-[#9CA3AF]">
                  {hasSlots
                    ? `${claimSlots.filter((s) => s.status === "claimed").length} of ${claimSlots.length} slots claimed`
                    : `${batch.recipient_count ?? 0} of ${batch.max_claims} recipients joined`}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#0B0F14]">
                <div
                  className={clsx(
                    "h-full rounded-full transition-all duration-500 ease-out",
                    claimableFull ? "bg-gradient-to-r from-amber-600 to-amber-500" : "bg-gradient-to-r from-emerald-700 to-emerald-500"
                  )}
                  style={{
                    width: hasSlots
                      ? `${Math.min(100, claimSlots.length > 0 ? Math.round((claimSlots.filter((s) => s.status === "claimed").length / claimSlots.length) * 100) : 0)}%`
                      : `${Math.min(100, Math.round(((batch.recipient_count ?? 0) / (batch.max_claims ?? 1)) * 100))}%`,
                  }}
                />
              </div>
              {claimableFull && (
                <p className="mt-2 text-xs text-[#9CA3AF]">This batch has reached its limit or expiry.</p>
              )}
            </div>
          )}
          <div className="mt-8 border-t border-white/[0.05] pt-8">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[#F9FAFB]">Per-recipient amounts</h3>
                <p className="mt-1 max-w-md text-xs leading-relaxed text-[#6B7280]">
                  Adjust allocations before locking. Totals must match the pool.
                </p>
              </div>
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
          {(batchStatus === "funded" || batchStatus === "claiming") &&
            canPerformActions &&
            claimableClaims.some(
              (c) =>
                c.recipient_lifecycle_status === "claimable" &&
                String(c.claim_token ?? "").trim() !== ""
            ) && (
            <div className="mt-8 border-t border-white/[0.05] pt-8">
              <h3 className="text-sm font-semibold text-[#F9FAFB]">Private claim links</h3>
              <p className="mb-4 mt-1 max-w-2xl text-xs leading-relaxed text-[#6B7280]">
                Send each link only to the matching person. They must use the same sign-in they used to join. Funds go to
                their PolyPayd wallet (bank withdrawal is separate). Recipients who already joined before you sent the
                payout were credited automatically and do not need a link.
              </p>
              <div className="overflow-x-auto text-sm">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-left">
                      <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-[#6B7280]">
                        Recipient
                      </th>
                      <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-[#6B7280]">
                        Amount
                      </th>
                      <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-[#6B7280]">
                        Wallet
                      </th>
                      <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-[#6B7280]">Link</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {claimableClaims
                      .filter(
                        (c) =>
                          c.recipient_lifecycle_status === "claimable" &&
                          String(c.claim_token ?? "").trim() !== ""
                      )
                      .map((c) => (
                      <tr key={c.id} className="transition-colors hover:bg-white/[0.02]">
                        <td className="min-w-[140px] px-3 py-3 align-top">
                          <div className="text-sm font-medium text-[#F9FAFB]">{c.display_primary}</div>
                          {c.display_subtext ? (
                            <div className="mt-1 text-xs text-[#6B7280]">{c.display_subtext}</div>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 align-top font-medium tabular-nums text-[#F9FAFB]">
                          {moneyGBP(c.claim_amount)}
                        </td>
                        <td className="px-3 py-3 align-top">
                          <span className={recipientLifecyclePill(c.recipient_lifecycle_status)}>
                            {formatRecipientLifecycleLabel(c.recipient_lifecycle_status)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 align-top">
                          <Link
                            href={`/app/claim-payout/${c.claim_token}`}
                            className="text-sm font-medium text-[#3B82F6] transition-colors hover:text-[#60A5FA]"
                          >
                            Open claim page
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {!claimableSchemaReady && (
            <p className="mt-6 text-xs text-[#F59E0B]/90">Admin: {CLAIMABLE_SCHEMA_MESSAGE}</p>
          )}
          </FintechCard>
        </>
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
      <FintechCard interactive={false} className="p-5 sm:p-6">
        <div className="mb-5 text-sm font-medium text-[#6B7280]">{payoutKindLabel} timeline</div>

        <div className="flex items-center justify-between">
          {(isClaimable ? claimableTimeline : timeline).map((step, i) => (
            <div key={i} className="relative flex flex-1 flex-col items-center">
              <div
                className={`h-2.5 w-2.5 rounded-full ${step.status === "done" ? "bg-[#22C55E]" : "bg-[#374151]"}`}
              />

              <div className="mt-2 text-center text-[11px] text-[#9CA3AF]">{step.label}</div>

              {step.time && (
                <div className="mt-1 text-center text-[10px] text-[#6B7280]">
                  {new Date(step.time).toLocaleString("en-GB")}
                </div>
              )}

              {i < (isClaimable ? claimableTimeline : timeline).length - 1 && (
                <div className="absolute left-1/2 top-[5px] h-px w-full bg-white/[0.08]" />
              )}
            </div>
          ))}
        </div>
      </FintechCard>

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
                    <td className="p-3">{it.recipient_name ?? "-"}</td>
                    <td className="p-3 font-mono text-xs">{it.account_identifier ?? "-"}</td>
                    <td className="p-3">{moneyGBP(it.amount)}</td>
                    <td className="p-3">{it.reference ?? "-"}</td>
                    <td className="p-3">
                      <span className={statusBadge(it.status)}>{it.status ?? "-"}</span>
                    </td>
                    <td className="p-3 text-red-300">{it.failure_reason ?? "-"}</td>
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
                      {u.created_at ? new Date(u.created_at).toLocaleString("en-GB") : "-"}
                    </td>
                    <td className="p-3 font-medium">{u.original_filename ?? "-"}</td>
                    <td className="p-3">{u.row_count ?? 0}</td>
                    <td className="p-3">{u.valid_count ?? 0}</td>
                    <td className="p-3">{u.invalid_count ?? 0}</td>
                    <td className="p-3 font-mono text-xs max-w-[420px] truncate" title={u.file_hash ?? ""}>
                      {u.file_hash ?? "-"}
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
                    {u.created_at ? new Date(u.created_at).toLocaleString("en-GB") : "-"} · {u.original_filename ?? "-"}
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
                    <td className="p-3">{e.row_number ?? "-"}</td>
                    <td className="p-3 font-mono text-xs">{e.field ?? "-"}</td>
                    <td className="p-3 text-red-300">{e.message ?? "-"}</td>
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
        <FintechCard interactive={false} className="overflow-hidden p-0">
          <div className="border-b border-white/[0.05] px-5 py-5 sm:px-6">
            <h2 className="text-base font-semibold tracking-tight text-[#F9FAFB]">Activity</h2>
            <p className="mt-1 text-sm leading-relaxed text-[#6B7280]">
              Latest updates for this batch (up to 100). Technical payloads stay under each row.
            </p>
          </div>

          <BatchActivityExpandable
            events={auditEvents}
            viewerUserId={userId}
            actorProfiles={Object.fromEntries(auditActorProfiles)}
          />
        </FintechCard>
      )}
    </div>
  );
}