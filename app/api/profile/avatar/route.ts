import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { extractAvatarStoragePathFromPublicUrl, validateAvatarFile } from "@/lib/profileFieldValidation";
import { ensureUserProfileRow, getUserProfileRow } from "@/lib/userProfile";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

async function removeStoredObjectIfPolyPayd(supabase: ReturnType<typeof supabaseAdmin>, publicUrl: string | null) {
  if (!publicUrl) return;
  const path = extractAvatarStoragePathFromPublicUrl(publicUrl);
  if (!path) return;
  await supabase.storage.from("profile-avatars").remove([path]);
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await currentUser();
  const supabase = supabaseAdmin();
  await ensureUserProfileRow(
    supabase,
    userId,
    user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? null
  );

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const check = validateAvatarFile(file);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const ext =
    file.type === "image/jpeg"
      ? "jpg"
      : file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : "gif";
  const path = `${userId}/${Date.now()}.${ext}`;

  const existing = await getUserProfileRow(supabase, userId);
  if (existing?.avatar_url) {
    await removeStoredObjectIfPolyPayd(supabase, existing.avatar_url);
  }

  const { error: uploadErr } = await supabase.storage.from("profile-avatars").upload(path, buf, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message || "Upload failed" }, { status: 500 });
  }

  const { data: pub } = supabase.storage.from("profile-avatars").getPublicUrl(path);
  const publicUrl = pub.publicUrl;
  const updated_at = new Date().toISOString();

  const { data: exists } = await supabase
    .from("profiles")
    .select("clerk_user_id")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (exists) {
    const { error: upErr } = await supabase
      .from("profiles")
      .update({ avatar_url: publicUrl, updated_at })
      .eq("clerk_user_id", userId);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  } else {
    const { error: insErr } = await supabase.from("profiles").insert({
      clerk_user_id: userId,
      email: user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? null,
      avatar_url: publicUrl,
      updated_at,
    });
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ avatarUrl: publicUrl });
}

export async function DELETE() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = supabaseAdmin();
  const existing = await getUserProfileRow(supabase, userId);
  if (existing?.avatar_url) {
    await removeStoredObjectIfPolyPayd(supabase, existing.avatar_url);
  }

  const updated_at = new Date().toISOString();
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: null, updated_at })
    .eq("clerk_user_id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
