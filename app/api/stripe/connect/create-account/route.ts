import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStripeServerClient } from "@/lib/stripe";
import { getStripeConnectRedirectUrls } from "@/lib/stripeConnectServer";
import { isStripeSecretKeyTestMode } from "@/lib/stripeConnectTestPrefill";
import { ensureStripeExpressAccountForUser } from "@/lib/stripeConnectEnsureAccount";
import { isInvalidConnectAccountForPlatformError } from "@/lib/stripeConnectErrors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ensures a Stripe Express Connect account exists for this user on the **current** Stripe platform
 * (test vs live / correct Stripe account), then returns an AccountLink for onboarding.
 * Replaces DB rows that point at acct_ ids from another environment or platform.
 */
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const supabase = supabaseAdmin();
    const stripe = getStripeServerClient();
    const { refreshUrl, returnUrl } = getStripeConnectRedirectUrls(req);

    let testPrefillEmail: string | null | undefined;
    if (isStripeSecretKeyTestMode(process.env.STRIPE_SECRET_KEY)) {
      const u = await currentUser();
      testPrefillEmail =
        u?.primaryEmailAddress?.emailAddress ?? u?.emailAddresses?.[0]?.emailAddress ?? null;
    }

    const ensured = await ensureStripeExpressAccountForUser({
      supabase,
      stripe,
      userId,
      secretKey: process.env.STRIPE_SECRET_KEY,
      allowCreate: true,
      testPrefillEmail,
    });

    if (!ensured.ok) {
      return NextResponse.json(
        { error: ensured.error, ...(ensured.errorCode ? { errorCode: ensured.errorCode } : {}) },
        { status: ensured.status }
      );
    }

    let accountLink: Awaited<ReturnType<typeof stripe.accountLinks.create>>;
    let stripeAccountId = ensured.stripeAccountId;
    let replacedStale = ensured.replacedStaleRow;
    let createdNew = ensured.createdNew;

    try {
      accountLink = await stripe.accountLinks.create({
        account: stripeAccountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: "account_onboarding",
      });
    } catch (linkErr) {
      if (!isInvalidConnectAccountForPlatformError(linkErr)) {
        throw linkErr;
      }
      await supabase.from("stripe_connect_accounts").delete().eq("user_id", userId);
      console.warn("[stripe connect] accountLinks.create rejected acct; recreating Connect account", {
        userId,
        stripeAccountId,
      });

      const retry = await ensureStripeExpressAccountForUser({
        supabase,
        stripe,
        userId,
        secretKey: process.env.STRIPE_SECRET_KEY,
        allowCreate: true,
        testPrefillEmail,
      });
      if (!retry.ok) {
        return NextResponse.json(
          { error: retry.error, ...(retry.errorCode ? { errorCode: retry.errorCode } : {}) },
          { status: retry.status }
        );
      }
      stripeAccountId = retry.stripeAccountId;
      replacedStale = replacedStale || retry.replacedStaleRow;
      createdNew = createdNew || retry.createdNew;
      accountLink = await stripe.accountLinks.create({
        account: stripeAccountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: "account_onboarding",
      });
    }

    return NextResponse.json({
      url: accountLink.url,
      stripeAccountId,
      expiresAt: accountLink.expires_at,
      replacedStaleConnectAccount: replacedStale,
      createdNewConnectAccount: createdNew,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/stripe/connect/create-account:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
