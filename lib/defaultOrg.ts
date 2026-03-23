import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * PolyPayd previously used an org-scoped UI + routing model.
 * For the simplified single-wallet MVP UX, we keep a minimal internal org behind the scenes
 * so existing DB rows that require `org_id` continue to work.
 *
 * Returns the user's "primary" org_id (creating one if needed).
 */
export async function ensureDefaultOrgForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const { data: memberships, error: memErr } = await supabase
    .from("org_members")
    .select("org_id, role")
    .eq("clerk_user_id", userId)
    .order("org_id", { ascending: true })
    .limit(1);

  if (memErr) {
    // If we can't look up existing memberships, fail fast: callers rely on this org_id.
    throw new Error(memErr.message ?? "Failed to load organisation membership.");
  }

  const existing = memberships?.[0];
  const existingOrgId = existing?.org_id;
  if (existingOrgId) {
    // Since organisations are no longer a first-class product concept,
    // treat the primary workspace as full-access for the current user.
    if (existing?.role && existing.role !== "owner") {
      const { error: roleErr } = await supabase
        .from("org_members")
        .update({ role: "owner" })
        .eq("org_id", existingOrgId)
        .eq("clerk_user_id", userId);
      if (roleErr) throw new Error(roleErr.message ?? "Failed to elevate default org role.");
    }
    return existingOrgId;
  }

  const workspaceName = `Personal Workspace`;
  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .insert({ name: workspaceName, owner_clerk_user_id: userId })
    .select("id")
    .single();

  if (orgErr || !org?.id) {
    throw new Error(orgErr?.message ?? "Failed to create default organisation.");
  }

  const { error: memInsertErr } = await supabase.from("org_members").insert({
    org_id: org.id,
    clerk_user_id: userId,
    role: "owner",
  });

  if (memInsertErr) {
    throw new Error(memInsertErr.message ?? "Failed to create default org membership.");
  }

  return org.id;
}

