import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStripeServerClient } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isUuid(value: string) {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

function getTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

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
    const currency = (paymentIntent.currency || "").toUpperCase();
    const amountMinor = paymentIntent.amount_received ?? paymentIntent.amount ?? 0;
    const metadata = paymentIntent.metadata ?? {};

    const userId = getTrimmedString(metadata.clerk_user_id);
    const orgId = getTrimmedString(metadata.org_id);
    const walletId = getTrimmedString(metadata.wallet_id);
    const walletCurrency = getTrimmedString(metadata.wallet_currency)?.toUpperCase() ?? "";

    if (!paymentIntent.id || !userId || !orgId || !walletId) {
      console.error("Stripe webhook validation failed: missing required metadata", {
        paymentIntentId: paymentIntent.id ?? null,
        hasUserId: Boolean(userId),
        hasOrgId: Boolean(orgId),
        hasWalletId: Boolean(walletId),
      });
      return NextResponse.json({ error: "Missing required PaymentIntent metadata." }, { status: 400 });
    }

    if (!isUuid(orgId)) {
      console.error("Stripe webhook validation failed: invalid org_id UUID", { orgId });
      return NextResponse.json({ error: "Invalid org_id in PaymentIntent metadata." }, { status: 400 });
    }

    if (!isUuid(walletId)) {
      console.error("Stripe webhook validation failed: invalid wallet_id UUID", { walletId });
      return NextResponse.json({ error: "Invalid wallet_id in PaymentIntent metadata." }, { status: 400 });
    }

    if (currency !== "GBP" || walletCurrency !== "GBP") {
      console.error("Stripe webhook validation failed: unsupported currency", {
        paymentIntentCurrency: currency,
        walletCurrency,
      });
      return NextResponse.json({ error: "Only GBP wallet top-ups are supported." }, { status: 400 });
    }

    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      console.error("Stripe webhook validation failed: invalid top-up amount", { amountMinor });
      return NextResponse.json({ error: "Invalid top-up amount." }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    // One SQL function applies all DB writes atomically and idempotently.
    const { data, error } = await supabase.rpc("apply_stripe_wallet_topup", {
      p_stripe_event_id: event.id,
      p_payment_intent_id: paymentIntent.id,
      p_wallet_id: walletId,
      p_user_id: userId,
      p_org_id: orgId,
      p_amount_minor: amountMinor,
      p_currency: "GBP",
      p_event_type: event.type,
      p_livemode: event.livemode,
    });

    if (error) {
      console.error("SUPABASE RPC ERROR apply_stripe_wallet_topup:", {
        error,
        eventId: event.id,
        paymentIntentId: paymentIntent.id,
        orgId,
        walletId,
        userId,
        amountMinor,
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ received: true, result: data }, { status: 200 });
  } catch (error) {
    console.error("Unhandled Stripe webhook error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
