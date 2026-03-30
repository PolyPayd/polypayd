import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStripeServerClient } from "@/lib/stripe";
import { getStripeConnectRedirectUrls } from "@/lib/stripeConnectServer";
import {
  getStripeConnectTestCreatePrefill,
  isStripeSecretKeyTestMode,
} from "@/lib/stripeConnectTestPrefill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Creates (if needed) a Stripe Express Connect account, persists stripe_account_id for the user,
 * and returns an AccountLink for onboarding.
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

    let stripeAccountId: string;

    const { data: existing, error: selErr } = await supabase
      .from("stripe_connect_accounts")
      .select("stripe_account_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (selErr) {
      console.error("stripe_connect_accounts select failed:", selErr);
      return NextResponse.json({ error: selErr.message }, { status: 500 });
    }

    if (existing?.stripe_account_id) {
      stripeAccountId = existing.stripe_account_id;
    } else {
      const useTestPrefill = isStripeSecretKeyTestMode(process.env.STRIPE_SECRET_KEY);
      let testIndividualEmail: string | null | undefined;
      if (useTestPrefill) {
        const u = await currentUser();
        testIndividualEmail =
          u?.primaryEmailAddress?.emailAddress ?? u?.emailAddresses?.[0]?.emailAddress ?? null;
      }

      const account = await stripe.accounts.create({
        type: "express",
        country: "GB",
        default_currency: "gbp",
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { clerk_user_id: userId },
        ...(useTestPrefill
          ? getStripeConnectTestCreatePrefill({ individualEmail: testIndividualEmail })
          : {}),
      });

      stripeAccountId = account.id;

      const { error: insErr } = await supabase.from("stripe_connect_accounts").insert({
        user_id: userId,
        stripe_account_id: stripeAccountId,
        updated_at: new Date().toISOString(),
      });

      if (insErr) {
        const { data: raced } = await supabase
          .from("stripe_connect_accounts")
          .select("stripe_account_id")
          .eq("user_id", userId)
          .maybeSingle();
        if (raced?.stripe_account_id) {
          stripeAccountId = raced.stripe_account_id;
        } else {
          console.error("stripe_connect_accounts insert failed:", insErr);
          return NextResponse.json({ error: insErr.message }, { status: 500 });
        }
      }
    }

    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    return NextResponse.json({
      url: accountLink.url,
      stripeAccountId,
      expiresAt: accountLink.expires_at,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/stripe/connect/create-account:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
