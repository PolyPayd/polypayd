import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureDefaultOrgForUser } from "@/lib/defaultOrg";
import OrgNewBatchPage from "../../orgs/[orgId]/batches/new/page";

export const dynamic = "force-dynamic";

export default async function NewBatchRoutePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const supabase = supabaseAdmin();
  const orgId = await ensureDefaultOrgForUser(supabase, userId);

  return <OrgNewBatchPage params={Promise.resolve({ orgId })} />;
}

