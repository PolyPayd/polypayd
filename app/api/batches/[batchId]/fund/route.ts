import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isBatchStatusFundableFromWallet } from "@/lib/batchClaimableFunding";
import {
  BATCH_FUND_INSUFFICIENT_WALLET,
  sanitizeFundBatchErrorForUser,
  userMessageForFundBatchRpcResultError,
} from "@/lib/batchFundUserFacing";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FundBody = {
  orgId?: string;
};

function isUuid(value: string) {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * POST /api/batches/[batchId]/fund
 * Debits the batch funder's wallet, reserves principal on the system liability wallet, takes platform fee.
 * Idempotent via Supabase RPC (ledger key batch-fund-<batch_id>).
 */
export async function POST(req: Request, ctx: { params: Promise<{ batchId: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const { batchId } = await ctx.params;
    if (!batchId || !isUuid(batchId)) {
      return NextResponse.json({ error: "Invalid batch id." }, { status: 400 });
    }

    const body = (await req.json()) as FundBody;
    const orgId = String(body.orgId ?? "").trim();
    if (!orgId || !isUuid(orgId)) {
      return NextResponse.json({ error: "Missing or invalid orgId." }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    const { data: membership } = await supabase
      .from("org_members")
      .select("role")
      .eq("org_id", orgId)
      .eq("clerk_user_id", userId)
      .maybeSingle();

    const role = membership?.role ?? null;
    if (role !== "owner" && role !== "operator") {
      return NextResponse.json({ error: "You do not have permission to fund this batch." }, { status: 403 });
    }

    const { data: batchRow } = await supabase
      .from("batches")
      .select("id, org_id, batch_type, status, allocations_locked_at")
      .eq("id", batchId)
      .maybeSingle();

    if (!batchRow || batchRow.org_id !== orgId) {
      return NextResponse.json({ error: "Batch not found." }, { status: 404 });
    }

    if ((batchRow.batch_type ?? "").toLowerCase() !== "claimable") {
      return NextResponse.json(
        { error: userMessageForFundBatchRpcResultError("Only claimable batches can be funded this way") },
        { status: 400 }
      );
    }

    if (batchRow.allocations_locked_at == null) {
      return NextResponse.json(
        { error: userMessageForFundBatchRpcResultError("Allocations must be finalized before funding") },
        { status: 400 }
      );
    }

    const rowStatus = String(batchRow.status ?? "").toLowerCase();
    if (
      rowStatus === "completed" ||
      rowStatus === "completed_with_errors" ||
      rowStatus === "failed"
    ) {
      return NextResponse.json(
        { error: userMessageForFundBatchRpcResultError("Batch is not in a fundable state") },
        { status: 400 }
      );
    }
    const allowRpcForReservePhase = rowStatus === "funded" || rowStatus === "claiming";
    if (!isBatchStatusFundableFromWallet(rowStatus) && !allowRpcForReservePhase) {
      return NextResponse.json(
        { error: userMessageForFundBatchRpcResultError("Batch is not in a fundable state") },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc("fund_batch_from_wallet", {
      p_batch_id: batchId,
      p_actor_clerk_user_id: userId,
    });

    if (error) {
      const raw = error.message ?? "";
      console.error("fund_batch_from_wallet RPC error (sanitized for client):", {
        raw,
        code: (error as { code?: string }).code,
        details: (error as { details?: string }).details,
        hint: (error as { hint?: string }).hint,
      });
      const userMsg = sanitizeFundBatchErrorForUser(raw);
      const status = userMsg === BATCH_FUND_INSUFFICIENT_WALLET ? 400 : 500;
      return NextResponse.json({ error: userMsg }, { status });
    }

    const result = data as {
      ok?: boolean;
      error?: string;
      already_funded?: boolean;
      ledger_transaction_id?: string;
      batch_id?: string;
      platform_fee?: number;
      fee_bps?: number;
      impact_amount?: number;
      recipient_count?: number;
    } | null;

    if (!result?.ok) {
      const userMsg = userMessageForFundBatchRpcResultError(result?.error ?? null);
      return NextResponse.json({ error: userMsg }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      alreadyFunded: Boolean(result.already_funded),
      ledgerTransactionId: result.ledger_transaction_id,
      batchId: result.batch_id,
      platformFeeGbp: result.platform_fee,
      feeBps: result.fee_bps,
      impactAmountGbp: result.impact_amount,
      recipientCount: result.recipient_count,
    });
  } catch (e) {
    console.error("POST /api/batches/[batchId]/fund:", e);
    return NextResponse.json(
      { error: sanitizeFundBatchErrorForUser(e instanceof Error ? e.message : null) },
      { status: 500 }
    );
  }
}
