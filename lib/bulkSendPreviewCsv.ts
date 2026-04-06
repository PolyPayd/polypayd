import Papa from "papaparse";

/** Built-in sample for "Use demo CSV" and "Download sample CSV". */
export const BULK_SEND_DEMO_CSV = `recipient_name,account_number,sort_code,amount
Olivia Carter,12345678,04-00-04,125.00
Mason Reed,87654321,20-45-45,80.50
Ava Bennett,45671234,30-10-20,250.00
Noah Foster,23456789,09-01-29,60.00
Isla Morgan,56781234,11-22-33,145.75
Liam Brooks,,40-50-60,90.00`;

export type BulkSendPreviewRowStatus = "Valid" | "Needs review";

export type BulkSendPreviewRow = {
  id: string;
  rowIndex: number;
  recipient_name: string;
  account_number: string;
  sort_code: string;
  amount: number;
  status: BulkSendPreviewRowStatus;
};

function rowStatus(
  name: string,
  accountNumber: string,
  sortCode: string,
  amount: number | null
): BulkSendPreviewRowStatus {
  const hasName = name.trim().length > 0;
  const hasAccount = accountNumber.trim().length > 0;
  const hasSort = sortCode.trim().length > 0;
  const amountOk = amount !== null && Number.isFinite(amount) && amount > 0;
  if (hasName && hasAccount && hasSort && amountOk) return "Valid";
  return "Needs review";
}

function parseAmount(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = parseFloat(t.replace(/,/g, ""));
  if (Number.isNaN(n)) return null;
  return n;
}

/**
 * Parse a CSV with columns recipient_name, account_number, sort_code, amount.
 * Headers are matched case-insensitively; extra columns are ignored.
 */
export function parseBulkSendPreviewCsv(text: string): {
  rows: BulkSendPreviewRow[];
  error: string | null;
} {
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (!trimmed) {
    return { rows: [], error: "File is empty." };
  }

  const parsed = Papa.parse<Record<string, string>>(trimmed, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
  });

  if (parsed.errors.length > 0) {
    const msg = parsed.errors[0]?.message ?? "Could not read CSV.";
    return { rows: [], error: msg };
  }

  const data = parsed.data;
  if (data.length === 0) {
    return { rows: [], error: "No data rows found." };
  }

  const first = data[0];
  const keys = Object.keys(first);
  const need = ["recipient_name", "account_number", "sort_code", "amount"] as const;
  const missing = need.filter((k) => !keys.includes(k));
  if (missing.length > 0) {
    return {
      rows: [],
      error: `Missing column(s): ${missing.join(", ")}. Use the sample CSV as a template.`,
    };
  }

  const rows: BulkSendPreviewRow[] = [];
  let i = 0;
  for (const record of data) {
    i += 1;
    const recipient_name = String(record.recipient_name ?? "").trim();
    const account_number = String(record.account_number ?? "").trim();
    const sort_code = String(record.sort_code ?? "").trim();
    const amountRaw = String(record.amount ?? "");
    const amount = parseAmount(amountRaw);
    const status = rowStatus(recipient_name, account_number, sort_code, amount);
    const safeAmount = amount !== null && Number.isFinite(amount) ? amount : 0;
    rows.push({
      id: `bulk-preview-${i}`,
      rowIndex: i,
      recipient_name,
      account_number,
      sort_code,
      amount: safeAmount,
      status,
    });
  }

  return { rows, error: null };
}

export function summarizeBulkSendPreviewRows(rows: BulkSendPreviewRow[]) {
  const recipientCount = rows.length;
  const invalidCount = rows.filter((r) => r.status === "Needs review").length;
  const validTotal = rows
    .filter((r) => r.status === "Valid")
    .reduce((sum, r) => sum + r.amount, 0);
  return { recipientCount, invalidCount, validTotal };
}
