import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  splitFullNameForClerk,
  validateAddressPart,
  validateFullName,
  validatePhone,
} from "@/lib/profileFieldValidation";
import { ensureUserProfileRow, getUserProfileRow, type UserProfileRow } from "@/lib/userProfile";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

async function persistProfilePatch(
  userId: string,
  patch: Record<string, string | null>
): Promise<{ data: UserProfileRow | null; error: string | null }> {
  const supabase = supabaseAdmin();
  const updated_at = new Date().toISOString();
  const payload = { ...patch, updated_at };

  const { data: exists } = await supabase
    .from("profiles")
    .select("clerk_user_id")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (exists) {
    const { data, error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("clerk_user_id", userId)
      .select(
        "clerk_user_id, email, full_name, phone, address_line_1, address_line_2, city, postcode, country, avatar_url, updated_at"
      )
      .single();
    if (error) return { data: null, error: error.message };
    return { data: data as UserProfileRow, error: null };
  }

  const { data, error } = await supabase
    .from("profiles")
    .insert({ clerk_user_id: userId, email: null, ...payload })
    .select(
      "clerk_user_id, email, full_name, phone, address_line_1, address_line_2, city, postcode, country, avatar_url, updated_at"
    )
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as UserProfileRow, error: null };
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await currentUser();
  const supabase = supabaseAdmin();
  await ensureUserProfileRow(
    supabase,
    userId,
    user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? null
  );

  const profile = await getUserProfileRow(supabase, userId);

  return NextResponse.json({
    profile,
    clerkImageUrl: user?.imageUrl ?? null,
  });
}

export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const updates: Record<string, string | null> = {};

  if ("fullName" in b) {
    if (typeof b.fullName !== "string") {
      return NextResponse.json({ error: "Invalid fullName" }, { status: 400 });
    }
    const v = validateFullName(b.fullName);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    const { firstName, lastName } = splitFullNameForClerk(v.value);
    const client = await clerkClient();
    await client.users.updateUser(userId, { firstName, lastName });
    updates.full_name = v.value;
  }

  if ("phone" in b) {
    if (typeof b.phone !== "string") {
      return NextResponse.json({ error: "Invalid phone" }, { status: 400 });
    }
    const v = validatePhone(b.phone);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    updates.phone = v.value || null;
  }

  if ("address" in b && b.address !== null && b.address !== undefined) {
    if (typeof b.address !== "object") {
      return NextResponse.json({ error: "Invalid address" }, { status: 400 });
    }
    const a = b.address as Record<string, unknown>;
    const fields: [string, string, string][] = [
      ["line1", "address_line_1", "Address line 1"],
      ["line2", "address_line_2", "Address line 2"],
      ["city", "city", "City"],
      ["postcode", "postcode", "Postcode"],
      ["country", "country", "Country"],
    ];
    for (const [jsonKey, col, label] of fields) {
      if (!(jsonKey in a)) {
        return NextResponse.json({ error: `Missing address.${jsonKey}` }, { status: 400 });
      }
      if (typeof a[jsonKey] !== "string") {
        return NextResponse.json({ error: `Invalid address.${jsonKey}` }, { status: 400 });
      }
      const v = validateAddressPart(a[jsonKey] as string, label, 200);
      if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
      updates[col] = v.value || null;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await persistProfilePatch(userId, updates);
  if (error) return NextResponse.json({ error }, { status: 500 });

  return NextResponse.json({ profile: data });
}
