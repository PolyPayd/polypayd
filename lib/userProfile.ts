import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserProfileRecord } from "@/lib/userProfileTypes";

export type UserProfileRow = UserProfileRecord;

/** Ensure a profiles row exists for this Clerk user (webhook may not have fired yet). */
export async function ensureUserProfileRow(
  supabase: SupabaseClient,
  clerkUserId: string,
  email: string | null
): Promise<void> {
  const { error } = await supabase.from("profiles").upsert(
    { clerk_user_id: clerkUserId, email: email ?? null },
    { onConflict: "clerk_user_id", ignoreDuplicates: true }
  );
  if (error) console.error("ensureUserProfileRow upsert failed:", error);
}

export async function getUserProfileRow(
  supabase: SupabaseClient,
  clerkUserId: string
): Promise<UserProfileRow | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "clerk_user_id, email, full_name, phone, address_line_1, address_line_2, city, postcode, country, avatar_url, updated_at"
    )
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (error || !data) return null;
  return data as UserProfileRow;
}
