import { Webhook } from "svix";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // Always log so we can see what's happening
  console.log("✅ Webhook hit");

  try {
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    console.log("ENV CHECK:", {
      hasSecret: !!secret,
      hasSupabaseUrl: !!supabaseUrl,
      hasServiceRole: !!serviceRoleKey,
    });

    if (!secret) return new Response("Missing CLERK_WEBHOOK_SECRET", { status: 500 });
    if (!supabaseUrl) return new Response("Missing SUPABASE_URL", { status: 500 });
    if (!serviceRoleKey) return new Response("Missing SUPABASE_SERVICE_ROLE_KEY", { status: 500 });

    const payload = await req.text();

    const svixId = req.headers.get("svix-id");
    const svixTimestamp = req.headers.get("svix-timestamp");
    const svixSignature = req.headers.get("svix-signature");

    console.log("SVIX HEADERS:", {
      hasId: !!svixId,
      hasTs: !!svixTimestamp,
      hasSig: !!svixSignature,
    });

    if (!svixId || !svixTimestamp || !svixSignature) {
      return new Response("Missing svix headers", { status: 400 });
    }

    let evt: any;
    try {
      const wh = new Webhook(secret);
      evt = wh.verify(payload, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      });
      console.log("✅ Signature verified:", evt?.type);
    } catch (e: any) {
      console.error("❌ Signature verify failed:", e?.message || e);
      // IMPORTANT: return 200 so Clerk stops retrying while we debug
      return new Response("Signature verification failed", { status: 200 });
    }

    if (evt.type === "user.created") {
      const user = evt.data;

      const clerkUserId = user?.id;
      const email =
        user?.email_addresses?.[0]?.email_address ??
        user?.primary_email_address?.email_address ??
        null;

      console.log("USER CREATED:", { clerkUserId, email });

      const supabase = createClient(supabaseUrl, serviceRoleKey);

      const { error } = await supabase
  .from("profiles")
  .upsert(
    { clerk_user_id: clerkUserId, email },
    { onConflict: "clerk_user_id" }
  );

      if (error) {
        console.error("❌ Supabase insert error:", error);
        // return 200 to stop retries while debugging
        return new Response("Supabase insert failed", { status: 200 });
      }

      console.log("✅ Inserted into profiles");
    }

    return new Response("OK", { status: 200 });
  } catch (err: any) {
    console.error("❌ Webhook crash:", err?.message || err);
    // return 200 so Clerk doesn't keep hammering while we debug
    return new Response("Webhook crashed", { status: 200 });
  }
}