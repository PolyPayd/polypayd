import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";

/**
 * Post-auth app entry. Redirects to:
 * - /sign-in if unauthenticated
 * - /app/wallet for the simplified single-wallet experience
 */
export default async function AppLandingPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }
  redirect("/app/wallet");
}
