"use server";

import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { isClaimableSchemaError, CLAIMABLE_SCHEMA_MESSAGE } from "@/lib/dbSchema";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { SupabaseClient } from "@supabase/supabase-js";

const UPPER_ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function generateClaimableBatchCode(): string {
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    suffix += UPPER_ALPHA[Math.floor(Math.random() * UPPER_ALPHA.length)];
  }
  return `JOIN-${suffix}`;
}

async function generateUniqueBatchCode(
  supabase: SupabaseClient,
  maxAttempts = 10
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = generateClaimableBatchCode();
    const { data: existing } = await supabase
      .from("batches")
      .select("id")
      .eq("batch_code", code)
      .maybeSingle();
    if (!existing) return code;
  }
  throw new Error("Could not generate a unique batch code. Please try again.");
}

export async function createBatch(formData: FormData) {
  const orgId = String(formData.get("orgId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const batchType = String(formData.get("batchType") ?? "standard").toLowerCase();
  const currency = String(formData.get("currency") ?? "GBP").trim() || "GBP";

  if (!orgId) throw new Error("Missing orgId");
  if (!name) throw new Error("Batch name is required");

  const { userId } = await auth();
  if (!userId) throw new Error("You must be signed in");

  const supabase = supabaseAdmin();

  if (batchType === "claimable") {
    const expiresAtRaw = String(formData.get("expiresAt") ?? "").trim();
    const maxClaimsRaw = String(formData.get("maxClaims") ?? "").trim();
    const totalPoolAmountRaw = String(formData.get("totalPoolAmount") ?? "").trim();

    if (!expiresAtRaw) throw new Error("Expiry date and time is required for claimable batches.");
    const expiresAt = new Date(expiresAtRaw);
    if (Number.isNaN(expiresAt.getTime())) throw new Error("Invalid expiry date.");
    if (expiresAt.getTime() <= Date.now()) throw new Error("Expiry must be in the future.");

    const maxClaims = parseInt(maxClaimsRaw, 10);
    if (!Number.isInteger(maxClaims) || maxClaims < 1) {
      throw new Error("Max recipients must be at least 1.");
    }

    const totalPoolAmount = parseFloat(totalPoolAmountRaw);
    if (Number.isNaN(totalPoolAmount) || totalPoolAmount <= 0) {
      throw new Error("Total amount must be greater than 0.");
    }

    const curr = currency || "GBP";
    const { data: walletRow } = await supabase
      .from("wallets")
      .select("current_balance, pending_balance")
      .eq("user_id", userId)
      .eq("currency", curr)
      .maybeSingle();
    // Claim Link sends debit pending_balance in DB; pool must fit pending funds.
    const walletBalance = walletRow ? Number(walletRow.pending_balance ?? 0) : 0;
    if (totalPoolAmount > walletBalance) {
      const fmt = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: curr }).format(n);
      throw new Error(
        `Insufficient pending balance. Pending balance is ${fmt(walletBalance)} but batch total is ${fmt(totalPoolAmount)}. Add funds or reduce the amount.`
      );
    }

    const totalCents = Math.round(totalPoolAmount * 100);
    if (totalCents % maxClaims !== 0) {
      throw new Error(
        "Total must divide evenly by max recipients to 2 decimal places (e.g. £300 ÷ 100 = £3.00)."
      );
    }
    const amountPerClaim = totalCents / maxClaims / 100;

    const batchCode = await generateUniqueBatchCode(supabase);

    const { data, error } = await supabase
      .from("batches")
      .insert({
        org_id: orgId,
        name,
        status: "draft",
        created_by: userId,
        currency: currency || "GBP",
        batch_type: "claimable",
        batch_code: batchCode,
        expires_at: expiresAt.toISOString(),
        max_claims: maxClaims,
        recipient_count: 0,
        total_amount: totalPoolAmount,
        amount_per_claim: amountPerClaim,
        allocation_mode: "even",
        funded_by_user_id: userId,
      })
      .select("id")
      .single();

    if (error) {
      if (isClaimableSchemaError(error)) throw new Error(CLAIMABLE_SCHEMA_MESSAGE);
      throw new Error(error.message);
    }

    const { error: auditErr } = await supabase.from("audit_events").insert({
      org_id: orgId,
      batch_id: data.id,
      actor_user_id: userId,
      event_type: "batch_created",
      event_data: { name, batch_type: "claimable", batch_code: batchCode },
    });
    if (auditErr) console.error("Audit event insert failed:", auditErr);

    redirect(`/app/batches/${data.id}`);
  }

  // Standard batch: preserve existing behaviour
  const { data, error } = await supabase
    .from("batches")
    .insert({
      org_id: orgId,
      name,
      status: "draft",
      created_by: userId,
      currency: currency || "GBP",
      batch_type: "standard",
      funded_by_user_id: userId,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  const { error: auditErr } = await supabase.from("audit_events").insert({
    org_id: orgId,
    batch_id: data.id,
    actor_user_id: userId,
    event_type: "batch_created",
    event_data: { name },
  });
  if (auditErr) console.error("Audit event insert failed:", auditErr);

  redirect(`/app/batches/${data.id}`);
}
