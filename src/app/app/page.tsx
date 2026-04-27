import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { Send, Users, CheckCircle, ChevronRight, Plus } from "lucide-react";
import { requireUser } from "@/src/lib/users";
import { createServerClient } from "@/src/lib/db/client";
import type { BatchStatus, ClaimStatus } from "@/src/lib/db/types";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { ClaimCodeInput } from "@/src/components/app/ClaimCodeInput";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

const BATCH_STATUS_MAP: Record<
  BatchStatus,
  { variant: BadgeVariant; label: string }
> = {
  draft:              { variant: "gray",   label: "Draft" },
  awaiting_funding:   { variant: "gray",   label: "Awaiting funding" },
  open:               { variant: "blue",   label: "Open" },
  ready_to_approve:   { variant: "amber",  label: "Ready to approve" },
  approved:           { variant: "amber",  label: "Approved" },
  processing:         { variant: "purple", label: "Processing" },
  completed:          { variant: "green",  label: "Completed" },
  partially_completed:{ variant: "green",  label: "Partially completed" },
  cancelled:          { variant: "red",    label: "Cancelled" },
  refunded:           { variant: "red",    label: "Refunded" },
  held:               { variant: "amber",  label: "Held" },
};

const CLAIM_STATUS_MAP: Record<
  ClaimStatus,
  { variant: BadgeVariant; label: string }
> = {
  slot_held:         { variant: "gray",   label: "Slot held" },
  claimed:           { variant: "blue",   label: "Claimed" },
  expired:           { variant: "red",    label: "Expired" },
  payout_pending:    { variant: "purple", label: "Payout pending" },
  payout_completed:  { variant: "green",  label: "Paid out" },
  payout_failed:     { variant: "red",    label: "Payout failed" },
  cancelled:         { variant: "red",    label: "Cancelled" },
};

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

type ActiveBatch = {
  id: string;
  name: string;
  status: BatchStatus;
  total_amount_pence: number;
  max_recipients: number;
  created_at: string;
};

type PendingClaim = {
  id: string;
  batch_id: string;
  amount_pence: number;
  status: ClaimStatus;
  created_at: string;
  batches: { id: string; name: string } | null;
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function AppDashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/signin");

  let user;
  try {
    user = await requireUser(userId);
  } catch {
    redirect("/signin");
  }

  const db = createServerClient();
  const EXCLUDED_STATUSES = "(completed,cancelled,refunded)";

  const [activeBatchesResult, pendingClaimsResult] = await Promise.all([
    db
      .from("batches")
      .select("id, name, status, total_amount_pence, max_recipients, created_at")
      .eq("sender_user_id", user.id)
      .not("status", "in", EXCLUDED_STATUSES)
      .order("created_at", { ascending: false })
      .limit(6),

    db
      .from("claims")
      .select("id, batch_id, amount_pence, status, created_at, batches(id, name)")
      .eq("user_id", user.id)
      .eq("status", "claimed")
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const activeBatches = (activeBatchesResult.data ?? []) as ActiveBatch[];
  const pendingClaims = (pendingClaimsResult.data ?? []) as PendingClaim[];

  // Fetch claim counts for slot progress bars
  let claimedPerBatch: Record<string, number> = {};
  if (activeBatches.length > 0) {
    const { data: claimCounts } = await db
      .from("claims")
      .select("batch_id")
      .in(
        "batch_id",
        activeBatches.map((b) => b.id)
      )
      .in("status", [
        "claimed",
        "payout_pending",
        "payout_completed",
        "payout_failed",
      ]);

    claimedPerBatch = (claimCounts ?? []).reduce<Record<string, number>>(
      (acc, row) => {
        const r = row as { batch_id: string };
        acc[r.batch_id] = (acc[r.batch_id] ?? 0) + 1;
        return acc;
      },
      {}
    );
  }

  const isEmpty = activeBatches.length === 0 && pendingClaims.length === 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-8">
      {isEmpty ? (
        <EmptyState />
      ) : (
        <ActiveState
          activeBatches={activeBatches}
          pendingClaims={pendingClaims}
          claimedPerBatch={claimedPerBatch}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col gap-16">
      {/* Hero */}
      <section className="flex flex-col items-start gap-5 pt-4">
        <h1 className="text-3xl font-bold tracking-tight text-fp-text sm:text-4xl">
          Ready to pay out to a group?
        </h1>
        <p className="max-w-lg text-base text-fp-text-secondary">
          Create a batch, share a link, and your recipients claim their share.
          You approve once — Faster Payments does the rest.
        </p>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <Link
            href="/app/batches/new"
            className="inline-flex items-center gap-2 rounded-lg bg-fp-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-fp-accent/90"
          >
            <Plus className="h-4 w-4" />
            Create a batch
          </Link>
        </div>

        {/* Claim code input */}
        <div className="mt-2">
          <ClaimCodeInput />
        </div>
      </section>

      {/* How it works */}
      <section>
        <h2 className="mb-6 text-lg font-semibold text-fp-text">
          How it works
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <HowItWorksCard
            step={1}
            icon={Send}
            title="Create a batch"
            description="Set the total amount and number of recipients, then share a claim link."
          />
          <HowItWorksCard
            step={2}
            icon={Users}
            title="Recipients claim"
            description="Each person enters their bank details once — no account needed."
          />
          <HowItWorksCard
            step={3}
            icon={CheckCircle}
            title="You approve"
            description="One click sends Faster Payments to everyone simultaneously."
          />
        </div>
      </section>
    </div>
  );
}

function HowItWorksCard({
  step,
  icon: Icon,
  title,
  description,
}: {
  step: number;
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-fp-surface p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-fp-accent/10 text-xs font-bold text-fp-accent">
          {step}
        </span>
        <Icon className="h-4 w-4 text-fp-text-secondary" />
      </div>
      <p className="mb-1.5 font-semibold text-fp-text">{title}</p>
      <p className="text-sm text-fp-text-secondary">{description}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active state
// ---------------------------------------------------------------------------

function ActiveState({
  activeBatches,
  pendingClaims,
  claimedPerBatch,
}: {
  activeBatches: ActiveBatch[];
  pendingClaims: PendingClaim[];
  claimedPerBatch: Record<string, number>;
}) {
  return (
    <div className="flex flex-col gap-10">
      {activeBatches.length > 0 && (
        <section>
          <SectionHeader title="Your active batches" viewAllHref="/app/batches" />
          <div className="flex flex-col gap-2">
            {activeBatches.map((batch) => (
              <BatchCard
                key={batch.id}
                batch={batch}
                claimed={claimedPerBatch[batch.id] ?? 0}
              />
            ))}
          </div>
        </section>
      )}

      {pendingClaims.length > 0 && (
        <section>
          <SectionHeader title="Your pending claims" viewAllHref="/app/claims" />
          <div className="flex flex-col gap-2">
            {pendingClaims.map((claim) => (
              <ClaimCard key={claim.id} claim={claim} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SectionHeader({
  title,
  viewAllHref,
}: {
  title: string;
  viewAllHref: string;
}) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-lg font-semibold text-fp-text">{title}</h2>
      <Link
        href={viewAllHref}
        className="flex items-center gap-1 text-sm text-fp-text-secondary hover:text-fp-text"
      >
        View all <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function BatchCard({
  batch,
  claimed,
}: {
  batch: ActiveBatch;
  claimed: number;
}) {
  const { variant, label } = BATCH_STATUS_MAP[batch.status] ?? {
    variant: "gray" as BadgeVariant,
    label: batch.status,
  };

  const pct =
    batch.max_recipients > 0
      ? Math.round((claimed / batch.max_recipients) * 100)
      : 0;

  return (
    <Link
      href={`/app/batches/${batch.id}`}
      className="group flex items-center justify-between rounded-xl border border-white/[0.06] bg-fp-surface px-5 py-4 transition-colors hover:border-white/10 hover:bg-fp-elevated"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2.5">
          <span className="truncate font-medium text-fp-text">{batch.name}</span>
          <Badge variant={variant}>{label}</Badge>
        </div>
        {/* Slot progress */}
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-fp-accent transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs text-fp-text-muted">
            {claimed} / {batch.max_recipients} claimed
          </span>
        </div>
      </div>

      <div className="ml-4 flex shrink-0 items-center gap-3">
        <span className="text-sm font-semibold text-fp-text">
          {formatPence(batch.total_amount_pence)}
        </span>
        <ChevronRight className="h-4 w-4 text-fp-text-muted group-hover:text-fp-text-secondary transition-colors" />
      </div>
    </Link>
  );
}

function ClaimCard({ claim }: { claim: PendingClaim }) {
  const { variant, label } = CLAIM_STATUS_MAP[claim.status] ?? {
    variant: "gray" as BadgeVariant,
    label: claim.status,
  };

  const batchName = claim.batches?.name ?? "Unknown batch";

  return (
    <Link
      href={`/app/claims/${claim.id}`}
      className="group flex items-center justify-between rounded-xl border border-white/[0.06] bg-fp-surface px-5 py-4 transition-colors hover:border-white/10 hover:bg-fp-elevated"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2.5">
          <span className="truncate font-medium text-fp-text">{batchName}</span>
          <Badge variant={variant}>{label}</Badge>
        </div>
      </div>

      <div className="ml-4 flex shrink-0 items-center gap-3">
        <span className="text-sm font-semibold text-fp-text">
          {formatPence(claim.amount_pence)}
        </span>
        <ChevronRight className="h-4 w-4 text-fp-text-muted group-hover:text-fp-text-secondary transition-colors" />
      </div>
    </Link>
  );
}
