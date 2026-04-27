import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Server-side helpers for the `users` table.
//
// All reads filter for `deleted_at IS NULL` so soft-deleted accounts can never
// leak back into the live app.

export type UserRow = {
  id: string;
  clerk_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  phone_number: string | null;
  kyc_status: string;
  kyc_verified_at: string | null;
  persona_inquiry_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const USER_COLUMNS =
  "id, clerk_id, email, first_name, last_name, display_name, phone_number, kyc_status, kyc_verified_at, persona_inquiry_id, created_at, updated_at, deleted_at";

export async function getUserByClerkId(
  clerkId: string
): Promise<UserRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("users")
    .select(USER_COLUMNS)
    .eq("clerk_id", clerkId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("getUserByClerkId failed:", error);
    return null;
  }
  return (data as UserRow | null) ?? null;
}

export type UserUpdate = Partial<
  Pick<UserRow, "first_name" | "last_name" | "phone_number" | "display_name">
>;

export async function updateUserByClerkId(
  clerkId: string,
  patch: UserUpdate
): Promise<UserRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("users")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("clerk_id", clerkId)
    .is("deleted_at", null)
    .select(USER_COLUMNS)
    .maybeSingle();

  if (error) {
    console.error("updateUserByClerkId failed:", error);
    return null;
  }
  return (data as UserRow | null) ?? null;
}

// Defensive insert: if the Clerk webhook hasn't created the users row yet
// (rare race with first sign-in), create a minimal row so downstream code can
// proceed. Idempotent — uses upsert on `clerk_id`.
export async function ensureUserRow(
  clerkId: string,
  email: string
): Promise<UserRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("users")
    .upsert(
      { clerk_id: clerkId, email },
      { onConflict: "clerk_id", ignoreDuplicates: false }
    )
    .select(USER_COLUMNS)
    .maybeSingle();

  if (error) {
    console.error("ensureUserRow failed:", error);
    return null;
  }
  return (data as UserRow | null) ?? null;
}
