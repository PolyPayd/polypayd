import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureWalletForUser } from "@/lib/wallet";
import { getStripeServerClient } from "@/lib/stripe";

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

function parseAndValidateAmount(amount: unknown) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  if (amount < 1 || amount > 100_000) return null;
  const amountMinor = Math.round(amount * 100);
  if (amountMinor < 100) return null;
  return amountMinor;
}

/**
 * Creates a Stripe PaymentIntent for GBP wallet top-up.
 * Wallet is credited only by webhook after payment_intent.succeeded.
 */
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const body = (await req.json()) as CreateIntentBody;
    const orgId = String(body.orgId ?? "").trim();
    const amountMinor = parseAndValidateAmount(body.amountGbp);

    if (!orgId) {
      return NextResponse.json({ error: "Missing orgId." }, { status: 400 });
    }
    if (!isUuid(orgId)) {
      return NextResponse.json({ error: "Invalid orgId format." }, { status: 400 });
    }
    if (!amountMinor) {
      return NextResponse.json(
        { error: "Amount must be a valid GBP amount between 1.00 and 100,000.00." },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // Authorization guard: only org members can create a top-up intent for that org.
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

    const stripe = getStripeServerClient();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountMinor,
      currency: "gbp",
      automatic_payment_methods: { enabled: true },
      metadata: {
        clerk_user_id: userId,
        org_id: orgId,
        wallet_id: wallet.id,
        wallet_currency: "GBP",
        topup_amount_minor: String(amountMinor),
      },
    });

    if (!paymentIntent.client_secret) {
      return NextResponse.json({ error: "Stripe did not return a client secret." }, { status: 500 });
    }

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
