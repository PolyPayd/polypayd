import type { SupabaseClient } from "@supabase/supabase-js";
import { batchCodesForLookup } from "./batchCodePublic";
import { isClaimableSchemaError, CLAIMABLE_SCHEMA_MESSAGE } from "./dbSchema";

export function normalizeBatchCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "-");
}

export type ClaimableBatchRow = {
  id: string;
  org_id: string;
  name: string | null;
  batch_code: string | null;
  batch_type: string | null;
  expires_at: string | null;
  max_claims: number | null;
  status: string | null;
  total_amount?: number | null;
  amount_per_claim?: number | null;
  currency?: string | null;
  allocation_mode?: string | null;
  allocations_locked_at?: string | null;
};

export type ClaimableBatchInfo = {
  batch: ClaimableBatchRow | null;
  currentClaims: number;
  alreadyJoined: boolean;
  statusMessage: string | null;
  statusType: "success" | "error";
  /** Set when allocation_mode is even: amount each claim receives. Null for custom (amount from next slot). */
  nextClaimAmount: number | null;
  allocationMode: "even" | "custom" | null;
};

export async function getClaimableBatchInfo(
  supabase: SupabaseClient,
  code: string,
  userId: string | null
): Promise<ClaimableBatchInfo> {
  const empty: ClaimableBatchInfo = {
    batch: null,
    currentClaims: 0,
    alreadyJoined: false,
    statusMessage: null,
    statusType: "error",
    nextClaimAmount: null,
    allocationMode: null,
  };

  if (!code) {
    return { ...empty, statusMessage: "Batch not found." };
  }

  const lookupCodes = batchCodesForLookup(code);
  const { data: batchRow, error: batchErr } = await supabase
    .from("batches")
    .select("id, org_id, name, batch_code, batch_type, expires_at, max_claims, status, total_amount, amount_per_claim, currency, allocation_mode, allocations_locked_at")
    .in("batch_code", lookupCodes)
    .maybeSingle();

  if (batchErr) {
    if (isClaimableSchemaError(batchErr)) {
      return { ...empty, statusMessage: CLAIMABLE_SCHEMA_MESSAGE };
    }
    return { ...empty, statusMessage: "Failed to look up batch." };
  }
  if (!batchRow) {
    return { ...empty, statusMessage: "Batch not found." };
  }

  const batch = batchRow as ClaimableBatchRow;

  const allocationMode: "even" | "custom" | null =
    batch.allocation_mode === "custom" ? "custom" : batch.allocation_mode === "even" ? "even" : null;

  if (batch.batch_type !== "claimable") {
    return { ...empty, batch, nextClaimAmount: null, allocationMode: null, statusMessage: "This batch cannot be joined with a code.", statusType: "error" };
  }

  if (batch.allocations_locked_at) {
    return { batch, currentClaims: 0, alreadyJoined: false, statusMessage: "This batch is no longer accepting claims.", statusType: "error", nextClaimAmount: null, allocationMode: null };
  }

  if (batch.expires_at && new Date(batch.expires_at).getTime() < Date.now()) {
    return { batch, currentClaims: 0, alreadyJoined: false, statusMessage: "This batch has expired.", statusType: "error", nextClaimAmount: null, allocationMode };
  }

  const { count, error: countErr } = await supabase
    .from("batch_claims")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batch.id);

  if (countErr) {
    return { batch, currentClaims: 0, alreadyJoined: false, statusMessage: "Failed to load claim count.", statusType: "error", nextClaimAmount: null, allocationMode };
  }

  const currentClaims = count ?? 0;
  const maxClaims = batch.max_claims ?? 0;

  const isFull = maxClaims > 0 && currentClaims >= maxClaims;
  if (isFull) {
    return { batch, currentClaims, alreadyJoined: false, statusMessage: "This batch is full and no longer accepting new joins.", statusType: "error", nextClaimAmount: null, allocationMode };
  }

  let nextClaimAmount: number | null = null;
  const nextSlotRes = await supabase
    .from("claim_slots")
    .select("amount")
    .eq("batch_id", batch.id)
    .eq("status", "open")
    .order("slot_index", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!nextSlotRes.error && nextSlotRes.data?.amount != null) {
    nextClaimAmount = Number(nextSlotRes.data.amount);
  } else if (
    (allocationMode === "even" || allocationMode === null) &&
    batch.amount_per_claim != null &&
    Number(batch.amount_per_claim) > 0
  ) {
    nextClaimAmount = Number(batch.amount_per_claim);
  }

  let alreadyJoined = false;
  if (userId) {
    const { data: myClaim } = await supabase
      .from("batch_claims")
      .select("id")
      .eq("batch_id", batch.id)
      .eq("user_id", userId)
      .maybeSingle();
    alreadyJoined = !!myClaim;
  }

  if (alreadyJoined) {
    return { batch, currentClaims, alreadyJoined, statusMessage: "You have already joined this batch.", statusType: "success", nextClaimAmount, allocationMode };
  }
  return { batch, currentClaims, alreadyJoined, statusMessage: "You can join this batch.", statusType: "success", nextClaimAmount, allocationMode };
}
