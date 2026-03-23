import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auth } from "@clerk/nextjs/server";
import { PayoutList } from "./PayoutList";

export const dynamic = "force-dynamic";

type Params = { orgId: string };

export default async function BatchesPage({
  params,
  searchParams,
}: {
  params: Params | Promise<Params>;
  searchParams?: Promise<{ archived?: string }> | { archived?: string };
}) {
  const { orgId } = await Promise.resolve(params as Promise<Params>);
  const resolvedSearchParams = (await Promise.resolve(searchParams as any)) ?? {};
  const isArchived = resolvedSearchParams?.archived === "1";

  if (!orgId) {
    return <div className="p-6 text-red-500">Missing orgId in route.</div>;
  }

  const { userId } = await auth();
  if (!userId) {
    return (
      <div className="p-6 text-red-500">You must be signed in to view batches.</div>
    );
  }

  const supabase = supabaseAdmin();

  const { data: membership } = await supabase
    .from("org_members")
    .select("id")
    .eq("org_id", orgId)
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (!membership) {
    return (
      <div className="p-6 text-red-500">You do not have access to this organisation.</div>
    );
  }

  let query = supabase
    .from("batches")
    .select("id, name, status, currency, total_amount, recipient_count, created_at, archived_at")
    .eq("org_id", orgId);

  if (isArchived) {
    query = query.not("archived_at", "is", null);
  } else {
    query = query.is("archived_at", null);
  }

  const { data: batches, error } = await query.order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="p-6 text-red-500">Failed to load batches: {error.message}</div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-white">Payouts</h1>
          <div className="flex items-center gap-2">
            <Link
              href="/app/batches"
              className={`rounded-md border px-4 py-2 text-sm ${
                !isArchived
                  ? "border-white/30 bg-white/10 text-white"
                  : "border-neutral-600 text-neutral-300 hover:bg-neutral-800"
              }`}
            >
              Active
            </Link>
            <Link
              href="/app/batches?archived=1"
              className={`rounded-md border px-4 py-2 text-sm ${
                isArchived
                  ? "border-white/30 bg-white/10 text-white"
                  : "border-neutral-600 text-neutral-300 hover:bg-neutral-800"
              }`}
            >
              Archived
            </Link>
            <Link
              href={`/app/batches/new`}
              className="rounded-md bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
            >
              New Payout
            </Link>
          </div>
        </div>

        <PayoutList
          orgId={orgId}
          batches={(batches ?? []).map((b) => ({
            id: b.id,
            name: b.name,
            status: b.status,
            total_amount: b.total_amount,
            recipient_count: b.recipient_count,
            created_at: b.created_at,
          }))}
          showingArchived={isArchived}
        />
      </div>
    </div>
  );
}
