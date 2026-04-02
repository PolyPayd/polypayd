import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStripeServerClient } from "@/lib/stripe";
import { getStripeConnectRedirectUrls } from "@/lib/stripeConnectServer";
import { ensureStripeExpressAccountForUser } from "@/lib/stripeConnectEnsureAccount";
import { isInvalidConnectAccountForPlatformError } from "@/lib/stripeConnectErrors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OnboardBody = {
  /** Use account_update when the user already completed onboarding but must refresh requirements. */
  linkType?: "account_onboarding" | "account_update";
};

/**
 * Returns a fresh Stripe AccountLink for the user’s Connect account, after validating the stored
 * acct_ id belongs to the current Stripe platform (test/live / correct account).
 */
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as OnboardBody;
    const linkType =
      body.linkType === "account_update" ? ("account_update" as const) : ("account_onboarding" as const);

    const supabase = supabaseAdmin();
    const stripe = getStripeServerClient();
    const { refreshUrl, returnUrl } = getStripeConnectRedirectUrls(req);

    const ensured = await ensureStripeExpressAccountForUser({
      supabase,
      stripe,
      userId,
      secretKey: process.env.STRIPE_SECRET_KEY,
      allowCreate: false,
    });

    if (!ensured.ok) {
      return NextResponse.json(
        { error: ensured.error, ...(ensured.errorCode ? { errorCode: ensured.errorCode } : {}) },
        { status: ensured.status }
      );
    }

    let accountLink;
    try {
      accountLink = await stripe.accountLinks.create({
        account: ensured.stripeAccountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: linkType,
      });
    } catch (linkErr) {
      if (isInvalidConnectAccountForPlatformError(linkErr)) {
        await supabase.from("stripe_connect_accounts").delete().eq("user_id", userId);
        return NextResponse.json(
          {
            error:
              "This Connect account is not valid for the Stripe keys in use (e.g. production account on staging). Use “Connect bank” from the wallet once to create a new connection.",
            errorCode: "STRIPE_CONNECT_ACCOUNT_LINK_REJECTED",
          },
          { status: 409 }
        );
      }
      throw linkErr;
    }

    return NextResponse.json({
      url: accountLink.url,
      stripeAccountId: ensured.stripeAccountId,
      linkType,
      expiresAt: accountLink.expires_at,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/stripe/connect/onboard:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
