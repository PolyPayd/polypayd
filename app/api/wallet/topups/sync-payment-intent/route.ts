import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStripeServerClient } from "@/lib/stripe";
import { applyStripeWalletTopupFromPaymentIntent } from "@/lib/stripeWalletTopupApply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  paymentIntentId?: string;
};

/**
 * Applies a succeeded wallet top-up using the PaymentIntent (same RPC as the webhook).
 * Use on localhost when Stripe cannot POST to /api/webhooks/stripe. Idempotent with webhooks.
 */
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const body = (await req.json()) as Body;
    const paymentIntentId = String(body.paymentIntentId ?? "").trim();
    if (!paymentIntentId) {
      return NextResponse.json({ error: "Missing paymentIntentId." }, { status: 400 });
    }

    const stripe = getStripeServerClient();
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== "succeeded") {
      return NextResponse.json(
        { error: `Payment is not complete yet (status: ${paymentIntent.status}).` },
        { status: 400 }
      );
    }

    const metaUser = paymentIntent.metadata?.clerk_user_id?.trim();
    if (metaUser !== userId) {
      return NextResponse.json({ error: "This payment does not belong to your account." }, { status: 403 });
    }

    const orgId = paymentIntent.metadata?.org_id?.trim();
    if (!orgId) {
      return NextResponse.json({ error: "Missing org on payment metadata." }, { status: 400 });
    }

    const supabase = supabaseAdmin();
    const { data: membership } = await supabase
      .from("org_members")
      .select("id")
      .eq("org_id", orgId)
      .eq("clerk_user_id", userId)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: "You do not have access to this organisation." }, { status: 403 });
    }

    const syntheticEventId = `client_sync:${paymentIntentId}`;
    const { data, error } = await applyStripeWalletTopupFromPaymentIntent(
      supabase,
      paymentIntent,
      syntheticEventId,
      "payment_intent.succeeded",
      paymentIntent.livemode
    );

    if (error) {
      console.error("sync-payment-intent applyStripeWalletTopupFromPaymentIntent:", error);
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ ok: true, result: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    console.error("POST /api/wallet/topups/sync-payment-intent:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
