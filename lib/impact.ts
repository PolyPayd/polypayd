import type { SupabaseClient } from "@supabase/supabase-js";

/** Matches DB: round(platform_fee * 0.01, 2) */
export function impactAmountFromPlatformFee(platformFee: number | null | undefined): number {
  const f = Number(platformFee ?? 0);
  if (!Number.isFinite(f) || f <= 0) return 0;
  return Math.round(f * 0.01 * 100) / 100;
}

export function formatImpactMoney(amount: number, currency = "GBP"): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
}

/** Placeholder: tune with real charity reporting later */
export function estimateLivesImpacted(totalImpactGbp: number): number {
  if (!Number.isFinite(totalImpactGbp) || totalImpactGbp <= 0) return 0;
  // £1 ≈ 0.4 “lives touched” month-equivalent (illustrative only)
  return Math.max(1, Math.floor(totalImpactGbp * 0.4));
}

function isMissingImpactTable(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const m = (error.message ?? "").toLowerCase();
  return (
    error.code === "42P01" ||
    m.includes("impact_ledger") && m.includes("does not exist") ||
    m.includes("could not find the table")
  );
}

export type ImpactFeedItem = {
  id: string;
  amount: number;
  currency: string;
  createdAt: string;
  referenceType: string | null;
  referenceId: string | null;
};

export type ImpactBreakdown = {
  bulkSend: number;
  claimLink: number;
};

export type ImpactDashboardData = {
  totalAllTime: number;
  totalThisMonth: number;
  livesEstimate: number;
  breakdown: ImpactBreakdown;
  feed: ImpactFeedItem[];
  distributions: Array<{
    id: string;
    beneficiaryName: string;
    amount: number;
    currency: string;
    status: string;
    createdAt: string;
  }>;
  currency: string;
  schemaReady: boolean;
};

function startOfUtcMonth(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

/** PostgREST `in` list size guard */
const UUID_IN_CHUNK = 100;

function chunkIds(ids: string[], size: number): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    out.push(ids.slice(i, i + size));
  }
  return out;
}

async function probeImpactLedgerSchema(supabase: SupabaseClient): Promise<boolean> {
  const { error } = await supabase.from("impact_ledger").select("id").limit(1);
  if (error && isMissingImpactTable(error)) return false;
  return true;
}

/**
 * Ledger debits on this user's wallet = batches they funded (platform fee / impact slice applies here).
 * Receiving claim-link credits does not create debits, so recipients see no impact from others' fees.
 */
export async function loadUserImpactSourceTransactionIds(
  supabase: SupabaseClient,
  userId: string,
  walletCurrency = "GBP"
): Promise<string[]> {
  const { data: wallet, error: wErr } = await supabase
    .from("wallets")
    .select("id")
    .eq("user_id", userId)
    .eq("currency", walletCurrency)
    .maybeSingle();

  if (wErr || !wallet?.id) {
    return [];
  }

  const { data: debits, error: dErr } = await supabase
    .from("ledger_entries")
    .select("transaction_id")
    .eq("wallet_id", wallet.id)
    .eq("entry_type", "debit");

  if (dErr) {
    console.error("ledger_entries user debits failed:", dErr);
    return [];
  }

  return [...new Set((debits ?? []).map((d) => d.transaction_id).filter(Boolean))] as string[];
}

type ImpactLedgerRow = {
  id: string;
  amount: number;
  currency: string;
  created_at: string;
  source_transaction_id: string;
};

async function fetchImpactLedgerRowsForSourceTransactions(
  supabase: SupabaseClient,
  sourceTxnIds: string[]
): Promise<ImpactLedgerRow[]> {
  if (sourceTxnIds.length === 0) return [];
  const merged: ImpactLedgerRow[] = [];
  for (const slice of chunkIds(sourceTxnIds, UUID_IN_CHUNK)) {
    const { data, error } = await supabase
      .from("impact_ledger")
      .select("id, amount, currency, created_at, source_transaction_id")
      .in("source_transaction_id", slice);
    if (error) {
      if (isMissingImpactTable(error)) return [];
      console.error("impact_ledger fetch by source txn failed:", error);
      continue;
    }
    for (const r of data ?? []) {
      merged.push({
        id: r.id as string,
        amount: Number(r.amount ?? 0),
        currency: (r.currency as string) || "GBP",
        created_at: (r.created_at as string) ?? "",
        source_transaction_id: r.source_transaction_id as string,
      });
    }
  }
  return merged;
}

async function fetchLedgerTransactionRefs(
  supabase: SupabaseClient,
  txnIds: string[]
): Promise<Map<string, { reference_type: string | null; reference_id: string | null }>> {
  const map = new Map<string, { reference_type: string | null; reference_id: string | null }>();
  if (txnIds.length === 0) return map;
  for (const slice of chunkIds(txnIds, UUID_IN_CHUNK)) {
    const { data: txns, error } = await supabase
      .from("ledger_transactions")
      .select("id, reference_type, reference_id")
      .in("id", slice);
    if (error) {
      console.error("ledger_transactions fetch failed:", error);
      continue;
    }
    for (const t of txns ?? []) {
      map.set(t.id as string, { reference_type: t.reference_type ?? null, reference_id: t.reference_id ?? null });
    }
  }
  return map;
}

function breakdownFromRows(
  impactRows: ImpactLedgerRow[],
  refByTxn: Map<string, { reference_type: string | null; reference_id: string | null }>
): ImpactBreakdown {
  const breakdown: ImpactBreakdown = { bulkSend: 0, claimLink: 0 };
  for (const r of impactRows) {
    const ref = refByTxn.get(r.source_transaction_id);
    const rt = String(ref?.reference_type ?? "").toLowerCase();
    const amt = r.amount;
    if (rt === "batch_run") breakdown.bulkSend += amt;
    else if (rt === "batch_payout") breakdown.claimLink += amt;
  }
  return breakdown;
}

/**
 * Impact dashboard for the signed-in user only: totals, breakdown, and feed come from
 * `impact_ledger` rows tied to ledger transactions that debited their wallet (fees on sends they funded).
 */
export async function fetchImpactDashboardData(
  supabase: SupabaseClient,
  viewerUserId: string
): Promise<ImpactDashboardData> {
  const currency = "GBP";
  const empty: ImpactDashboardData = {
    totalAllTime: 0,
    totalThisMonth: 0,
    livesEstimate: 0,
    breakdown: { bulkSend: 0, claimLink: 0 },
    feed: [],
    distributions: [],
    currency,
    schemaReady: true,
  };

  const schemaReady = await probeImpactLedgerSchema(supabase);
  if (!schemaReady) {
    return { ...empty, schemaReady: false };
  }

  const sourceTxnIds = await loadUserImpactSourceTransactionIds(supabase, viewerUserId, currency);
  if (sourceTxnIds.length === 0) {
    return empty;
  }

  const impactRows = await fetchImpactLedgerRowsForSourceTransactions(supabase, sourceTxnIds);
  if (impactRows.length === 0) {
    return empty;
  }

  const monthStart = startOfUtcMonth().toISOString();
  let totalAllTime = 0;
  let totalThisMonth = 0;
  for (const r of impactRows) {
    totalAllTime += r.amount;
    if (r.created_at >= monthStart) totalThisMonth += r.amount;
  }

  const distinctTxnIds = [...new Set(impactRows.map((r) => r.source_transaction_id))];
  const refByTxn = await fetchLedgerTransactionRefs(supabase, distinctTxnIds);
  const breakdown = breakdownFromRows(impactRows, refByTxn);

  const sorted = [...impactRows].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  const feed: ImpactFeedItem[] = sorted.slice(0, 20).map((r) => {
    const ref = refByTxn.get(r.source_transaction_id);
    return {
      id: r.id,
      amount: r.amount,
      currency: r.currency || currency,
      createdAt: r.created_at,
      referenceType: ref?.reference_type ?? null,
      referenceId: ref?.reference_id ?? null,
    };
  });

  const impactLedgerIds = impactRows.map((r) => r.id);
  const distributions: ImpactDashboardData["distributions"] = [];
  for (const slice of chunkIds(impactLedgerIds, UUID_IN_CHUNK)) {
    const { data: distRows, error: distErr } = await supabase
      .from("impact_distributions")
      .select("id, beneficiary_name, amount, currency, status, created_at")
      .in("impact_ledger_id", slice)
      .order("created_at", { ascending: false });

    if (distErr) {
      break;
    }
    for (const d of distRows ?? []) {
      distributions.push({
        id: d.id as string,
        beneficiaryName: String(d.beneficiary_name ?? ""),
        amount: Number(d.amount ?? 0),
        currency: (d.currency as string) || currency,
        status: String(d.status ?? ""),
        createdAt: (d.created_at as string) ?? "",
      });
    }
  }

  distributions.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));

  return {
    totalAllTime,
    totalThisMonth,
    livesEstimate: estimateLivesImpacted(totalAllTime),
    breakdown,
    feed,
    distributions: distributions.slice(0, 50),
    currency,
    schemaReady: true,
  };
}

export async function fetchUserImpactContributionTotal(
  supabase: SupabaseClient,
  userId: string,
  walletCurrency = "GBP"
): Promise<{ total: number; schemaReady: boolean }> {
  const schemaReady = await probeImpactLedgerSchema(supabase);
  if (!schemaReady) {
    return { total: 0, schemaReady: false };
  }

  const txnIds = await loadUserImpactSourceTransactionIds(supabase, userId, walletCurrency);
  if (txnIds.length === 0) {
    return { total: 0, schemaReady: true };
  }

  let total = 0;
  for (const slice of chunkIds(txnIds, UUID_IN_CHUNK)) {
    const { data: impactRows, error: iErr } = await supabase
      .from("impact_ledger")
      .select("amount")
      .in("source_transaction_id", slice);

    if (iErr) {
      if (isMissingImpactTable(iErr)) {
        return { total: 0, schemaReady: false };
      }
      console.error("impact_ledger user sum failed:", iErr);
      return { total: 0, schemaReady: true };
    }
    total += (impactRows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
  }

  return { total, schemaReady: true };
}

export function impactReferenceLabel(referenceType: string | null): string {
  const t = (referenceType ?? "").toLowerCase();
  if (t === "batch_run") return "Bulk Send";
  if (t === "batch_payout") return "Claim Link";
  return referenceType ? referenceType : "Contribution";
}
