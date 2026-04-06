import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureDefaultOrgForUser } from "@/lib/defaultOrg";

export const dynamic = "force-dynamic";

export default async function WalletTransactionsShortcutPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const orgId = await ensureDefaultOrgForUser(supabaseAdmin(), userId);
  redirect(`/app/orgs/${orgId}/wallet/transactions`);
}
