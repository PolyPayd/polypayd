import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { ArrowLeft, Info } from "lucide-react";

import { requireUser } from "@/lib/users";
import { createServerClient } from "@/lib/db/client";
import { calculateFee } from "@/lib/fees";
import { formatClaimCode } from "@/lib/claim-codes";
import type { Batch, BatchStatus, ClaimLink, ClaimStatus } from "@/lib/db/types";

import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { CopyButton } from "@/app/components/app/CopyButton";
import {
  BatchActions,
  type BatchAction,
} from "@/app/components/app/BatchActions";

// ---------------------------------------------------------------------------
// Status maps. Same colour palette as the dashboard for visual consistency.
// ---------------------------------------------------------------------------

const BATCH_STATUS_MAP: Record<
  BatchStatus,
  { variant: BadgeVariant; label: string }
> = {
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

// Spec says display values should be claimed/paid/failed/cancelled_by_sender;
// the underlying DB enum is wider. Map each DB state to a friendly label and
// badge colour here so the rest of the page stays declarative.
const CLAIM_STATUS_MAP: Record<
  ClaimStatus,
  { variant: BadgeVariant; label: string }
> = {
  slot_held:        { variant: "gray",   label: "Reserved" },
  claimed:          { variant: "blue",   label: "Claimed" },
  expired:          { variant: "gray",   label: "Expired" },
  payout_pending:   { variant: "purple", label: "Processing" },
  payout_completed: { variant: "green",  label: "Paid" },
  payout_failed:    { variant: "red",    label: "Failed" },
  cancelled:        { variant: "red",    label: "Cancelled by sender" },
};

// Statuses that count as "occupying a slot" (i.e. consume capacity from
// max_recipients). slot_held + claimed = active claims; payout_* = settled.
const ACTIVE_CLAIM_STATUSES: ReadonlySet<ClaimStatus> = new Set<ClaimStatus>([
  "slot_held",
  "claimed",
  "payout_pending",
  "payout_completed",
]);

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatPence(pence: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

// ---------------------------------------------------------------------------
// Types for joined query results
// ---------------------------------------------------------------------------

type ClaimRow = {
  id: string;
  batch_id: string;
  user_id: string;
  amount_pence: number;
  status: ClaimStatus;
  claimed_at: string | null;
  created_at: string;
  users: {
    first_name: string | null;
    last_name: string | null;
  } | null;
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { userId } = await auth();
  if (!userId) redirect("/signin");

  let user;
  try {
    user = await requireUser(userId);
  } catch {
    redirect("/signin");
  }

  const db = createServerClient();

  const batchResult = await db
    .from("batches")
    .select("*")
    .eq("id", id)
    .eq("sender_user_id", user.id)
    .maybeSingle();

  if (batchResult.error) {
    console.error("[batch-detail] batch query failed:", batchResult.error);
  }
  // Supabase widens `select("*")` to `{}` in some inference paths; cast at
  // the boundary using the canonical Row type from lib/db/types.
  const batch = batchResult.data as Batch | null;
  if (!batch) {
    notFound();
  }

  const [claimsResult, claimLinkResult] = await Promise.all([
    db
      .from("claims")
      .select(
        "id, batch_id, user_id, amount_pence, status, claimed_at, created_at, users:users!user_id(first_name, last_name)"
      )
      .eq("batch_id", id)
      .order("created_at", { ascending: false }),

    db
      .from("claim_links")
      .select("*")
      .eq("batch_id", id)
      .limit(1)
      .maybeSingle(),
  ]);

  if (claimsResult.error) {
    console.error("[batch-detail] claims query failed:", claimsResult.error);
  }
  if (claimLinkResult.error) {
    console.error(
      "[batch-detail] claim_link query failed:",
      claimLinkResult.error
    );
  }

  // Normalise the joined rows: PostgREST nests the joined `users` row when
  // we use `users:users!user_id(...)`. With a foreign-key join it returns a
  // single object, but Supabase types it as object|array depending on the
  // relationship hint, so we coerce defensively.
  const rawClaims = (claimsResult.data ?? []) as Array<
    Omit<ClaimRow, "users"> & {
      users:
        | { first_name: string | null; last_name: string | null }
        | { first_name: string | null; last_name: string | null }[]
        | null;
    }
  >;
  const claims: ClaimRow[] = rawClaims.map((row) => ({
    ...row,
    users: Array.isArray(row.users) ? row.users[0] ?? null : row.users,
  }));

  const claimLink = claimLinkResult.data as ClaimLink | null;

  // Slot accounting
  const activeClaimsCount = claims.filter((c) =>
    ACTIVE_CLAIM_STATUSES.has(c.status)
  ).length;
  const claimedCount = activeClaimsCount;
  const maxRecipients = batch.max_recipients;
  const progressPct =
    maxRecipients > 0 ? (claimedCount / maxRecipients) * 100 : 0;

  // Fee + net
  const feePence =
    batch.fee_pence ?? calculateFee(batch.total_amount_pence, maxRecipients);
  const netPence = batch.total_amount_pence;

  // Status display
  const statusInfo =
    BATCH_STATUS_MAP[batch.status as BatchStatus] ?? BATCH_STATUS_MAP.draft;

  // Share section data
  const showShareSection =
    batch.status === "open" || batch.status === "ready_to_approve";
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "https://polypayd.co.uk";
  const claimUrl = claimLink ? `${appUrl}/claim/${claimLink.id}` : null;
  const formattedClaimCode = formatClaimCode(batch.claim_code);
  const whatsappUrl = claimUrl
    ? `https://wa.me/?text=${encodeURIComponent(
        `Claim your share: ${claimUrl} (code: ${formattedClaimCode})`
      )}`
    : null;

  // Action buttons by status
  const actions: BatchAction[] = [];
  if (batch.status === "open") {
    actions.push(
      {
        label: "Close batch",
        endpoint: `/api/app/batches/${batch.id}/close`,
        variant: "outline",
      },
      {
        label: "Cancel batch",
        endpoint: `/api/app/batches/${batch.id}/cancel`,
        variant: "destructive",
        confirm:
          "Cancel this batch? Recipients won't be paid and any held funds will be returned to your wallet.",
      }
    );
  } else if (batch.status === "ready_to_approve") {
    actions.push(
      {
        label: "Send payouts",
        endpoint: `/api/app/batches/${batch.id}/approve`,
        variant: "primary",
      },
      {
        label: "Cancel batch",
        endpoint: `/api/app/batches/${batch.id}/cancel`,
        variant: "destructive",
        confirm:
          "Cancel this batch? Recipients won't be paid and any held funds will be returned to your wallet.",
      }
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-8">
      {/* Back link */}
      <div className="mb-6">
        <Link
          href="/app"
          className="inline-flex items-center gap-1.5 text-sm text-fp-text-secondary transition-colors hover:text-fp-text"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>
      </div>

      {/* HEADER */}
      <header className="mb-8 rounded-2xl border border-white/[0.06] bg-fp-surface p-6 sm:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold text-fp-text sm:text-3xl">
              {batch.name}
            </h1>
            <p className="mt-1 text-sm text-fp-text-muted">
              Created {formatDate(batch.created_at)}
            </p>
          </div>
          <Badge variant={statusInfo.variant} className="shrink-0 self-start">
            {statusInfo.label}
          </Badge>
        </div>

        {batch.description && (
          <p className="mt-4 max-w-2xl text-sm text-fp-text-secondary">
            {batch.description}
          </p>
        )}

        <div className="mt-6 grid grid-cols-1 gap-4 border-t border-white/[0.06] pt-6 sm:grid-cols-3">
          <SummaryStat
            label="Total amount"
            value={formatPence(batch.total_amount_pence)}
          />
          <SummaryStat label="Fee" value={formatPence(feePence)} />
          <SummaryStat
            label="Net to recipients"
            value={formatPence(netPence)}
          />
        </div>
      </header>

      {/* SHARE SECTION */}
      {showShareSection && (
        <section
          aria-labelledby="share-heading"
          className="mb-8 rounded-2xl border border-white/[0.06] bg-fp-surface p-6 sm:p-8"
        >
          <h2
            id="share-heading"
            className="text-lg font-semibold text-fp-text"
          >
            Share with recipients
          </h2>
          <p className="mt-1 text-sm text-fp-text-secondary">
            Send the link or the code. Each recipient claims their slot before
            you approve payouts.
          </p>

          <div className="mt-6 space-y-5">
            {claimUrl ? (
              <div>
                <label
                  htmlFor="claim-url"
                  className="mb-2 block text-xs font-medium uppercase tracking-wide text-fp-text-muted"
                >
                  Claim link
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id="claim-url"
                    type="text"
                    readOnly
                    value={claimUrl}
                    className="h-10 flex-1 rounded-lg border border-white/10 bg-fp-elevated px-3 text-sm text-fp-text focus:outline-none focus:ring-2 focus:ring-fp-accent/40"
                  />
                  <CopyButton
                    value={claimUrl}
                    label="Copy link"
                    variant="outline"
                  />
                </div>
              </div>
            ) : (
              <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                We couldn&apos;t find a claim link for this batch yet. Please
                refresh in a moment.
              </p>
            )}

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-fp-text-muted">
                Claim code
              </p>
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <code className="rounded-lg border border-white/10 bg-fp-elevated px-4 py-3 font-mono text-2xl font-semibold tracking-[0.18em] text-fp-text">
                  {formattedClaimCode}
                </code>
                <CopyButton
                  value={formattedClaimCode}
                  label="Copy code"
                  variant="outline"
                />
              </div>
            </div>

            {whatsappUrl && (
              <div>
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#25D366] px-4 text-sm font-medium text-white transition-colors hover:bg-[#1EBE57]"
                >
                  Share on WhatsApp
                </a>
              </div>
            )}
          </div>
        </section>
      )}

      {/* PROGRESS */}
      <section
        aria-labelledby="progress-heading"
        className="mb-8 rounded-2xl border border-white/[0.06] bg-fp-surface p-6 sm:p-8"
      >
        <div className="flex items-center justify-between gap-4">
          <h2
            id="progress-heading"
            className="text-lg font-semibold text-fp-text"
          >
            Progress
          </h2>
          <p className="text-sm text-fp-text-secondary">
            <span className="font-semibold text-fp-text">{claimedCount}</span>{" "}
            of{" "}
            <span className="font-semibold text-fp-text">{maxRecipients}</span>{" "}
            slots claimed
          </p>
        </div>
        <div className="mt-4">
          <Progress value={progressPct} />
        </div>
      </section>

      {/* CLAIMS TABLE */}
      <section
        aria-labelledby="claims-heading"
        className="mb-8 rounded-2xl border border-white/[0.06] bg-fp-surface p-6 sm:p-8"
      >
        <h2
          id="claims-heading"
          className="mb-4 text-lg font-semibold text-fp-text"
        >
          Claims
        </h2>

        {claims.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-fp-elevated/40 px-6 py-10 text-center">
            <p className="text-sm text-fp-text-secondary">
              No claims yet. Share the link above to get started.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/[0.06]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Claimed at</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {claims.map((claim) => {
                  const name = formatClaimantName(claim.users);
                  const claimedAt = claim.claimed_at ?? claim.created_at;
                  const claimStatus =
                    CLAIM_STATUS_MAP[claim.status] ??
                    CLAIM_STATUS_MAP.claimed;
                  return (
                    <TableRow key={claim.id}>
                      <TableCell className="font-medium">{name}</TableCell>
                      <TableCell>{formatPence(claim.amount_pence)}</TableCell>
                      <TableCell className="text-fp-text-secondary">
                        {claimedAt ? formatDateTime(claimedAt) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={claimStatus.variant}>
                          {claimStatus.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* ACTIONS */}
      <section
        aria-labelledby="actions-heading"
        className="rounded-2xl border border-white/[0.06] bg-fp-surface p-6 sm:p-8"
      >
        <h2
          id="actions-heading"
          className="mb-4 text-lg font-semibold text-fp-text"
        >
          Actions
        </h2>

        {batch.status === "awaiting_funding" && (
          <div className="flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-200">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Waiting for your bank payment to arrive. This usually takes
              seconds.
            </p>
          </div>
        )}

        {actions.length > 0 && (
          <BatchActions batchId={batch.id} actions={actions} />
        )}

        {batch.status !== "awaiting_funding" &&
          batch.status !== "open" &&
          batch.status !== "ready_to_approve" && (
            <p className="text-sm text-fp-text-muted">
              This batch is {statusInfo.label.toLowerCase()}. No further actions
              are available.
            </p>
          )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-fp-text-muted">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold text-fp-text">{value}</p>
    </div>
  );
}

function formatClaimantName(
  user: { first_name: string | null; last_name: string | null } | null
): string {
  if (!user) return "Unknown";
  const parts = [user.first_name, user.last_name].filter(
    (p): p is string => Boolean(p && p.trim())
  );
  return parts.length > 0 ? parts.join(" ") : "Unnamed claimant";
}
