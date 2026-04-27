import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { ChevronRight } from "lucide-react";
import { requireUser } from "@/src/lib/users";
import { createServerClient } from "@/src/lib/db/client";
import type { ClaimStatus } from "@/src/lib/db/types";
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

const STATUS_MAP: Record<ClaimStatus, { variant: BadgeVariant; label: string }> = {
  slot_held:        { variant: "gray",   label: "Slot held" },
  claimed:          { variant: "blue",   label: "Claimed" },
  expired:          { variant: "red",    label: "Expired" },
  payout_pending:   { variant: "purple", label: "Payout pending" },
  payout_completed: { variant: "green",  label: "Paid out" },
  payout_failed:    { variant: "red",    label: "Payout failed" },
  cancelled:        { variant: "red",    label: "Cancelled" },
};

type ClaimRow = {
  id: string;
  batch_id: string;
  amount_pence: number;
  status: ClaimStatus;
  claimed_at: string | null;
  created_at: string;
  batches: { id: string; name: string } | null;
};

export default async function ClaimsPage() {
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
    .from("claims")
    .select("id, batch_id, amount_pence, status, claimed_at, created_at, batches(id, name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const claims = (data ?? []) as ClaimRow[];

  const pending = claims.filter((c) =>
    ["slot_held", "claimed", "payout_pending"].includes(c.status)
  );
  const completed = claims.filter((c) =>
    ["payout_completed", "payout_failed", "expired", "cancelled"].includes(c.status)
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-fp-text">My claims</h1>
        <p className="mt-1 text-sm text-fp-text-secondary">
          Payments you&apos;ve claimed from batch invites.
        </p>
      </div>

      {claims.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-fp-surface py-16 text-center">
          <p className="text-sm text-fp-text-muted">No claims yet.</p>
          <p className="mt-1 text-xs text-fp-text-muted">
            Use a claim code or invite link to receive a payment.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {pending.length > 0 && (
            <Section title="Pending" claims={pending} />
          )}
          {completed.length > 0 && (
            <Section title="History" claims={completed} />
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, claims }: { title: string; claims: ClaimRow[] }) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-fp-text-muted">
        {title}
      </h2>
      <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-fp-surface">
        <ul className="divide-y divide-white/[0.04]">
          {claims.map((c) => {
            const { variant, label } = STATUS_MAP[c.status] ?? STATUS_MAP.claimed;
            const batchName = c.batches?.name ?? "Unknown batch";
            const date = c.claimed_at ?? c.created_at;
            return (
              <li key={c.id}>
                <Link
                  href={`/app/batches/${c.batch_id}`}
                  className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-white/[0.02]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-fp-text">{batchName}</p>
                    <p className="mt-0.5 text-xs text-fp-text-muted">{formatDate(date)}</p>
                  </div>
                  <span className="shrink-0 font-semibold text-fp-text">
                    {formatPence(c.amount_pence)}
                  </span>
                  <Badge variant={variant}>{label}</Badge>
                  <ChevronRight className="h-4 w-4 shrink-0 text-fp-text-muted" />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
