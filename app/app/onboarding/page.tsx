import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Shown when the user has no organisation. Create one to enter the app.
 */
export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  // Organisations are no longer part of the primary UX.
  // We still create a minimal internal workspace behind the scenes for legacy DB columns.
  redirect("/app/wallet");
}
