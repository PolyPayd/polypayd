import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auth } from "@clerk/nextjs/server";
import { PayoutList } from "./PayoutList";
import { PageShell } from "@/components/fintech";

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
  const resolvedSearchParams =
    (await Promise.resolve(
      searchParams as Promise<{ archived?: string }> | { archived?: string } | undefined
    )) ?? {};
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
    <PageShell>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#F9FAFB] sm:text-2xl">Payouts</h1>
          <p className="mt-1 text-sm text-[#6B7280]">Manage bulk sends and claim links.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/app/batches"
            className={`rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ${
              !isArchived ? "bg-[#3B82F6]/15 text-[#F9FAFB]" : "text-[#9CA3AF] hover:bg-white/[0.04] hover:text-[#F9FAFB]"
            }`}
          >
            Active
          </Link>
          <Link
            href="/app/batches?archived=1"
            className={`rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ${
              isArchived ? "bg-[#3B82F6]/15 text-[#F9FAFB]" : "text-[#9CA3AF] hover:bg-white/[0.04] hover:text-[#F9FAFB]"
            }`}
          >
            Archived
          </Link>
          <Link
            href="/app/batches/new"
            className="rounded-xl bg-[#3B82F6] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#2563EB]"
          >
            New payout
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
    </PageShell>
  );
}
