import { redirect } from "next/navigation";

import { auth } from "@clerk/nextjs/server";

import { getUserByClerkId } from "@/lib/users";

import { OnboardingForm } from "./onboarding-form";

// Server component for /app/onboarding.
//
// Redirect rules (deliberately one-directional):
//   - Not signed in            → /signin
//   - Signed in, first_name set → /app   (user has already onboarded)
//   - Signed in, no first_name  → render the form (no redirect)
//
// We never redirect from this page back to /app/onboarding. That is a
// load-bearing invariant: combined with the (authed) layout living in a
// sibling route group, it makes a redirect loop structurally impossible.
export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/signin");
  }

  const user = await getUserByClerkId(userId);

  if (user?.first_name) {
    redirect("/app");
  }

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-slate-50 px-4 py-10 text-foreground">
      <OnboardingForm />
    </div>
  );
}
