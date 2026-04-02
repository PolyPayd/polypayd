import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureWalletForUser } from "@/lib/wallet";
import { getStripeServerClient } from "@/lib/stripe";
import { sumGbpAvailableMinor, sumGbpPendingMinor } from "@/lib/stripeBalanceAvailableApply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isUuid(value: string) {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Diagnostic: user Stripe liquidity is the connected account; platform totals are admin/legacy only.
 */
export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const url = new URL(req.url);
    const orgId = url.searchParams.get("orgId")?.trim() ?? "";
    if (!orgId || !isUuid(orgId)) {
      return NextResponse.json({ error: "Missing or invalid orgId query parameter." }, { status: 400 });
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

    const wallet = await ensureWalletForUser(supabase, userId, "GBP");
    if (!wallet) {
      return NextResponse.json({ error: "Failed to get or create wallet." }, { status: 500 });
    }

    const { data: connectRow } = await supabase
      .from("stripe_connect_accounts")
      .select("stripe_account_id")
      .eq("user_id", userId)
      .maybeSingle();

    const stripeConnectedAccountId = connectRow?.stripe_account_id ?? null;

    const stripe = getStripeServerClient();

    const platformBalance = await stripe.balance.retrieve();
    const platformAvailableMinor = sumGbpAvailableMinor(platformBalance);
    const platformPendingMinor = sumGbpPendingMinor(platformBalance);

    let connectedAvailableMinor: number | null = null;
    let connectedPendingMinor: number | null = null;
    if (stripeConnectedAccountId) {
      const connectedBalance = await stripe.balance.retrieve({
        stripeAccount: stripeConnectedAccountId,
      });
      connectedAvailableMinor = sumGbpAvailableMinor(connectedBalance);
      connectedPendingMinor = sumGbpPendingMinor(connectedBalance);
    }

    const payload = {
      org_id: orgId,
      wallet_id: wallet.id,
      stripe_connected_account_id: stripeConnectedAccountId,
      primary: stripeConnectedAccountId
        ? {
            stripe_balance_context: "connected_account" as const,
            stripe_account_id: stripeConnectedAccountId,
            available_gbp_minor: connectedAvailableMinor,
            pending_gbp_minor: connectedPendingMinor,
          }
        : {
            stripe_balance_context: "connected_account" as const,
            stripe_account_id: null,
            skipped: true as const,
            reason: "No stripe_connect_accounts row for this user.",
          },
      platform_diagnostic: {
        stripe_balance_context: "platform" as const,
        available_gbp_minor: platformAvailableMinor,
        pending_gbp_minor: platformPendingMinor,
        note: "Platform balance does not represent user wallet funding after Connect top-ups.",
      },
    };

    console.info("[polypayd:stripe-wallet-debug]", JSON.stringify(payload));

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
