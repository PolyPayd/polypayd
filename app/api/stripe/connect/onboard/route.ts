import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStripeServerClient } from "@/lib/stripe";
import { getStripeConnectRedirectUrls } from "@/lib/stripeConnectServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OnboardBody = {
  /** Use account_update when the user already completed onboarding but must refresh requirements. */
  linkType?: "account_onboarding" | "account_update";
};

/**
 * Returns a fresh Stripe AccountLink for an existing Connect account (onboarding or update).
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
    const { data: row, error: selErr } = await supabase
      .from("stripe_connect_accounts")
      .select("stripe_account_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (selErr) {
      console.error("stripe_connect_accounts select failed:", selErr);
      return NextResponse.json({ error: selErr.message }, { status: 500 });
    }

    if (!row?.stripe_account_id) {
      return NextResponse.json(
        { error: "No Connect account yet. Call POST /api/stripe/connect/create-account first." },
        { status: 400 }
      );
    }

    const stripe = getStripeServerClient();
    const { refreshUrl, returnUrl } = getStripeConnectRedirectUrls(req);

    const accountLink = await stripe.accountLinks.create({
      account: row.stripe_account_id,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: linkType,
    });

    return NextResponse.json({
      url: accountLink.url,
      stripeAccountId: row.stripe_account_id,
      linkType,
      expiresAt: accountLink.expires_at,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/stripe/connect/onboard:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
