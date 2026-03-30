import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  stripeEventId?: string;
  livemode?: boolean;
  newAvailableGbpMinor?: number;
};

function adminSecretConfigured(): string | null {
  const s = process.env.POLYPAYD_ADMIN_RELEASE_SECRET?.trim();
  return s && s.length >= 16 ? s : null;
}

function authorize(req: Request, secret: string): boolean {
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const header = req.headers.get("x-polypayd-admin-secret")?.trim() ?? "";
  const token = bearer || header;
  if (!token) return false;
  try {
    const a = Buffer.from(token, "utf8");
    const b = Buffer.from(secret, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Manual fallback: calls apply_stripe_balance_available_release (same as balance.available webhook).
 * Not Clerk-protected so ops can curl; requires POLYPAYD_ADMIN_RELEASE_SECRET (min 16 chars).
 */
export async function POST(req: Request) {
  const secret = adminSecretConfigured();
  if (!secret) {
    console.error("balance-available-release: POLYPAYD_ADMIN_RELEASE_SECRET missing or too short");
    return NextResponse.json(
      { error: "Admin release endpoint is not configured on this deployment." },
      { status: 503 }
    );
  }

  if (!authorize(req, secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const stripeEventId = typeof body.stripeEventId === "string" ? body.stripeEventId.trim() : "";
  if (!stripeEventId) {
    return NextResponse.json({ error: "stripeEventId is required." }, { status: 400 });
  }

  if (typeof body.livemode !== "boolean") {
    return NextResponse.json({ error: "livemode must be a boolean." }, { status: 400 });
  }

  const minor = body.newAvailableGbpMinor;
  if (typeof minor !== "number" || !Number.isInteger(minor) || minor < 0) {
    return NextResponse.json(
      { error: "newAvailableGbpMinor must be a non-negative integer (pence)." },
      { status: 400 }
    );
  }

  const supabase = supabaseAdmin();
  const { data, error } = await supabase.rpc("apply_stripe_balance_available_release", {
    p_stripe_event_id: stripeEventId,
    p_livemode: body.livemode,
    p_new_available_gbp_minor: minor,
  });

  if (error) {
    console.error("apply_stripe_balance_available_release (manual):", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, result: data }, { status: 200 });
}
