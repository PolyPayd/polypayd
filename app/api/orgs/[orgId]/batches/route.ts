export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(
    req: NextRequest,
    context: { params: Promise<{ orgId: string }> }
  ) {
    const { userId } = getAuth(req);
    if (!userId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
    const { orgId: orgIdRaw } = await context.params;
    const orgId = decodeURIComponent(orgIdRaw).trim();
    
    
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    
    if (!uuidRegex.test(orgId)) {
      return NextResponse.json(
        { error: "Invalid orgId", orgId },
        { status: 400 }
      );
    }
  
    const { data: membership, error: memErr } = await supabaseAdmin()
      .from("org_members")
      .select("id, org_id, clerk_user_id, role")
      .eq("org_id", orgId)
      .eq("clerk_user_id", userId)
      .maybeSingle();
  
    if (!membership)
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
  
    const { name } = await req.json();
  
    const { data: batch, error } = await supabaseAdmin()
      .from("batches")
      .insert({ org_id: orgId, name, created_by: userId, currency: "GBP", status: "draft" })
      .select("*")
      .single();
  
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  
    return NextResponse.json({ batch });
  }

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ orgId: string }> }
) {
  const { userId } = getAuth(req);
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await context.params;

  // Confirm membership
  const { data: membership } = await supabaseAdmin()
    .from("org_members")
    .select("*")
    .eq("org_id", orgId)
    .eq("clerk_user_id", userId)
    .single();

  if (!membership)
    return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const { data, error } = await supabaseAdmin()
    .from("batches")
    .select("*")
    .eq("org_id", orgId);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ batches: data });
}