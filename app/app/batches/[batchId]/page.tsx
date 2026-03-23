import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import OrgBatchDetailPage from "../../orgs/[orgId]/batches/[batchId]/page";

export const dynamic = "force-dynamic";

type Params = { batchId: string };

type Search = {
  tab?: string;
  q?: string;
  uploadId?: string;
  status?: string;
  error?: string;
  impactToast?: string;
};

export default async function BatchRoutePage({
  params,
  searchParams,
}: {
  params: Params | Promise<Params>;
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { batchId } = await Promise.resolve(params as Promise<Params>);
  const supabase = supabaseAdmin();

  const { data: batch } = await supabase
    .from("batches")
    .select("id, org_id")
    .eq("id", batchId)
    .maybeSingle();

  if (!batch) {
    return <div className="p-6 text-red-500">Batch not found.</div>;
  }

  return (
    <OrgBatchDetailPage
      params={Promise.resolve({ orgId: batch.org_id, batchId })}
      searchParams={searchParams as unknown as Search}
    />
  );
}

