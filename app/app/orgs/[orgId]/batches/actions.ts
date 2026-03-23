"use server";

import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { revalidatePath } from "next/cache";

type ActionResult = { ok: true } | { ok: false; error: string };

async function requireMembership(orgId: string): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "You must be signed in." };

  const supabase = supabaseAdmin();
  const { data: membership } = await supabase
    .from("org_members")
    .select("id")
    .eq("org_id", orgId)
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (!membership) return { ok: false, error: "You do not have access to this organisation." };
  return { ok: true, userId };
}

export async function deletePayout(orgId: string, batchId: string): Promise<ActionResult> {
  const membership = await requireMembership(orgId);
  if (!membership.ok) return membership;

  const supabase = supabaseAdmin();
  const { data: batch, error: batchErr } = await supabase
    .from("batches")
    .select("id, status, archived_at")
    .eq("id", batchId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (batchErr || !batch) return { ok: false, error: batchErr?.message ?? "Payout not found." };

  const status = String(batch.status ?? "").toLowerCase();
  if (status === "completed" || status === "completed_with_errors") {
    return { ok: false, error: "Completed payouts cannot be deleted. Archive this payout instead." };
  }

  const { error } = await supabase.from("batches").delete().eq("id", batchId).eq("org_id", orgId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/batches");
  revalidatePath(`/app/batches/${batchId}`);
  return { ok: true };
}

export async function archivePayout(orgId: string, batchId: string): Promise<ActionResult> {
  const membership = await requireMembership(orgId);
  if (!membership.ok) return membership;

  const supabase = supabaseAdmin();
  const { data: batch, error: batchErr } = await supabase
    .from("batches")
    .select("id, status")
    .eq("id", batchId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (batchErr || !batch) return { ok: false, error: batchErr?.message ?? "Payout not found." };

  const status = String(batch.status ?? "").toLowerCase();
  if (status !== "completed" && status !== "completed_with_errors") {
    return { ok: false, error: "Only completed payouts can be archived." };
  }

  const { error } = await supabase
    .from("batches")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", batchId)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/batches");
  revalidatePath(`/app/batches/${batchId}`);
  return { ok: true };
}

