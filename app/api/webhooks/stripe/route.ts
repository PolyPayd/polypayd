import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStripeServerClient } from "@/lib/stripe";
import { applyStripeWalletTopupFromPaymentIntent } from "@/lib/stripeWalletTopupApply";
import {
  applyStripeBalanceAvailableFromEvent,
  sumGbpAvailableMinor,
} from "@/lib/stripeBalanceAvailableApply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEBHOOK_DEBUG = process.env.POLYPAYD_STRIPE_WEBHOOK_DEBUG === "1";

type VerifiedWith = "STRIPE_WEBHOOK_SECRET" | "STRIPE_WEBHOOK_SECRET_CONNECT";

/**
 * IMPORTANT (Next.js App Router):
 * - Verify signatures using the raw request body (use `await req.text()` exactly once).
 * - Do NOT call `req.json()` before verification.
 */
function verifyStripeEvent(opts: {
  stripe: Stripe;
  rawBody: string;
  signature: string;
}): { event: Stripe.Event; verifiedWith: VerifiedWith } {
  const primary = process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
  const connect = process.env.STRIPE_WEBHOOK_SECRET_CONNECT?.trim() ?? "";

  if (!primary) {
    throw new Error("Missing STRIPE_WEBHOOK_SECRET");
  }

  if (WEBHOOK_DEBUG) {
    console.info("[stripe webhook] signature header exists: true", {
      attempt: { primary: true, connect: Boolean(connect) },
    });
  }

  try {
    const event = opts.stripe.webhooks.constructEvent(opts.rawBody, opts.signature, primary);
    return { event, verifiedWith: "STRIPE_WEBHOOK_SECRET" };
  } catch (primaryErr) {
    if (WEBHOOK_DEBUG) {
      const msg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      console.warn("[stripe webhook] signature verification failed (primary secret):", msg);
    }

    if (connect && connect !== primary) {
      const event = opts.stripe.webhooks.constructEvent(opts.rawBody, opts.signature, connect);
      return { event, verifiedWith: "STRIPE_WEBHOOK_SECRET_CONNECT" };
    }

    throw primaryErr;
  }
}

export async function POST(req: Request) {
  try {
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      if (WEBHOOK_DEBUG) {
        console.info("[stripe webhook] signature header exists: false");
      }
      return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
    }

    // Raw body is critical for webhook signature verification.
    const rawBody = await req.text();
    const stripe = getStripeServerClient();

    let event: Stripe.Event;
    let verifiedWith: VerifiedWith;
    try {
      const verified = verifyStripeEvent({ stripe, rawBody, signature });
      event = verified.event;
      verifiedWith = verified.verifiedWith;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Invalid signature";
      if (WEBHOOK_DEBUG) {
        console.error("[stripe webhook] verification failed (all secrets):", message);
      }
      return NextResponse.json({ error: message }, { status: 400 });
    }

    if (WEBHOOK_DEBUG) {
      console.info("[stripe webhook] signature verified", {
        verifiedWith,
        eventType: event.type,
        eventAccount: typeof event.account === "string" ? event.account : null,
      });
    }

    const supabase = supabaseAdmin();

    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const connectAcct =
        typeof event.account === "string" && event.account.startsWith("acct_")
          ? event.account
          : null;

      const { data, error } = await applyStripeWalletTopupFromPaymentIntent(
        supabase,
        paymentIntent,
        event.id,
        event.type,
        event.livemode,
        connectAcct
      );

      if (error) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }

      return NextResponse.json({ received: true, result: data }, { status: 200 });
    }

    if (event.type === "balance.available") {
      const balanceEvent = event as Stripe.BalanceAvailableEvent;
      const availableGbpMinor = sumGbpAvailableMinor(balanceEvent.data.object);

      const { data, error } = await applyStripeBalanceAvailableFromEvent(supabase, balanceEvent);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }

      // Kept lightweight: applyStripeBalanceAvailableFromEvent already ensures idempotency.
      return NextResponse.json({ received: true, result: data }, { status: 200 });
    }

    return NextResponse.json({ received: true, ignored: true }, { status: 200 });
  } catch (error) {
    console.error("Unhandled Stripe webhook error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
