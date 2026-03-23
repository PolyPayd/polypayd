import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureDefaultOrgForUser } from "@/lib/defaultOrg";
import OrgWalletPage from "../orgs/[orgId]/wallet/page";

export const dynamic = "force-dynamic";

export default async function WalletRoutePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const supabase = supabaseAdmin();
  const orgId = await ensureDefaultOrgForUser(supabase, userId);

  return <OrgWalletPage params={Promise.resolve({ orgId })} />;
}

