export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";

// POST /api/batches/[batchId]/items
// Body: { recipient_name, account_identifier, amount, reference? }
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ batchId: string }> }
) {
  const { userId } = getAuth(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { batchId } = await context.params;

  const body = await req.json();
  const {
    recipient_name,
    account_identifier,
    amount,
    reference,
  }: {
    recipient_name?: string;
    account_identifier?: string;
    amount?: number;
    reference?: string;
  } = body ?? {};

  if (
    !recipient_name ||
    !account_identifier ||
    typeof amount !== "number" ||
    !isFinite(amount)
  ) {
    return NextResponse.json(
      { error: "Invalid payload" },
      { status: 400 }
    );
  }

  const { data: batch, error: batchErr } = await supabaseAdmin()
    .from("batches")
    .select("id, org_id")
    .eq("id", batchId)
    .single();

  if (batchErr || !batch) {
    return NextResponse.json(
      { error: "Batch not found" },
      { status: 404 }
    );
  }

  const { data: membership } = await supabaseAdmin()
    .from("org_members")
    .select("*")
    .eq("org_id", batch.org_id)
    .eq("clerk_user_id", userId)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const { data: item, error: itemErr } = await supabaseAdmin()
    .from("batch_items")
    .insert({
      batch_id: batch.id,
      recipient_name,
      account_identifier,
      amount,
      reference: reference ?? null,
      status: "pending",
    })
    .select("*")
    .single();

  if (itemErr || !item) {
    return NextResponse.json(
      { error: itemErr?.message ?? "Failed to create item" },
      { status: 400 }
    );
  }

  const {
    data: allItems,
    error: itemsErr,
    count,
  } = await supabaseAdmin()
    .from("batch_items")
    .select("amount", { count: "exact" })
    .eq("batch_id", batch.id);

  if (itemsErr) {
    return NextResponse.json(
      { error: itemsErr.message },
      { status: 400 }
    );
  }

  const totalAmount = (allItems ?? []).reduce((sum, row) => {
    const value =
      typeof (row as { amount?: number | string }).amount === "number"
        ? (row as { amount?: number }).amount!
        : Number((row as { amount?: number | string }).amount ?? 0);
    return sum + (isFinite(value) ? value : 0);
  }, 0);
  const recipientCount = count ?? (allItems?.length ?? 0);

  const { error: updateErr } = await supabaseAdmin()
    .from("batches")
    .update({
      total_amount: totalAmount,
      recipient_count: recipientCount,
    })
    .eq("id", batch.id);

  if (updateErr) {
    return NextResponse.json(
      { error: updateErr.message },
      { status: 400 }
    );
  }

  return NextResponse.json({ item });
}

