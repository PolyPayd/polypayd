import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureWalletForUser } from "@/lib/wallet";
import { getStripeServerClient } from "@/lib/stripe";
import { calculateTopupChargeFromWalletCredit } from "@/lib/payments/pricing";
import { buildConnectedWalletTopupPaymentIntentParams } from "@/lib/walletConnectedTopupIntent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateIntentBody = {
  orgId?: string;
  amountGbp?: number;
};

function isUuid(value: string) {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

function parseAndValidateWalletCreditMinor(amount: unknown) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  if (amount < 1 || amount > 100_000) return null;
  const amountMinor = Math.round(amount * 100);
  if (amountMinor < 100) return null;
  return amountMinor;
}

/**
 * Creates a Stripe PaymentIntent for GBP wallet top-up on the user's Connect account (direct charge).
 * Platform keeps processing uplift via application_fee_amount; wallet credit stays metadata-driven.
 */
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const body = (await req.json()) as CreateIntentBody;
    const orgId = String(body.orgId ?? "").trim();
    const walletCreditMinor = parseAndValidateWalletCreditMinor(body.amountGbp);

    if (!orgId) {
      return NextResponse.json({ error: "Missing orgId." }, { status: 400 });
    }
    if (!isUuid(orgId)) {
      return NextResponse.json({ error: "Invalid orgId format." }, { status: 400 });
    }
    if (!walletCreditMinor) {
      return NextResponse.json(
        { error: "Amount must be a valid GBP amount between 1.00 and 100,000.00." },
        { status: 400 }
      );
    }

    let pricing;
    try {
      pricing = calculateTopupChargeFromWalletCredit(walletCreditMinor);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Invalid amount.";
      return NextResponse.json({ error: msg }, { status: 400 });
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

    const { data: connectRow, error: connectErr } = await supabase
      .from("stripe_connect_accounts")
      .select("stripe_account_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (connectErr) {
      console.error("stripe_connect_accounts select failed:", connectErr);
      return NextResponse.json({ error: connectErr.message }, { status: 500 });
    }

    const stripeAccountId = connectRow?.stripe_account_id?.trim();
    if (!stripeAccountId) {
      return NextResponse.json(
        {
          error:
            "A Stripe Connect account is required before adding funds. Complete Connect setup from your wallet.",
          errorCode: "MISSING_CONNECT_ACCOUNT",
        },
        { status: 400 }
      );
    }

    const stripe = getStripeServerClient();
    const account = await stripe.accounts.retrieve(stripeAccountId);
    if (!account.charges_enabled) {
      return NextResponse.json(
        {
          error:
            "Card payments are not enabled on your Stripe account yet. Finish Connect onboarding, then try again.",
          errorCode: "CONNECT_CHARGES_NOT_ENABLED",
        },
        { status: 400 }
      );
    }

    const wallet = await ensureWalletForUser(supabase, userId, "GBP");
    if (!wallet) {
      return NextResponse.json({ error: "Failed to get or create wallet." }, { status: 500 });
    }

    const metadata = {
      clerk_user_id: userId,
      org_id: orgId,
      wallet_id: wallet.id,
      wallet_currency: "GBP",
      currency: "GBP",
      type: "wallet_topup",
      topup_type: "wallet_credit",
      topup_funding_model: "connected",
      stripe_connect_account_id: stripeAccountId,
      wallet_credit_minor: String(pricing.walletCreditMinor),
      platform_fee_minor: String(pricing.platformFeeMinor),
      stripe_cost_estimate_minor: String(pricing.stripeCostEstimateMinor),
      total_charge_minor: String(pricing.totalChargeMinor),
      // Backward compatibility for older webhook parsers (same as stripe_cost_estimate_minor today).
      processing_fee_minor: String(pricing.processingFeeMinor),
    };

    const paymentIntent = await stripe.paymentIntents.create(
      buildConnectedWalletTopupPaymentIntentParams(pricing, metadata),
      { stripeAccount: stripeAccountId }
    );

    if (!paymentIntent.client_secret) {
      return NextResponse.json({ error: "Stripe did not return a client secret." }, { status: 500 });
    }

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      stripeAccountId,
      walletCreditMinor: pricing.walletCreditMinor,
      platformFeeMinor: pricing.platformFeeMinor,
      stripeCostEstimateMinor: pricing.stripeCostEstimateMinor,
      processingFeeMinor: pricing.processingFeeMinor,
      totalChargeMinor: pricing.totalChargeMinor,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
