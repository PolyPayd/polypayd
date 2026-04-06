import Link from "next/link";
import { UserProfile } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ClerkAccountSettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-6 sm:px-5 sm:pt-8">
      <Link
        href="/app/profile"
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-[#9CA3AF] transition-colors hover:text-[#F9FAFB]"
      >
        <span className="text-[#6B7280]" aria-hidden>
          ←
        </span>
        Back to profile
      </Link>
      <div className="flex justify-center">
        <UserProfile
          routing="path"
          path="/app/user"
          appearance={{
            variables: {
              colorBackground: "#0B0F14",
              colorInputBackground: "#121821",
              colorNeutral: "#9CA3AF",
              colorText: "#F9FAFB",
              colorTextSecondary: "#6B7280",
              borderRadius: "0.75rem",
            },
            elements: {
              rootBox: "w-full",
              card: "border border-white/[0.06] bg-[#121821] shadow-none",
            },
          }}
        />
      </div>
    </div>
  );
}
