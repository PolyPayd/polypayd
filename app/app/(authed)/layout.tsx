import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { auth, clerkClient } from "@clerk/nextjs/server";

import { ensureUserRow, getUserByClerkId } from "@/lib/users";
import { AppSidebar } from "@/app/components/app/AppSidebar";

// Gated subtree for the authenticated app. Protects every route except
// `/app/onboarding` (which lives outside this route group).
//
// Invariants enforced here:
//   1. Clerk session present (signed-out → /signin). Already enforced by
//      proxy.ts auth.protect(); kept here as belt-and-braces in case the
//      middleware matcher ever drifts.
//   2. The user has completed onboarding (first_name set). If not, redirect
//      to /app/onboarding. Because onboarding lives in a sibling segment,
//      this layout never runs there, so there's no possibility of a loop.

async function resolvePrimaryEmail(clerkUserId: string): Promise<string | null> {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(clerkUserId);
    return (
      user.primaryEmailAddress?.emailAddress ??
      user.emailAddresses[0]?.emailAddress ??
      null
    );
  } catch (err) {
    console.error("AppAuthedLayout resolvePrimaryEmail failed:", err);
    return null;
  }
}

export default async function AppAuthedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/signin");
  }

  let user = await getUserByClerkId(userId);

  // First-run safety net: if Clerk's webhook hasn't created a users row yet,
  // create it now so the onboarding gate can take over from there.
  if (!user) {
    const email = await resolvePrimaryEmail(userId);
    if (email) user = await ensureUserRow(userId, email);
  }

  if (!user || !user.first_name) {
    redirect("/app/onboarding");
  }

  return (
    <div className="flex min-h-screen flex-col bg-fp-bg text-fp-text md:flex-row">
      <AppSidebar />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
