import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { ArrowLeft, Users, Calendar, Info } from "lucide-react";
import { requireUser } from "@/src/lib/users";
import { createServerClient } from "@/src/lib/db/client";
import { formatClaimCode } from "@/src/lib/db/types";
import { calculateFee } from "@/src/lib/fees";
import type { Batch, BatchStatus, Claim, ClaimStatus, ClaimLink } from "@/src/lib/db/types";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { CopyButton } from "@/src/components/app/CopyButton";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const BATCH_STATUS_MAP: Record<BatchStatus, { variant: BadgeVariant; label: string }> = {
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

const CLAIM_STATUS_MAP: Record<ClaimStatus, { variant: BadgeVariant; label: string }> = {
  slot_held:        { variant: "gray",   label: "Slot held" },
  claimed:          { variant: "blue",   label: "Claimed" },
  expired:          { variant: "red",    label: "Expired" },
  payout_pending:   { variant: "purple", label: "Payout pending" },
  payout_completed: { variant: "green",  label: "Paid out" },
  payout_failed:    { variant: "red",    label: "Payout failed" },
  cancelled:        { variant: "red",    label: "Cancelled" },
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

  const [batchResult, claimsResult, claimLinkResult] = await Promise.all([
    db
      .from("batches")
      .select("*")
      .eq("id", id)
      .eq("sender_user_id", user.id)
      .maybeSingle(),

    db
      .from("claims")
      .select("id, amount_pence, status, created_at, claimed_at")
      .eq("batch_id", id)
      .order("created_at", { ascending: false }),

    db
      .from("claim_links")
      .select("id, is_active")
      .eq("batch_id", id)
      .maybeSingle(),
  ]);

  if (!batchResult.data) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-fp-text-secondary">Batch not found.</p>
        <Link
          href="/app/batches"
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-fp-accent hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to batches
        </Link>
      </div>
    );
  }

  const batch = batchResult.data as unknown as Batch;
  const claims = (claimsResult.data ?? []) as Pick<
    Claim,
    "id" | "amount_pence" | "status" | "created_at" | "claimed_at"
  >[];
  const claimLink = claimLinkResult.data as unknown as Pick<ClaimLink, "id" | "is_active"> | null;

  const { variant: statusVariant, label: statusLabel } =
    BATCH_STATUS_MAP[batch.status] ?? BATCH_STATUS_MAP.draft;

  const activeClaims = claims.filter((c) =>
    ["claimed", "payout_pending", "payout_completed", "payout_failed"].includes(c.status)
  );
  const filledSlots = activeClaims.length;
  const progressPct = Math.round((filledSlots / batch.max_recipients) * 100);

  const fee = calculateFee(batch.total_amount_pence, batch.max_recipients);
  const totalCharge = batch.total_amount_pence + fee;

  const modeLabel = batch.mode === "equal_shares" ? "Equal shares" : "Custom amounts";
  const closingLabel =
    batch.closing_mode === "close_when_full" ? "Closes when full" : "Manual close";

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
      {/* Back nav */}
      <Link
        href="/app/batches"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-fp-text-muted transition-colors hover:text-fp-text"
      >
        <ArrowLeft className="h-4 w-4" />
        All batches
      </Link>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-fp-text">{batch.name}</h1>
          {batch.description && (
            <p className="mt-1 text-sm text-fp-text-secondary">{batch.description}</p>
          )}
        </div>
        <Badge variant={statusVariant}>{statusLabel}</Badge>
      </div>

      {/* Meta row */}
      <div className="mb-8 flex flex-wrap gap-4 text-sm text-fp-text-muted">
        <span className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5" />
          Created {formatDate(batch.created_at)}
        </span>
        <span className="flex items-center gap-1.5">
          <Info className="h-3.5 w-3.5" />
          {modeLabel} &middot; {closingLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          {filledSlots} / {batch.max_recipients} claimed
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-8">
        <div className="mb-1.5 flex justify-between text-xs text-fp-text-muted">
          <span>Slot progress</span>
          <span>{progressPct}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-fp-accent transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Two-column details + invite */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        {/* Financials */}
        <div className="rounded-xl border border-white/[0.06] bg-fp-surface p-5">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-fp-text-muted">
            Financials
          </h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-fp-text-muted">Total payout</dt>
              <dd className="font-medium text-fp-text">
                {formatPence(batch.total_amount_pence)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-fp-text-muted">Service fee</dt>
              <dd className="font-medium text-fp-text">{formatPence(fee)}</dd>
            </div>
            <div className="flex justify-between border-t border-white/[0.06] pt-2">
              <dt className="text-fp-text-muted">You pay</dt>
              <dd className="font-semibold text-fp-text">{formatPence(totalCharge)}</dd>
            </div>
            {batch.mode === "equal_shares" && (
              <div className="flex justify-between border-t border-white/[0.06] pt-2">
                <dt className="text-fp-text-muted">Per recipient</dt>
                <dd className="font-medium text-fp-text">
                  {formatPence(Math.floor(batch.total_amount_pence / batch.max_recipients))}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Invite */}
        <div className="rounded-xl border border-white/[0.06] bg-fp-surface p-5">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-fp-text-muted">
            Invite recipients
          </h2>
          <div className="mb-3">
            <p className="mb-1 text-xs text-fp-text-muted">Claim code</p>
            <p className="font-mono text-lg font-semibold tracking-widest text-fp-text">
              {formatClaimCode(batch.claim_code)}
            </p>
          </div>
          {claimLink && (
            <div className="flex flex-wrap gap-2">
              <CopyButton
                value={formatClaimCode(batch.claim_code)}
                label="Copy code"
              />
              <CopyButton
                value={`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/claim/${claimLink.id}`}
                label="Copy link"
              />
            </div>
          )}
          {!claimLink?.is_active && (
            <p className="mt-3 text-xs text-fp-text-muted">
              Invite link is inactive for this batch.
            </p>
          )}
        </div>
      </div>

      {/* Claims list */}
      <div>
        <h2 className="mb-4 text-base font-semibold text-fp-text">
          Claims{" "}
          <span className="ml-1 text-sm font-normal text-fp-text-muted">
            ({claims.length})
          </span>
        </h2>

        {claims.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-fp-surface py-10 text-center">
            <p className="text-sm text-fp-text-muted">No claims yet.</p>
            <p className="mt-1 text-xs text-fp-text-muted">
              Share the claim code above to get started.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-fp-surface">
            <ul className="divide-y divide-white/[0.04]">
              {claims.map((c) => {
                const { variant, label } =
                  CLAIM_STATUS_MAP[c.status] ?? CLAIM_STATUS_MAP.claimed;
                return (
                  <li
                    key={c.id}
                    className="flex items-center justify-between px-5 py-4"
                  >
                    <div>
                      <p className="text-sm font-medium text-fp-text">
                        {formatPence(c.amount_pence)}
                      </p>
                      <p className="mt-0.5 text-xs text-fp-text-muted">
                        {formatDate(c.claimed_at ?? c.created_at)}
                      </p>
                    </div>
                    <Badge variant={variant}>{label}</Badge>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
