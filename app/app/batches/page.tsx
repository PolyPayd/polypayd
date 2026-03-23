import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureDefaultOrgForUser } from "@/lib/defaultOrg";
import OrgBatchesPage from "../orgs/[orgId]/batches/page";

export const dynamic = "force-dynamic";

export default async function BatchesRoutePage({
  searchParams,
}: {
  searchParams?: Promise<{ archived?: string }> | { archived?: string };
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const supabase = supabaseAdmin();
  const orgId = await ensureDefaultOrgForUser(supabase, userId);

  return (
    <OrgBatchesPage
      params={Promise.resolve({ orgId })}
      searchParams={searchParams as Promise<{ archived?: string }> | { archived?: string } | undefined}
    />
  );
}

