import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { Plus, ChevronRight } from "lucide-react";
import { requireUser } from "@/src/lib/users";
import { createServerClient } from "@/src/lib/db/client";
import type { BatchStatus } from "@/src/lib/db/types";
import { Badge, type BadgeVariant } from "@/components/ui/badge";

function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const STATUS_MAP: Record<BatchStatus, { variant: BadgeVariant; label: string }> = {
  draft:               { variant: "gray",   label: "Draft" },
  awaiting_funding:    { variant: "gray",   label: "Awaiting funding" },
  open:                { variant: "blue",   label: "Open" },
  ready_to_approve:    { variant: "amber",  label: "Ready to approve" },
  approved:            { variant: "amber",  label: "Approved" },
  processing:          { variant: "purple", label: "Processing" },
  completed:           { variant: "green",  label: "Completed" },
  partially_completed: { variant: "green",  label: "Partially completed" },
  cancelled:           { variant: "red",    label: "Cancelled" },
  refunded:            { variant: "red",    label: "Refunded" },
  held:                { variant: "amber",  label: "Held" },
};

type BatchRow = {
  id: string;
  name: string;
  status: BatchStatus;
  total_amount_pence: number;
  fee_pence: number;
  max_recipients: number;
  created_at: string;
};

export default async function BatchesPage() {
  const { userId } = await auth();
  if (!userId) redirect("/signin");

  let user;
  try {
    user = await requireUser(userId);
  } catch {
    redirect("/signin");
  }

  const db = createServerClient();
  const { data } = await db
    .from("batches")
    .select("id, name, status, total_amount_pence, fee_pence, max_recipients, created_at")
    .eq("sender_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const batches = (data ?? []) as BatchRow[];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-fp-text">Batches</h1>
          <p className="mt-1 text-sm text-fp-text-secondary">
            All payment batches you&apos;ve created.
          </p>
        </div>
        <Link
          href="/app/batches/new"
          className="inline-flex items-center gap-2 rounded-lg bg-fp-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-fp-accent/90"
        >
          <Plus className="h-4 w-4" />
          New batch
        </Link>
      </div>

      {batches.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-fp-surface py-16 text-center">
          <p className="text-sm text-fp-text-muted">No batches yet.</p>
          <Link
            href="/app/batches/new"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-fp-accent hover:underline"
          >
            <Plus className="h-4 w-4" />
            Create your first batch
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-fp-surface">
          <ul className="divide-y divide-white/[0.04]">
            {batches.map((b) => {
              const { variant, label } = STATUS_MAP[b.status] ?? STATUS_MAP.draft;
              return (
                <li key={b.id}>
                  <Link
                    href={`/app/batches/${b.id}`}
                    className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-white/[0.02]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-fp-text">{b.name}</p>
                      <p className="mt-0.5 text-xs text-fp-text-muted">
                        {formatDate(b.created_at)} &middot; {formatPence(b.total_amount_pence)} &middot; {b.max_recipients} recipients
                      </p>
                    </div>
                    <Badge variant={variant}>{label}</Badge>
                    <ChevronRight className="h-4 w-4 shrink-0 text-fp-text-muted" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
