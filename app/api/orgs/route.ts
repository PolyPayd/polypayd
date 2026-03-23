export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  const { userId } = getAuth(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await req.json();
  if (!name || name.length < 2) {
    return NextResponse.json({ error: "Org name too short" }, { status: 400 });
  }

  const { data: org, error: orgErr } = await supabaseAdmin()
    .from("organizations")
    .insert({ name, owner_clerk_user_id: userId })
    .select("*")
    .single();

  if (orgErr) return NextResponse.json({ error: orgErr.message }, { status: 400 });

  const { error: memErr } = await supabaseAdmin().from("org_members").insert({
    org_id: org.id,
    clerk_user_id: userId,
    role: "owner",
  });

  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 400 });

  return NextResponse.json({ org });
}

export async function GET(req: NextRequest) {
  const { userId } = getAuth(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin()
    .from("org_members")
    .select("role, organizations:org_id(id, name, created_at)")
    .eq("clerk_user_id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const orgs = (data ?? []).map((row: any) => ({
    role: row.role,
    ...row.organizations,
  }));

  return NextResponse.json({ orgs });
}