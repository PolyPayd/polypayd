"use server";

import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type CreateOrgState = { error?: string };

export async function createOrgAndRedirect(_prev: CreateOrgState | null, formData: FormData): Promise<CreateOrgState> {
  const { userId } = await auth();
  if (!userId) {
    return { error: "You must be signed in to create an organisation." };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) {
    return { error: "Organisation name must be at least 2 characters." };
  }

  const supabase = supabaseAdmin();
  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .insert({ name, owner_clerk_user_id: userId })
    .select("id")
    .single();

  if (orgErr) return { error: orgErr.message ?? "Failed to create organisation." };

  const { error: memErr } = await supabase.from("org_members").insert({
    org_id: org.id,
    clerk_user_id: userId,
    role: "owner",
  });

  if (memErr) return { error: memErr.message ?? "Failed to add you to the organisation." };

  redirect(`/app/orgs/${org.id}/wallet`);
}
