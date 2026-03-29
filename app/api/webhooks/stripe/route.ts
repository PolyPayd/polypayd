import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStripeServerClient } from "@/lib/stripe";
import { applyStripeWalletTopupFromPaymentIntent } from "@/lib/stripeWalletTopupApply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook endpoint for wallet funding.
 * Verifies signature and applies credit idempotently in Supabase.
 */
export async function POST(req: Request) {
  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("Stripe webhook error: missing STRIPE_WEBHOOK_SECRET");
      return NextResponse.json({ error: "Missing STRIPE_WEBHOOK_SECRET" }, { status: 500 });
    }

    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      console.error("Stripe webhook error: missing stripe-signature header");
      return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
    }

    const rawBody = await req.text();
    const stripe = getStripeServerClient();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (error) {
      console.error("Stripe webhook signature verification failed:", error);
      const message = error instanceof Error ? error.message : "Invalid signature";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    // Ignore all other event types gracefully.
    if (event.type !== "payment_intent.succeeded") {
      return NextResponse.json({ received: true, ignored: true }, { status: 200 });
    }

    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const supabase = supabaseAdmin();

    const { data, error } = await applyStripeWalletTopupFromPaymentIntent(
      supabase,
      paymentIntent,
      event.id,
      event.type,
      event.livemode
    );

    if (error) {
      console.error("SUPABASE RPC ERROR apply_stripe_wallet_topup:", {
        error,
        eventId: event.id,
        paymentIntentId: paymentIntent.id,
      });
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ received: true, result: data }, { status: 200 });
  } catch (error) {
    console.error("Unhandled Stripe webhook error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
