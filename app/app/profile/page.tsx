import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { ProfileRow } from "@/components/profile/ProfileRow";
import { ProfileSection } from "@/components/profile/ProfileSection";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await currentUser();

  const accountTypeRaw = String((user?.publicMetadata?.accountType as string | undefined) ?? "personal").toLowerCase();
  const accountType = accountTypeRaw === "business" ? "business" : "personal";
  const businessName = String((user?.publicMetadata?.businessName as string | undefined) ?? "").trim();
  const businessId = String((user?.publicMetadata?.businessId as string | undefined) ?? "").trim();

  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const nameRowValue =
    user?.fullName?.trim() ||
    [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
    user?.username ||
    (email ? email.split("@")[0] : "Not set");
  const displayName = nameRowValue !== "Not set" ? nameRowValue : "Account";
  const secondaryLine = email || (user?.username ? `@${user.username}` : "");

  const primaryPhone = user?.phoneNumbers?.[0]?.phoneNumber?.trim() ?? "";
  const address = String((user?.publicMetadata?.address as string | undefined) ?? "").trim();

  const emailRowValue = email || "Not set";
  const accountTypeLabel = accountType === "business" ? "Business" : "Personal";

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-12 pt-6 sm:px-5 sm:pt-8">
      <header className="flex flex-col items-center text-center">
        <ProfileAvatar name={nameRowValue !== "Not set" ? nameRowValue : displayName} email={email || "user"} imageUrl={user?.imageUrl} />
        <h1 className="mt-5 text-[1.375rem] font-bold tracking-tight text-[#F9FAFB] sm:text-2xl">{displayName}</h1>
        {secondaryLine ? (
          <p className="mt-1.5 text-sm text-[#9CA3AF]">{secondaryLine}</p>
        ) : null}
      </header>

      <ProfileSection title="Personal">
        <ProfileRow label="Name" value={nameRowValue} />
        <ProfileRow label="Email" value={emailRowValue} />
        <ProfileRow label="Account type" value={accountTypeLabel} />
      </ProfileSection>

      {accountType === "business" && (
        <ProfileSection title="Business">
          <ProfileRow label="Business name" value={businessName || "Not set"} />
          <ProfileRow label="Registration ID" value={businessId || "Not set"} />
        </ProfileSection>
      )}

      {(primaryPhone || address) ? (
        <ProfileSection title="Contact">
          {primaryPhone ? <ProfileRow label="Phone" value={primaryPhone} /> : null}
          {address ? <ProfileRow label="Address" value={address} /> : null}
        </ProfileSection>
      ) : null}

      <ProfileSection title="Security">
        <ProfileRow label="Change password" value="Password & security" />
      </ProfileSection>
    </div>
  );
}
