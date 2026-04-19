import type { SupabaseClient } from "@supabase/supabase-js";

const EPS = 0.005;

/**
 * Top-up lifecycle in the UI. `failed` is reserved for future use (failed card charges do not post
 * `wallet_funding` ledger rows today, so there is usually nothing to list).
 */
export type WalletRecentStatusVariant = "pending" | "available" | "partial" | "allocated" | "failed" | null;

export type WalletRecentTransactionRow = {
  id: string;
  date: string;
  typeLabel: string;
  /** Top-ups only; other activity uses null (show em dash). */
  statusLabel: string | null;
  statusVariant: WalletRecentStatusVariant;
  entry_type: string;
  amount: number;
};

type LedgerEntryRow = {
  id: string;
  transaction_id: string;
  amount: unknown;
  entry_type: string | null;
  reference_type: string | null;
  created_at: string | null;
  ledger_transactions: { id?: string; reference_type?: string; created_at?: string } | null;
};

export type WalletTopupQueueRow = {
  id: string;
  ledger_transaction_id: string | null;
  amount_gbp: unknown;
  released_to_current_gbp: unknown;
  consumed_by_payout_gbp: unknown;
  created_at: string | null;
};

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Exported for tests / status logic reuse. */
export function topUpStatusFromQueueRow(q: WalletTopupQueueRow): {
  label: string;
  variant: Exclude<WalletRecentStatusVariant, null>;
} {
  const total = num(q.amount_gbp);
  const released = num(q.released_to_current_gbp);
  const consumed = num(q.consumed_by_payout_gbp);
  const pendingRemain = total - released - consumed;

  if (pendingRemain <= EPS && released > EPS) {
    return { label: "Available", variant: "available" };
  }
  if (released <= EPS && pendingRemain > EPS) {
    return { label: "Pending", variant: "pending" };
  }
  if (pendingRemain <= EPS && released <= EPS && consumed > EPS) {
    return { label: "Allocated", variant: "allocated" };
  }
  if (pendingRemain > EPS && released > EPS) {
    return { label: "Partial", variant: "partial" };
  }
  return { label: "Pending", variant: "pending" };
}

function topUpStatus(q: WalletTopupQueueRow): { label: string; variant: Exclude<WalletRecentStatusVariant, null> } {
  return topUpStatusFromQueueRow(q);
}

/**
 * One user-facing row per top-up (`wallet_topup_release_queue`). Hides `wallet_funding_release` so
 * settlement does not look like a second credit. Ledger / audit rows are unchanged in the database.
 */
export async function fetchWalletRecentTransactionRows(
  supabase: SupabaseClient,
  walletId: string,
  opts: { ledgerLimit?: number; maxRows?: number } = {}
): Promise<WalletRecentTransactionRow[]> {
  const ledgerLimit = opts.ledgerLimit ?? 120;
  const maxRows = opts.maxRows ?? 50;

  const { data: entries, error: entErr } = await supabase
    .from("ledger_entries")
    .select(
      "id, transaction_id, amount, entry_type, reference_type, created_at, ledger_transactions(id, reference_type, created_at)"
    )
    .eq("wallet_id", walletId)
    .order("created_at", { ascending: false })
    .limit(ledgerLimit);

  if (entErr) {
    console.error("fetchWalletRecentTransactionRows ledger_entries:", entErr.message);
    return [];
  }

  const { data: queues, error: qErr } = await supabase
    .from("wallet_topup_release_queue")
    .select("id, ledger_transaction_id, amount_gbp, released_to_current_gbp, consumed_by_payout_gbp, created_at")
    .eq("wallet_id", walletId);

  if (qErr) {
    console.error("fetchWalletRecentTransactionRows wallet_topup_release_queue:", qErr.message);
  }

  const queueByLedgerTxn = new Map<string, WalletTopupQueueRow>();
  for (const q of queues ?? []) {
    const tid = q.ledger_transaction_id;
    if (typeof tid === "string" && tid.length > 0) {
      queueByLedgerTxn.set(tid, q as WalletTopupQueueRow);
    }
  }

  const out: WalletRecentTransactionRow[] = [];
  const usedFundingTxnIds = new Set<string>();

  for (const row of (entries ?? []) as LedgerEntryRow[]) {
    const txn = row.ledger_transactions;
    const entryRef = typeof row.reference_type === "string" ? row.reference_type : null;
    const parentRef = typeof txn?.reference_type === "string" ? txn.reference_type : null;
    const refType = entryRef ?? parentRef ?? "-";

    if (refType === "wallet_funding_release") {
      continue;
    }

    if (refType === "wallet_topup_instant_release") {
      continue;
    }

    if (refType === "claim_completed" && row.entry_type === "credit") {
      out.push({
        id: row.id,
        date: row.created_at ?? "",
        typeLabel: "Batch claim",
        statusLabel: "Available",
        statusVariant: "available",
        entry_type: row.entry_type ?? "credit",
        amount: num(row.amount),
      });
      continue;
    }

    if (refType === "wallet_funding" && row.entry_type === "credit") {
      const tid = row.transaction_id;
      if (usedFundingTxnIds.has(tid)) {
        continue;
      }
      usedFundingTxnIds.add(tid);

      const q = queueByLedgerTxn.get(tid);
      if (q) {
        const st = topUpStatus(q);
        out.push({
          id: `wallet-topup-${q.id}`,
          date: row.created_at ?? q.created_at ?? "",
          typeLabel: "Top-up",
          statusLabel: st.label,
          statusVariant: st.variant,
          entry_type: "credit",
          amount: num(q.amount_gbp),
        });
      } else {
        out.push({
          id: row.id,
          date: row.created_at ?? "",
          typeLabel: "Top-up",
          statusLabel: null,
          statusVariant: null,
          entry_type: row.entry_type ?? "credit",
          amount: num(row.amount),
        });
      }
      continue;
    }

    out.push({
      id: row.id,
      date: row.created_at ?? "",
      typeLabel: mapLedgerReferenceType(refType),
      statusLabel: null,
      statusVariant: null,
      entry_type: row.entry_type ?? "-",
      amount: num(row.amount),
    });
  }

  out.sort((a, b) => {
    const ta = a.date ? new Date(a.date).getTime() : 0;
    const tb = b.date ? new Date(b.date).getTime() : 0;
    return tb - ta;
  });

  return out.slice(0, maxRows);
}

function mapLedgerReferenceType(refType: string): string {
  if (refType === "batch_run") return "Bulk Send";
  if (refType === "batch_payout") return "Claim Link Payout";
  if (refType === "claim_completed") return "Batch claim";
  if (refType === "wallet_funding") return "Top-up";
  if (refType === "stripe_balance_available") return "Settlement sync";
  if (refType === "wallet_topup_instant_release") return "Top-up (release)";
  if (refType === "stripe_connect_withdrawal") return "Withdrawal";
  return refType;
}
