import { NextResponse } from "next/server";
import { headers } from "next/headers";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { isValidPhoneNumber } from "libphonenumber-js";
import { z } from "zod";

import { logAuditEvent } from "@/lib/audit";
import {
  ensureUserRow,
  getUserByClerkId,
  updateUserByClerkId,
} from "@/lib/users";

// Strip bank details from any returned profile — those live in `bank_accounts`.
function publicProfile(user: NonNullable<Awaited<ReturnType<typeof getUserByClerkId>>>) {
  return {
    id: user.id,
    clerk_id: user.clerk_id,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    display_name: user.display_name,
    phone_number: user.phone_number,
    kyc_status: user.kyc_status,
    kyc_verified_at: user.kyc_verified_at,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

async function resolvePrimaryEmail(clerkUserId: string): Promise<string | null> {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(clerkUserId);
    return (
      user.primaryEmailAddress?.emailAddress ??
      user.emailAddresses[0]?.emailAddress ??
      null
    );
  } catch {
    return null;
  }
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let user = await getUserByClerkId(userId);

    // First-run safety net: if Clerk's webhook hasn't yet created the row.
    if (!user) {
      const email = await resolvePrimaryEmail(userId);
      if (email) user = await ensureUserRow(userId, email);
    }

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ user: publicProfile(user) });
  } catch (err) {
    console.error("GET /api/app/me failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

const PatchSchema = z.object({
  first_name: z.string().trim().min(1).max(100).optional(),
  last_name: z.string().trim().min(1).max(100).optional(),
  display_name: z.string().trim().min(1).max(200).optional(),
  phone_number: z
    .string()
    .trim()
    .min(1)
    .refine((v) => isValidPhoneNumber(v), {
      message: "phone_number must be a valid E.164 number",
    })
    .optional(),
});

export async function PATCH(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    let existing = await getUserByClerkId(userId);
    if (!existing) {
      const email = await resolvePrimaryEmail(userId);
      if (email) existing = await ensureUserRow(userId, email);
    }
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const updated = await updateUserByClerkId(userId, parsed.data);
    if (!updated) {
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }

    const headerStore = await headers();
    const ip =
      headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headerStore.get("x-real-ip") ??
      null;

    await logAuditEvent({
      userId: updated.id,
      action: "user.profile_updated",
      entityType: "user",
      entityId: updated.id,
      metadata: { fields: Object.keys(parsed.data) },
      ipAddress: ip,
    });

    return NextResponse.json({ user: publicProfile(updated) });
  } catch (err) {
    console.error("PATCH /api/app/me failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
