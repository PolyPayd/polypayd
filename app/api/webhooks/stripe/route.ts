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

/**
 * Each Stripe webhook *endpoint* has its own signing secret. Platform vs Connect *destination*
 * endpoints often use different `whsec_...` values. Try primary then optional Connect secret.
 */
function constructWebhookEvent(
  stripe: Stripe,
  rawBody: string,
  signature: string
): { event: Stripe.Event; verifiedWith: "STRIPE_WEBHOOK_SECRET" | "STRIPE_WEBHOOK_SECRET_CONNECT" } {
  const primary = process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
  const connectSecret = process.env.STRIPE_WEBHOOK_SECRET_CONNECT?.trim() ?? "";

  if (!primary) {
    throw new Error("Missing STRIPE_WEBHOOK_SECRET");
  }

  try {
    const event = stripe.webhooks.constructEvent(rawBody, signature, primary);
    return { event, verifiedWith: "STRIPE_WEBHOOK_SECRET" };
  } catch (primaryErr) {
    const msg1 = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
    console.error("[stripe webhook] signature verification failed with STRIPE_WEBHOOK_SECRET:", msg1);

    if (connectSecret && connectSecret !== primary) {
      try {
        const event = stripe.webhooks.constructEvent(rawBody, signature, connectSecret);
        console.warn(
          "[stripe webhook] signature OK with STRIPE_WEBHOOK_SECRET_CONNECT — set STRIPE_WEBHOOK_SECRET to this value for this endpoint, or use both env vars"
        );
        return { event, verifiedWith: "STRIPE_WEBHOOK_SECRET_CONNECT" };
      } catch (connectErr) {
        const msg2 = connectErr instanceof Error ? connectErr.message : String(connectErr);
        console.error("[stripe webhook] signature verification failed with STRIPE_WEBHOOK_SECRET_CONNECT:", msg2);
        throw primaryErr;
      }
    }

    throw primaryErr;
  }
}

/**
 * Stripe webhook: wallet top-ups (`payment_intent.succeeded`) and platform `balance.available`.
 * Top-up credits use PaymentIntent metadata (wallet_credit_minor). Connected-account top-ups use
 * immediate release in apply_stripe_wallet_topup (no platform balance tick). Platform balance.available
 * still releases legacy platform-created top-ups that remain in the queue.
 */
export async function POST(req: Request) {
  try {
    if (!process.env.STRIPE_WEBHOOK_SECRET?.trim()) {
      console.error("[stripe webhook] missing STRIPE_WEBHOOK_SECRET");
      return NextResponse.json({ error: "Missing STRIPE_WEBHOOK_SECRET" }, { status: 500 });
    }

    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      console.error("[stripe webhook] missing stripe-signature header");
      return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
    }

    const rawBody = await req.text();
    const stripe = getStripeServerClient();

    let event: Stripe.Event;
    let verifiedWith: string | undefined;
    try {
      const built = constructWebhookEvent(stripe, rawBody, signature);
      event = built.event;
      verifiedWith = built.verifiedWith;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid signature";
      console.error("[stripe webhook] signature verification failed (all secrets exhausted):", message);
      return NextResponse.json({ error: message }, { status: 400 });
    }

    console.info("[stripe webhook] signature verified", { verifiedWith, eventType: event.type });

    if (WEBHOOK_DEBUG) {
      console.info("[stripe webhook] event received", {
        verifiedWith,
        eventType: event.type,
        eventId: event.id,
        livemode: event.livemode,
        eventAccount: typeof event.account === "string" ? event.account : null,
      });
    }

    const supabase = supabaseAdmin();

    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const connectAcct =
        typeof event.account === "string" && event.account.startsWith("acct_") ? event.account : null;

      {
        const md = paymentIntent.metadata ?? {};
        console.info("[stripe webhook] payment_intent.succeeded", {
          verifiedWith,
          eventType: event.type,
          paymentIntentId: paymentIntent.id,
          eventAccount: connectAcct,
          amount: paymentIntent.amount,
          amountReceived: paymentIntent.amount_received,
          amountCapturable: paymentIntent.amount_capturable,
          application_fee_amount: paymentIntent.application_fee_amount,
          wallet_credit_minor: md.wallet_credit_minor,
          total_charge_minor: md.total_charge_minor,
          stripe_connect_account_id: md.stripe_connect_account_id,
          topup_funding_model: md.topup_funding_model,
          note:
            "Wallet validation compares metadata.total_charge_minor to paymentIntent.amount (gross), not amount_received (often net on Connect).",
          ...(WEBHOOK_DEBUG ? { eventId: event.id, livemode: event.livemode } : {}),
        });
      }

      let applyResult: Awaited<ReturnType<typeof applyStripeWalletTopupFromPaymentIntent>>;
      try {
        applyResult = await applyStripeWalletTopupFromPaymentIntent(
          supabase,
          paymentIntent,
          event.id,
          event.type,
          event.livemode,
          connectAcct
        );
      } catch (applyThrow) {
        const m = applyThrow instanceof Error ? applyThrow.message : String(applyThrow);
        console.error("[stripe webhook] applyStripeWalletTopupFromPaymentIntent threw:", m, applyThrow);
        return NextResponse.json({ error: m }, { status: 500 });
      }

      const { data, error } = applyResult;

      if (error) {
        console.error("[stripe webhook] apply_stripe_wallet_topup rejected:", {
          status: error.status,
          message: error.message,
          eventId: event.id,
          paymentIntentId: paymentIntent.id,
          eventAccount: connectAcct,
          httpStatusReturnedToStripe: error.status,
        });
        return NextResponse.json({ error: error.message }, { status: error.status });
      }

      console.info("[stripe webhook] apply_stripe_wallet_topup success", {
        paymentIntentId: paymentIntent.id,
        eventAccount: connectAcct,
        rpcData: data,
      });

      return NextResponse.json({ received: true, result: data }, { status: 200 });
    }

    if (event.type === "balance.available") {
      const balanceEvent = event as Stripe.BalanceAvailableEvent;
      const availableGbpMinor = sumGbpAvailableMinor(balanceEvent.data.object);

      const { data, error } = await applyStripeBalanceAvailableFromEvent(supabase, balanceEvent);

      if (error) {
        console.error("[stripe webhook] balance.available", {
          success: false,
          eventId: event.id,
          livemode: event.livemode,
          availableGbpMinor,
          rpcResult: null,
          rpcError: error.message,
        });

        const { error: auditErr } = await supabase.from("audit_events").insert({
          org_id: null,
          batch_id: null,
          actor_user_id: null,
          event_type: "stripe_balance_available_processed",
          event_data: {
            stripe_event_id: event.id,
            livemode: event.livemode,
            available_gbp_minor: availableGbpMinor,
            rpc_result: { ok: false, error: error.message },
          },
        });
        if (auditErr) {
          console.error("audit_events stripe_balance_available_processed insert failed:", auditErr);
        }

        return NextResponse.json({ error: error.message }, { status: error.status });
      }

      const rpcResult = data as Record<string, unknown> | null;
      console.info("[stripe webhook] balance.available", {
        success: true,
        eventId: event.id,
        livemode: event.livemode,
        availableGbpMinor,
        rpcResult,
      });

      const { error: auditErr } = await supabase.from("audit_events").insert({
        org_id: null,
        batch_id: null,
        actor_user_id: null,
        event_type: "stripe_balance_available_processed",
        event_data: {
          stripe_event_id: event.id,
          livemode: event.livemode,
          available_gbp_minor: availableGbpMinor,
          rpc_result: rpcResult ?? null,
        },
      });
      if (auditErr) {
        console.error("audit_events stripe_balance_available_processed insert failed:", auditErr);
      }

      return NextResponse.json({ received: true, result: data }, { status: 200 });
    }

    return NextResponse.json({ received: true, ignored: true }, { status: 200 });
  } catch (error) {
    console.error("Unhandled Stripe webhook error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
