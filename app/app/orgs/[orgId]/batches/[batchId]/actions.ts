"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { impactAmountFromPlatformFee } from "@/lib/impact";

function randomFailureReason(): string {
  const reasons = [
    "BANK_REJECTED",
    "ACCOUNT_INVALID",
    "INSUFFICIENT_FUNDS",
    "NETWORK_ERROR",
  ];
  return reasons[Math.floor(Math.random() * reasons.length)];
}

export async function approveBatch(batchId: string, orgId: string) {
  const supabase = supabaseAdmin();

  // Bulk Send approval guard: require at least one valid recipient/item and total > 0.
  const { data: batch, error: batchErr } = await supabase
    .from("batches")
    .select("id, org_id, batch_type, status, total_amount, recipient_count")
    .eq("id", batchId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (batchErr || !batch) {
    const msg = batchErr?.message ?? "Batch not found";
    redirect(`/app/batches/${batchId}?error=${encodeURIComponent(msg)}`);
    return;
  }

  if (batch.batch_type !== "standard") {
    redirect(`/app/batches/${batchId}?error=${encodeURIComponent("This batch cannot be approved as Bulk Send.")}`);
    return;
  }

  const totalAmount = Number(batch.total_amount ?? 0);
  if (totalAmount <= 0) {
    redirect(`/app/batches/${batchId}?error=${encodeURIComponent("Batch total must be greater than zero")}`);
    return;
  }

  const { data: items, error: itemsErr } = await supabase
    .from("batch_items")
    .select("id, amount, status")
    .eq("batch_id", batchId);

  if (itemsErr) {
    redirect(`/app/batches/${batchId}?error=${encodeURIComponent(itemsErr.message ?? "Failed to load batch items")}`);
    return;
  }

  const allItems = items ?? [];
  if (allItems.length === 0) {
    redirect(`/app/batches/${batchId}?error=${encodeURIComponent("No batch items to process")}`);
    return;
  }

  const pendingValidItems = allItems.filter((it: any) => {
    const amt = Number(it.amount ?? 0);
    const st = it.status as string | null;
    return amt > 0 && (!st || st === "pending");
  });

  if (pendingValidItems.length === 0) {
    redirect(`/app/batches/${batchId}?error=${encodeURIComponent("No valid recipients uploaded")}`);
    return;
  }

  const { error } = await supabase
    .from("batches")
    .update({ status: "processing" })
    .eq("id", batchId)
    .eq("org_id", orgId);

  if (error) throw new Error(error.message);

  const { userId } = await auth();
  const { error: auditErr } = await supabase.from("audit_events").insert({
    org_id: orgId,
    batch_id: batchId,
    actor_user_id: userId ?? null,
    event_type: "batch_approved",
    event_data: { status: "processing" },
  });
  if (auditErr) console.error("Audit event insert failed:", auditErr);

  redirect(`/app/batches/${batchId}`);
}

export async function runBatch(batchId: string, orgId: string) {
  const supabase = supabaseAdmin();

  // Bulk Send run guard: require pending item count > 0 and pending total > 0.
  const { data: items, error: itemsErr } = await supabase
    .from("batch_items")
    .select("id, amount, status")
    .eq("batch_id", batchId);

  if (itemsErr) {
    redirect(`/app/batches/${batchId}?error=${encodeURIComponent(itemsErr.message ?? "Failed to load batch items")}`);
    return;
  }

  const allItems = items ?? [];
  const pendingItems = allItems.filter((it: any) => {
    const st = it.status as string | null;
    return !st || st === "pending";
  });
  const pendingCount = pendingItems.length;
  const pendingTotal = pendingItems.reduce((sum, it: any) => sum + Number(it.amount ?? 0), 0);

  if (pendingCount === 0) {
    redirect(`/app/batches/${batchId}?error=${encodeURIComponent("No batch items to process")}`);
    return;
  }

  if (pendingTotal <= 0) {
    redirect(`/app/batches/${batchId}?error=${encodeURIComponent("Batch total must be greater than zero")}`);
    return;
  }

  // Keep audit insert failures non-fatal (main execution is ledger-based RPC).
  const { error: startedAuditErr } = await supabase.from("audit_events").insert({
    org_id: orgId,
    batch_id: batchId,
    actor_user_id: null,
    event_type: "batch_run_started",
    event_data: {},
  });
  if (startedAuditErr) console.error("Audit event insert failed:", startedAuditErr);

  function mapRpcErrorToCode(message: string): string {
    // For debugging: surface the real DB error (SQLERRM + PG_EXCEPTION_CONTEXT).
    return message;
  }

  type RpcResult =
    | {
        ok?: boolean;
        error?: string;
        already_processed?: boolean;
        success_count?: number;
        failed_count?: number;
        final_status?: string;
        platform_fee?: number;
        fee_bps?: number;
        impact_amount?: number;
      }
    | null;

  let errorCode: string | null = null;
  let result: RpcResult = null;

  try {
    const { data, error } = await supabase.rpc("process_standard_batch_run", {
      p_batch_id: batchId,
    });

    // Log both Supabase RPC error + the function response payload.
    // Note: some RPC calls may return `data` without an `ok` field; that should be treated as success.
    console.log("RPC RESULT:", { data, error });

    if (error) {
      errorCode = mapRpcErrorToCode(error.message);
      result = null;
    } else if (!data || (data as RpcResult & { ok?: boolean })?.ok === false) {
      console.error("Function error:", data);
      errorCode = mapRpcErrorToCode((data as { error?: string } | null)?.error || "Unknown error");
      result = null;
    } else {
      result = data as RpcResult;
    }

    if (!errorCode && result && !result.already_processed) {
      const { error: completedAuditErr } = await supabase.from("audit_events").insert({
        org_id: orgId,
        batch_id: batchId,
        actor_user_id: null,
        event_type: "batch_run_completed",
        event_data: {
          success_count: result.success_count ?? 0,
          failed_count: result.failed_count ?? 0,
          final_status: result.final_status,
        },
      });
      if (completedAuditErr) console.error("Audit event insert failed:", completedAuditErr);
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Batch run failed";
    errorCode = mapRpcErrorToCode(message);
  }

  if (errorCode) {
    redirect(`/app/batches/${batchId}?error=${encodeURIComponent(errorCode)}`);
  }

  let dest = `/app/batches/${batchId}`;
  if (result && !result.already_processed) {
    const icRaw = result.impact_amount;
    const ic =
      icRaw != null && Number(icRaw) > 0 ? Number(icRaw) : impactAmountFromPlatformFee(result.platform_fee);
    if (ic > 0) {
      dest += `?impactToast=${encodeURIComponent(ic.toFixed(2))}`;
    }
  }
  redirect(dest);
}

// Replace Bulk Send CSV:
// - Deletes all uploaded CSV sources (`batch_uploads`) for the batch.
// - Deletes all derived items (`batch_items`) so totals/recipient counts reset to 0.
// MVP: treat a Bulk Send batch's CSV as a single effective source until it's completed.
export async function replaceBulkSendUpload(formData: FormData) {
  const orgId = (formData.get("orgId") ?? "").toString().trim();
  const batchId = (formData.get("batchId") ?? "").toString().trim();

  if (!orgId || !batchId) {
    return { ok: false, error: "Missing orgId/batchId" as string };
  }

  const { userId } = await auth();
  if (!userId) return { ok: false, error: "You must be signed in" as string };

  const supabase = supabaseAdmin();

  // Guard: only owner/operator can mutate uploads.
  const { data: membership } = await supabase
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("clerk_user_id", userId)
    .maybeSingle();

  const role = membership?.role ?? null;
  if (role !== "owner" && role !== "operator") {
    return { ok: false, error: "You do not have permission to modify this batch" as string };
  }

  type RpcResult = { ok?: boolean; error?: string } | null;
  try {
    const { data, error } = await supabase.rpc("reset_standard_batch_uploads", {
      p_batch_id: batchId,
      p_org_id: orgId,
    });

    // Mirror the RPC handling approach used elsewhere: treat `data.ok === false` as failure.
    if (error) {
      return { ok: false, error: error.message ?? "Upload reset failed" as string };
    }

    const result = data as RpcResult;
    const ok = (result as { ok?: boolean; error?: string } | null)?.ok;
    if (!result || ok === false) {
      return { ok: false, error: (result as { error?: string } | null)?.error ?? "Upload reset failed" as string };
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Upload reset failed";
    return { ok: false, error: msg };
  }

  revalidatePath(`/app/batches/${batchId}`);
  return { ok: true as const };
}

export async function retryFailed(batchId: string, orgId: string) {
  const supabase = supabaseAdmin();

  const { error: startedAuditErr } = await supabase.from("audit_events").insert({
    org_id: orgId,
    batch_id: batchId,
    actor_user_id: null,
    event_type: "retry_failed_started",
    event_data: {},
  });
  if (startedAuditErr) console.error("Audit event insert failed:", startedAuditErr);

  function mapRpcErrorToCode(message: string): string {
    // For debugging: surface the real DB error (SQLERRM + PG_EXCEPTION_CONTEXT).
    return message;
  }

  type RpcResult =
    | {
        ok?: boolean;
        error?: string;
        remaining_failed_count?: number;
        final_status?: string;
      }
    | null;

  let errorCode: string | null = null;
  let result: RpcResult = null;

  try {
    const { data, error } = await supabase.rpc("process_standard_batch_retry_failed", {
      p_batch_id: batchId,
    });

    // Log both Supabase RPC error + the function response payload.
    // Note: some RPC calls may return `data` without an `ok` field; that should be treated as success.
    console.log("RPC RESULT:", { data, error });

    if (error) {
      errorCode = mapRpcErrorToCode(error.message);
      result = null;
    } else if (!data || (data as RpcResult & { ok?: boolean })?.ok === false) {
      console.error("Function error:", data);
      errorCode = mapRpcErrorToCode((data as { error?: string } | null)?.error || "Unknown error");
      result = null;
    } else {
      result = data as RpcResult;
    }

    if (!errorCode && result) {
      const { error: completedAuditErr } = await supabase.from("audit_events").insert({
        org_id: orgId,
        batch_id: batchId,
        actor_user_id: null,
        event_type: "retry_failed_completed",
        event_data: {
          remaining_failed_count: result.remaining_failed_count ?? 0,
          final_status: result.final_status,
        },
      });
      if (completedAuditErr) console.error("Audit event insert failed:", completedAuditErr);
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Retry failed";
    errorCode = mapRpcErrorToCode(message);
  }

  if (errorCode) {
    redirect(`/app/batches/${batchId}?error=${encodeURIComponent(errorCode)}`);
  }

  redirect(`/app/batches/${batchId}`);
}

function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Persist customised per-claim amounts (must sum to batch pool). Caller revalidates paths. */
async function assertAndPersistClaimableClaimAmounts(
  orgId: string,
  batchId: string,
  updates: Array<{ id: string; amount: number }>
): Promise<{ error?: string }> {
  const { userId } = await auth();
  if (!userId) return { error: "You must be signed in." };

  const supabase = supabaseAdmin();

  const { data: membership } = await supabase
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("clerk_user_id", userId)
    .maybeSingle();
  const role = membership?.role ?? null;
  if (role !== "owner" && role !== "operator") return { error: "You do not have permission to edit payouts." };

  const { data: batch, error: batchErr } = await supabase
    .from("batches")
    .select("id, batch_type, total_amount, allocations_locked_at")
    .eq("id", batchId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (batchErr || !batch) return { error: "Batch not found." };
  if (batch.batch_type !== "claimable") return { error: "This batch is not claimable." };
  if (batch.allocations_locked_at) return { error: "Allocations are locked. Payouts cannot be edited." };

  const totalPool = Number(batch.total_amount ?? 0);
  const sum = updates.reduce((s, u) => s + u.amount, 0);
  if (Math.abs(sum - totalPool) > 0.01) return { error: "Total allocated must equal the pool amount." };

  const { data: batchClaimRows, error: allClaimsErr } = await supabase
    .from("batch_claims")
    .select("id")
    .eq("batch_id", batchId);
  if (allClaimsErr) return { error: "Failed to load claims for this batch." };
  const expectedIds = new Set((batchClaimRows ?? []).map((r) => r.id as string));
  if (expectedIds.size === 0) return { error: "No joined recipients to allocate." };
  if (updates.length !== expectedIds.size) {
    return { error: "Allocation must include every joined recipient." };
  }
  const updateIds = new Set(updates.map((u) => u.id));
  if (updateIds.size !== updates.length) return { error: "Duplicate claim IDs in allocation data." };
  for (const id of updateIds) {
    if (!expectedIds.has(id)) return { error: "Invalid claim IDs." };
  }

  for (const u of updates) {
    const { error: upErr } = await supabase
      .from("batch_claims")
      .update({ claim_amount: u.amount })
      .eq("id", u.id)
      .eq("batch_id", batchId);
    if (upErr) return { error: upErr.message };
  }

  return {};
}

export async function updateClaimAmounts(
  orgId: string,
  batchId: string,
  updates: Array<{ id: string; amount: number }>
): Promise<{ error?: string }> {
  const result = await assertAndPersistClaimableClaimAmounts(orgId, batchId, updates);
  if (result.error) return result;

  revalidatePath(`/app/batches/${batchId}`);
  return {};
}

export type LockAllocationsState = { error?: string; success?: boolean };

export async function lockAllocations(
  _prevState: LockAllocationsState | null,
  formData: FormData
): Promise<LockAllocationsState> {
  const oid = (formData.get("orgId") ?? "").toString().trim();
  const bid = (formData.get("batchId") ?? "").toString().trim();
  if (!oid || !bid) {
    return { error: `Batch not found. (batchId: ${bid || "(empty)"}, orgId: ${oid || "(empty)"})` };
  }

  const { userId } = await auth();
  if (!userId) return { error: "You must be signed in." };

  const supabase = supabaseAdmin();

  const { data: membership } = await supabase
    .from("org_members")
    .select("role")
    .eq("org_id", oid)
    .eq("clerk_user_id", userId)
    .maybeSingle();
  const role = membership?.role ?? null;
  if (role !== "owner" && role !== "operator") return { error: "You do not have permission to lock allocations." };

  const { data: batch, error: batchErr } = await supabase
    .from("batches")
    .select("id, org_id, batch_type, status, total_amount, recipient_count, allocations_locked_at")
    .eq("id", bid)
    .eq("org_id", oid)
    .maybeSingle();

  if (batchErr || !batch) {
    return {
      error: `Batch lookup failed in finalize action. Received batchId: ${bid}, orgId: ${oid}${batchErr ? `; DB error: ${batchErr.message}` : ""}`,
    };
  }
  if (batch.batch_type !== "claimable") return { error: "This batch is not claimable." };
  if (batch.allocations_locked_at) return { error: "Allocations are already locked." };

  const status = String(batch.status ?? "").toLowerCase();
  if (status === "processing" || status === "completed" || status === "completed_with_errors") {
    return { error: "Cannot lock allocations for a batch that is already processing or completed." };
  }

  const rawAlloc = (formData.get("claimAllocations") ?? "").toString().trim();
  if (rawAlloc) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawAlloc);
    } catch {
      return { error: "Invalid allocation data. Refresh the page and try again." };
    }
    if (!Array.isArray(parsed)) {
      return { error: "Invalid allocation data. Refresh the page and try again." };
    }
    const updates: Array<{ id: string; amount: number }> = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") {
        return { error: "Invalid allocation data. Refresh the page and try again." };
      }
      const r = row as Record<string, unknown>;
      if (typeof r.id !== "string" || r.id.length === 0) {
        return { error: "Invalid allocation data. Refresh the page and try again." };
      }
      const amt = typeof r.amount === "number" ? r.amount : Number(r.amount);
      if (!Number.isFinite(amt) || amt < 0) {
        return { error: "Invalid payout amounts in allocation data." };
      }
      updates.push({ id: r.id, amount: roundMoney2(amt) });
    }
    const persistRes = await assertAndPersistClaimableClaimAmounts(oid, bid, updates);
    if (persistRes.error) return persistRes;
  }

  const { data: claims, error: claimsErr } = await supabase
    .from("batch_claims")
    .select("id, claim_amount")
    .eq("batch_id", bid);

  if (claimsErr) return { error: "Failed to load recipient payouts." };

  const count = claims?.length ?? 0;
  const expectedCount = batch.recipient_count ?? 0;
  if (count !== expectedCount) {
    return { error: "Recipient count does not match. Refresh the page and try again." };
  }

  const totalPool = Number(batch.total_amount ?? 0);
  const sum = (claims ?? []).reduce((s, c) => s + Number(c.claim_amount ?? 0), 0);
  if (Math.abs(sum - totalPool) > 0.01) {
    return { error: "Total of recipient payouts must equal the batch pool amount before locking." };
  }

  const hasNegative = (claims ?? []).some((c) => Number(c.claim_amount ?? 0) < 0);
  if (hasNegative) return { error: "All payout amounts must be zero or positive." };

  const { error: updateErr } = await supabase
    .from("batches")
    .update({ allocations_locked_at: new Date().toISOString() })
    .eq("id", bid)
    .eq("org_id", oid);

  if (updateErr) return { error: updateErr.message };

  revalidatePath(`/app/batches/${bid}`);
  return { success: true };
}

export type UnlockAllocationsState = { error?: string; success?: boolean };

export async function unlockAllocations(
  _prevState: UnlockAllocationsState | null,
  formData: FormData
): Promise<UnlockAllocationsState> {
  const oid = (formData.get("orgId") ?? "").toString().trim();
  const bid = (formData.get("batchId") ?? "").toString().trim();
  if (!oid || !bid) return { error: "Batch not found." };

  const { userId } = await auth();
  if (!userId) return { error: "You must be signed in." };

  const supabase = supabaseAdmin();

  const { data: membership } = await supabase
    .from("org_members")
    .select("role")
    .eq("org_id", oid)
    .eq("clerk_user_id", userId)
    .maybeSingle();
  const role = membership?.role ?? null;
  if (role !== "owner" && role !== "operator") return { error: "You do not have permission to unlock allocations." };

  const { data: batch, error: batchErr } = await supabase
    .from("batches")
    .select("id, org_id, batch_type, status, allocations_locked_at")
    .eq("id", bid)
    .eq("org_id", oid)
    .maybeSingle();

  if (batchErr || !batch) return { error: "Batch not found." };
  if (batch.batch_type !== "claimable") return { error: "This batch is not claimable." };
  if (!batch.allocations_locked_at) return { error: "Allocations are not locked." };

  const status = String(batch.status ?? "").toLowerCase();
  if (status === "processing" || status === "completed" || status === "completed_with_errors") {
    return { error: "Cannot unlock allocations for a batch that is already processing or completed." };
  }

  const { error: updateErr } = await supabase
    .from("batches")
    .update({ allocations_locked_at: null })
    .eq("id", bid)
    .eq("org_id", oid);

  if (updateErr) return { error: updateErr.message };

  revalidatePath(`/app/batches/${bid}`);
  return { success: true };
}

export type SendClaimablePayoutsState = {
  error?: string;
  success?: boolean;
  /** From RPC impact_amount (impact slice of platform fee) */
  impactContribution?: number;
  platformFee?: number;
  feeBps?: number;
};

export async function sendClaimablePayouts(
  _prevState: SendClaimablePayoutsState | null,
  formData: FormData
): Promise<SendClaimablePayoutsState> {
  const oid = (formData.get("orgId") ?? "").toString().trim();
  const bid = (formData.get("batchId") ?? "").toString().trim();
  if (!oid || !bid) return { error: "Batch not found." };

  const { userId } = await auth();
  if (!userId) return { error: "You must be signed in." };

  const supabase = supabaseAdmin();

  const { data: membership } = await supabase
    .from("org_members")
    .select("role")
    .eq("org_id", oid)
    .eq("clerk_user_id", userId)
    .maybeSingle();
  const role = membership?.role ?? null;
  if (role !== "owner" && role !== "operator") return { error: "You do not have permission to send payouts." };

  const { data: batch, error: batchErr } = await supabase
    .from("batches")
    .select("id, org_id, batch_type, status, total_amount, allocations_locked_at, funded_by_user_id, currency")
    .eq("id", bid)
    .eq("org_id", oid)
    .maybeSingle();

  if (batchErr || !batch) return { error: "Batch not found." };
  if (batch.batch_type !== "claimable") return { error: "This batch is not claimable." };
  if (!batch.allocations_locked_at) return { error: "Allocations must be finalized before sending payouts." };

  const status = String(batch.status ?? "").toLowerCase();
  if (status === "completed" || status === "completed_with_errors") {
    return { error: "Payouts have already been sent or are in progress." };
  }
  // Allow status === "processing" so stuck batches (e.g. RPC failed after app set processing) can be retried.

  const { data: claims, error: claimsErr } = await supabase
    .from("batch_claims")
    .select("id, user_id, claim_amount")
    .eq("batch_id", bid)
    .order("created_at", { ascending: true });

  if (claimsErr) return { error: "Failed to load recipients." };
  const claimList = claims ?? [];
  if (claimList.length === 0) return { error: "No joined recipients to pay." };

  const totalPool = Number(batch.total_amount ?? 0);
  const sum = claimList.reduce((s, c) => s + Number(c.claim_amount ?? 0), 0);
  if (Math.abs(sum - totalPool) > 0.01) return { error: "Total allocated must match the pool amount before sending." };

  const hasInvalid = claimList.some((c) => Number(c.claim_amount ?? 0) < 0);
  if (hasInvalid) return { error: "All claim amounts must be zero or positive." };

  if (batch.funded_by_user_id) {
    // RPC does everything in one transaction (ledger, wallets, batch_claims, batch status).
    // Do not set status to "processing" here; that left batches stuck when the RPC was missing.
    const { error: startedAuditErr } = await supabase.from("audit_events").insert({
      org_id: oid,
      batch_id: bid,
      actor_user_id: userId,
      event_type: "claimable_payouts_started",
      event_data: { recipient_count: claimList.length },
    });
    if (startedAuditErr) console.error("Audit claimable_payouts_started failed:", startedAuditErr);

    const { data: rpcData, error: rpcErr } = await supabase.rpc("process_claimable_batch_payout", {
      p_batch_id: bid,
    });
    if (rpcErr) return { error: rpcErr.message };
    const result = rpcData as {
      ok?: boolean;
      error?: string;
      platform_fee?: number;
      impact_amount?: number;
      fee_bps?: number;
    } | null;
    const platformFee = Number(result?.platform_fee ?? 0);
    const impactRaw = result?.impact_amount;
    const impactContribution =
      impactRaw != null && Number(impactRaw) >= 0
        ? Number(impactRaw)
        : impactAmountFromPlatformFee(result?.platform_fee);
    if (result && result.ok === false) {
      if (result.error?.toLowerCase().includes("duplicate") && result.error?.toLowerCase().includes("idempotency")) {
        await supabase.from("batches").update({ status: "completed" }).eq("id", bid).eq("org_id", oid);
        revalidatePath(`/app/batches/${bid}`);
        return { success: true };
      }
      return { error: result.error ?? "Payout failed" };
    }
    revalidatePath(`/app/batches/${bid}`);
    return {
      success: true,
      impactContribution,
      platformFee,
      feeBps: result?.fee_bps,
    };
  }

  const { error: processingErr } = await supabase
    .from("batches")
    .update({ status: "processing" })
    .eq("id", bid)
    .eq("org_id", oid);
  if (processingErr) return { error: processingErr.message };

  const { error: startedAuditErrSim } = await supabase.from("audit_events").insert({
    org_id: oid,
    batch_id: bid,
    actor_user_id: userId,
    event_type: "claimable_payouts_started",
    event_data: { recipient_count: claimList.length },
  });
  if (startedAuditErrSim) console.error("Audit claimable_payouts_started failed:", startedAuditErrSim);

  let successCount = 0;
  let failedCount = 0;
  const now = new Date().toISOString();

  for (const claim of claimList) {
    const claimId = claim.id;
    if (claimId == null) continue;

    const claimAmount = Number(claim.claim_amount ?? 0);
    const simulatedSuccess = Math.random() >= 0.2;

    if (simulatedSuccess) {
      const { error: upErr } = await supabase
        .from("batch_claims")
        .update({
          payout_status: "paid",
          paid_at: now,
          failure_reason: null,
        })
        .eq("id", claimId)
        .eq("batch_id", bid);

      if (upErr) {
        const { error: failErr } = await supabase
          .from("batch_claims")
          .update({
            payout_status: "failed",
            paid_at: null,
            failure_reason: upErr.message ?? "Update failed",
          })
          .eq("id", claimId)
          .eq("batch_id", bid);
        if (failErr) console.error("Failed to mark claim as failed:", failErr);
        failedCount += 1;
        const { error: auditErr } = await supabase.from("audit_events").insert({
          org_id: oid,
          batch_id: bid,
          actor_user_id: userId,
          event_type: "claimable_payout_failed",
          event_data: { claim_id: claimId, failure_reason: upErr.message },
        });
        if (auditErr) console.error("Audit claimable_payout_failed failed:", auditErr);
      } else {
        successCount += 1;
        const { error: auditErr } = await supabase.from("audit_events").insert({
          org_id: oid,
          batch_id: bid,
          actor_user_id: userId,
          event_type: "claimable_payout_paid",
          event_data: { claim_id: claimId },
        });
        if (auditErr) console.error("Audit claimable_payout_paid failed:", auditErr);
      }
    } else {
      const reason = randomFailureReason();
      const { error: upErr } = await supabase
        .from("batch_claims")
        .update({
          payout_status: "failed",
          paid_at: null,
          failure_reason: reason,
        })
        .eq("id", claimId)
        .eq("batch_id", bid);

      failedCount += 1;
      if (upErr) {
        console.error("Failed to update claim payout_status:", upErr);
      } else {
        const { error: auditErr } = await supabase.from("audit_events").insert({
          org_id: oid,
          batch_id: bid,
          actor_user_id: userId,
          event_type: "claimable_payout_failed",
          event_data: { claim_id: claimId, failure_reason: reason },
        });
        if (auditErr) console.error("Audit claimable_payout_failed failed:", auditErr);
      }
    }
  }

  const batchStatus = failedCount > 0 ? "completed_with_errors" : "completed";
  const { error: batchUpdateErr } = await supabase
    .from("batches")
    .update({ status: batchStatus })
    .eq("id", bid)
    .eq("org_id", oid);
  if (batchUpdateErr) return { error: batchUpdateErr.message };

  const { error: completedAuditErr } = await supabase.from("audit_events").insert({
    org_id: oid,
    batch_id: bid,
    actor_user_id: userId,
    event_type: "claimable_payouts_completed",
    event_data: {
      success_count: successCount,
      failed_count: failedCount,
      final_status: batchStatus,
    },
  });
  if (completedAuditErr) console.error("Audit claimable_payouts_completed failed:", completedAuditErr);

  revalidatePath(`/app/batches/${bid}`);
  return { success: true };
}
