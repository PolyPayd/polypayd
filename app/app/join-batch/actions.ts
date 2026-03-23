"use server";

import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { normalizeBatchCode } from "@/lib/claimableBatch";
import { isClaimableSchemaError, CLAIMABLE_SCHEMA_MESSAGE } from "@/lib/dbSchema";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function joinBatchRedirect(code: string, error: string): never {
  const q = new URLSearchParams();
  if (code) q.set("code", code);
  if (error) q.set("error", error);
  redirect(`/app/join-batch?${q.toString()}`);
}

export async function joinClaimableBatch(formData: FormData) {
  const batchId = String(formData.get("batchId") ?? "").trim();
  const orgId = String(formData.get("orgId") ?? "").trim();
  const batchCodeRaw = String(formData.get("batchCode") ?? "").trim();
  const batchCode = batchCodeRaw ? normalizeBatchCode(batchCodeRaw) : "";

  const { userId } = await auth();
  if (!userId) {
    joinBatchRedirect(batchCode, "unauthorized");
  }

  if (!batchId || !orgId) {
    joinBatchRedirect(batchCode, "not_found");
  }

  const supabase = supabaseAdmin();

  const baseBatchSelect = "id, org_id, name, batch_code, batch_type, expires_at, max_claims, recipient_count";
  const { data: batchBase, error: batchErr } = await supabase
    .from("batches")
    .select(baseBatchSelect)
    .eq("id", batchId)
    .maybeSingle();

  if (batchErr) {
    if (isClaimableSchemaError(batchErr)) joinBatchRedirect(batchCode, "schema");
    joinBatchRedirect(batchCode, "not_found");
  }
  if (!batchBase) joinBatchRedirect(batchCode, "not_found");

  const redirectCode = batchCode || batchBase.batch_code || "";

  if (batchBase.batch_type !== "claimable") {
    joinBatchRedirect(redirectCode, "not_claimable");
  }

  let amountPerClaim: number | null = null;
  let allocationMode: string | null = null;
  let allocationsLockedAt: string | null = null;
  const extRes = await supabase
    .from("batches")
    .select("amount_per_claim, allocation_mode, allocations_locked_at")
    .eq("id", batchId)
    .maybeSingle();
  if (!extRes.error && extRes.data) {
    amountPerClaim = extRes.data.amount_per_claim != null ? Number(extRes.data.amount_per_claim) : null;
    allocationMode = extRes.data.allocation_mode ?? null;
    allocationsLockedAt = extRes.data.allocations_locked_at ?? null;
  }
  if (extRes.error && isClaimableSchemaError(extRes.error)) {
    joinBatchRedirect(redirectCode, "schema");
  }
  const batch = { ...batchBase, amount_per_claim: amountPerClaim, allocation_mode: allocationMode, allocations_locked_at: allocationsLockedAt };

  if (batch.allocations_locked_at) {
    joinBatchRedirect(redirectCode, "allocations_locked");
  }

  if (
    batch.expires_at &&
    new Date(batch.expires_at).getTime() < Date.now()
  ) {
    joinBatchRedirect(redirectCode, "expired");
  }

  const { data: existingClaim } = await supabase
    .from("batch_claims")
    .select("id")
    .eq("batch_id", batchId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existingClaim) {
    joinBatchRedirect(redirectCode, "already_joined");
  }

  let useSlots = batch.allocation_mode === "even" || batch.allocation_mode === "custom";

  let claimAmount = batch.amount_per_claim ?? 0;
  let claimSlotId: string | null = null;

  if (useSlots) {
    const slotRes = await supabase
      .from("claim_slots")
      .select("id, amount")
      .eq("batch_id", batchId)
      .eq("status", "open")
      .order("slot_index", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (slotRes.error) {
      useSlots = false;
      claimAmount = batch.amount_per_claim ?? 0;
    } else if (!slotRes.data) {
      const { count: slotCount, error: countErr } = await supabase
        .from("claim_slots")
        .select("id", { count: "exact", head: true })
        .eq("batch_id", batchId);
      if (countErr || slotCount === 0 || slotCount == null) {
        useSlots = false;
        claimAmount = batch.amount_per_claim ?? 0;
      } else {
        joinBatchRedirect(redirectCode, "full");
      }
    } else {
      claimAmount = Number(slotRes.data.amount ?? 0);
      claimSlotId = slotRes.data.id;
    }
  }

  if (!useSlots) {
    const { count: claimsCount, error: countErr } = await supabase
      .from("batch_claims")
      .select("id", { count: "exact", head: true })
      .eq("batch_id", batchId);
    if (countErr) joinBatchRedirect(redirectCode, "error");
    const maxClaims = batch.max_claims ?? 0;
    if (maxClaims > 0 && (claimsCount ?? 0) >= maxClaims) {
      joinBatchRedirect(redirectCode, "full");
    }
  }

  const insertPayload: Record<string, unknown> = {
    org_id: batch.org_id,
    batch_id: batch.id,
    user_id: userId,
    polypayd_username: userId,
    claim_amount: claimAmount,
  };
  if (claimSlotId != null) insertPayload.claim_slot_id = claimSlotId;
  const { error: claimErr } = await supabase.from("batch_claims").insert(insertPayload);

  if (claimErr) {
    if (isClaimableSchemaError(claimErr)) joinBatchRedirect(redirectCode, "schema");
    const code = String((claimErr as { code?: string }).code ?? "");
    const msg = String(claimErr.message ?? "").toLowerCase();
    if (code === "23505" || msg.includes("unique") || msg.includes("duplicate")) {
      joinBatchRedirect(redirectCode, "already_joined");
    }
    joinBatchRedirect(redirectCode, "error");
  }

  if (useSlots && claimSlotId) {
    const { error: updateSlotErr } = await supabase
      .from("claim_slots")
      .update({
        status: "claimed",
        claimed_by_user_id: userId,
        claimed_at: new Date().toISOString(),
      })
      .eq("id", claimSlotId)
      .eq("status", "open");

    if (updateSlotErr) console.error("Claim slot update failed:", updateSlotErr);
  }

  const { count: totalClaims, error: totalCountErr } = await supabase
    .from("batch_claims")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batchId);

  if (totalCountErr) joinBatchRedirect(redirectCode, "error");

  const { error: updateErr } = await supabase
    .from("batches")
    .update({ recipient_count: totalClaims ?? 0 })
    .eq("id", batchId);

  if (updateErr) joinBatchRedirect(redirectCode, "error");

  const { error: auditErr } = await supabase.from("audit_events").insert({
    org_id: batch.org_id,
    batch_id: batch.id,
    actor_user_id: userId,
    event_type: "batch_claimed",
    event_data: { batch_code: batch.batch_code ?? batchCode },
  });
  if (auditErr) console.error("Audit event insert failed:", auditErr);

  redirect(`/app/join-batch?code=${encodeURIComponent(redirectCode)}&joined=1`);
}
