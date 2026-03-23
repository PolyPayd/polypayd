import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OrgsListPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  // Organisations are no longer part of the primary UX.
  redirect("/app/wallet");
}
