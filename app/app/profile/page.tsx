import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ProfileDashboard } from "@/components/profile/ProfileDashboard";
import { ensureUserProfileRow, getUserProfileRow } from "@/lib/userProfile";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  const accountTypeRaw = String((user?.publicMetadata?.accountType as string | undefined) ?? "personal").toLowerCase();
  const accountType = accountTypeRaw === "business" ? "business" : "personal";
  const businessName = String((user?.publicMetadata?.businessName as string | undefined) ?? "").trim();
  const businessId = String((user?.publicMetadata?.businessId as string | undefined) ?? "").trim();

  const nameRowValue =
    user?.fullName?.trim() ||
    [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
    user?.username ||
    (email ? email.split("@")[0] : "Not set");

  const clerkPhone = user?.phoneNumbers?.[0]?.phoneNumber?.trim() ?? "";

  const supabase = supabaseAdmin();
  await ensureUserProfileRow(supabase, userId, email || null);
  const profile = await getUserProfileRow(supabase, userId);

  return (
    <ProfileDashboard
      initialProfile={profile}
      email={email}
      clerkDisplayName={nameRowValue}
      clerkImageUrl={user?.imageUrl ?? null}
      clerkPhone={clerkPhone}
      accountType={accountType}
      businessName={businessName}
      businessId={businessId}
    />
  );
}
