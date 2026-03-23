export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function escapeCsvValue(value: string | number | null | undefined): string {
  const s = String(value ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ orgId: string; batchId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orgId, batchId } = await context.params;

  const supabase = supabaseAdmin();

  const { data: membership } = await supabase
    .from("org_members")
    .select("id")
    .eq("org_id", orgId)
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const { data: batch } = await supabase
    .from("batches")
    .select("id, org_id")
    .eq("id", batchId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }

  const { data: rows, error } = await supabase
    .from("batch_items")
    .select("recipient_name, account_identifier, amount, reference, status, failure_reason")
    .eq("batch_id", batchId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const headers = ["recipient", "account", "amount", "reference", "status", "failure_reason"];
  const lines = [headers.join(",")];

  for (const row of rows ?? []) {
    const recipient = escapeCsvValue(row.recipient_name);
    const account = escapeCsvValue(row.account_identifier);
    const amount = escapeCsvValue(row.amount);
    const reference = escapeCsvValue(row.reference);
    const status = escapeCsvValue(row.status);
    const failure_reason = escapeCsvValue(row.failure_reason);
    lines.push([recipient, account, amount, reference, status, failure_reason].join(","));
  }

  const csv = lines.join("\n");
  const filename = `batch-${batchId}-results.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
