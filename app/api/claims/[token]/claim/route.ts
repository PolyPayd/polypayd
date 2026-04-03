import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_RE = /^[0-9a-f]{32,64}$/i;

/**
 * POST /api/claims/[token]/claim
 * Credits the signed-in recipient's PolyPayd wallet from reserved batch liability (no Stripe).
 */
export async function POST(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "You must be signed in to claim." }, { status: 401 });
    }

    const { token: raw } = await ctx.params;
    const token = String(raw ?? "").trim();
    if (!token || !TOKEN_RE.test(token)) {
      return NextResponse.json({ error: "Invalid claim link." }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    const { data, error } = await supabase.rpc("claim_batch_recipient", {
      p_claim_token: token,
      p_actor_clerk_user_id: userId,
    });

    if (error) {
      console.error("claim_batch_recipient RPC error:", error);
      return NextResponse.json({ error: error.message ?? "Claim failed" }, { status: 500 });
    }

    const result = data as {
      ok?: boolean;
      error?: string;
      duplicate?: boolean;
      claim_status?: string;
      batch_claim_id?: string;
      wallet_id?: string;
      credited_amount?: number;
      currency?: string;
      ledger_transaction_id?: string;
      batch_completed?: boolean;
    } | null;

    if (!result?.ok) {
      return NextResponse.json({ error: result?.error ?? "Claim failed" }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      duplicate: Boolean(result.duplicate),
      claimStatus: result.claim_status,
      batchClaimId: result.batch_claim_id,
      walletId: result.wallet_id,
      creditedAmountGbp: result.credited_amount,
      currency: result.currency,
      ledgerTransactionId: result.ledger_transaction_id,
      batchCompleted: Boolean(result.batch_completed),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    console.error("POST /api/claims/[token]/claim:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
