import { NextResponse } from "next/server";
import Papa from "papaparse";
import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";
import { createHash } from "crypto";

export const runtime = "nodejs";

type Row = Record<string, string>;

function normHeader(h: string) {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

function toNumber(raw: string) {
  const cleaned = (raw ?? "").toString().trim().replace(/[,£]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function sha256(input: string) {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function rowKey(input: {
  recipient_name: string;
  account_identifier: string;
  amount: number;
  reference: string | null;
}) {
  const rn = input.recipient_name.trim().toLowerCase().replace(/\s+/g, " ");
  const ai = input.account_identifier.trim().replace(/\s+/g, " ");
  const amt = Number(input.amount).toFixed(2);
  const ref = (input.reference ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return `${rn}||${ai}||${amt}||${ref}`;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ orgId: string; batchId: string }> }
) {
  try {
    const { orgId, batchId } = await ctx.params;

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const text = await file.text();

    // ✅ Hash the content for dedupe (same content, same hash)
    const fileHash = sha256(text);

    const parsed = Papa.parse<Row>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: normHeader,
    });

    if (parsed.errors?.length) {
      return NextResponse.json(
        { error: "CSV parse error", details: parsed.errors },
        { status: 400 }
      );
    }

    const headers = parsed.meta.fields ?? [];
    const rows = parsed.data ?? [];

    const required = ["recipient_name", "account_identifier", "amount"];
    const missingCols = required.filter((c) => !headers.includes(c));
    if (missingCols.length) {
      return NextResponse.json(
        { error: "Missing required columns", missing: missingCols, got: headers },
        { status: 400 }
      );
    }

    const valid: Array<{
      rowNumber: number;
      normalized: {
        recipient_name: string;
        account_identifier: string;
        amount: number;
        reference: string | null;
      };
    }> = [];

    const invalid: Array<{
      rowNumber: number;
      errors: Array<{ field: string; message: string }>;
      raw: Row;
    }> = [];

    let totalAmount = 0;

    rows.forEach((r, idx) => {
      const rowNumber = idx + 2;
      const errors: Array<{ field: string; message: string }> = [];

      const recipient_name = (r.recipient_name ?? "").trim();
      const account_identifier = (r.account_identifier ?? "").trim();
      const reference = (r.reference ?? "").trim() || null;
      const amountN = toNumber(r.amount);

      if (!recipient_name) errors.push({ field: "recipient_name", message: "recipient_name is required" });
      if (!account_identifier) errors.push({ field: "account_identifier", message: "account_identifier is required" });
      if (amountN === null) errors.push({ field: "amount", message: "amount must be a valid number" });
      else if (amountN <= 0) errors.push({ field: "amount", message: "amount must be > 0" });

      if (errors.length) {
        invalid.push({ rowNumber, errors, raw: r });
      } else if (amountN !== null) {
        valid.push({
          rowNumber,
          normalized: { recipient_name, account_identifier, amount: amountN, reference },
        });
        totalAmount += amountN;
      }
    });

    const importPayload = {
      ok: true,
      dryRun: false,
      filename: file.name,
      fileHash,
      headers,
      rowCount: rows.length,
      validCount: valid.length,
      invalidCount: invalid.length,
      totalAmount: Number(totalAmount.toFixed(2)),
      currency: "GBP",
      valid,
      invalid,
    };

    // -----------------------
    // ✅ REAL IMPORT MODE
    // -----------------------
    const supabase = getSupabaseAdmin();

    // Confirm batch exists + belongs to org, and is editable.
    const { data: batch, error: batchErr } = await supabase
      .from("batches")
      .select("id, org_id, batch_type, status, total_amount, recipient_count")
      .eq("id", batchId)
      .maybeSingle();

    if (batchErr) {
      return NextResponse.json({ error: "Failed to load batch", details: batchErr.message }, { status: 500 });
    }
    if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    if (batch.org_id !== orgId) return NextResponse.json({ error: "Batch does not belong to org" }, { status: 403 });
    if (batch.batch_type === "standard") {
      const status = String(batch.status ?? "").toLowerCase();
      if (status === "completed" || status === "completed_with_errors") {
        return NextResponse.json({ error: "Completed Bulk Sends cannot be edited" }, { status: 409 });
      }
    }

    const { userId } = await auth();
    const uploadedBy = userId ?? "system";

    // ✅ DEDUPE: block same file content for same batch
    const { data: existingByHash, error: existingByHashErr } = await supabase
      .from("batch_uploads")
      .select("id, original_filename, created_at")
      .eq("batch_id", batchId)
      .eq("file_hash", fileHash)
      .limit(1)
      .maybeSingle();

    if (existingByHashErr) {
      return NextResponse.json(
        { error: "Failed to check existing upload hash", details: existingByHashErr.message },
        { status: 500 }
      );
    }

    if (existingByHash) {
      return NextResponse.json(
        {
          ok: false,
          error: "Duplicate upload blocked",
          message: "This CSV content has already been imported for this batch.",
          existingBatchUploadId: existingByHash.id,
          existingOriginalFilename: existingByHash.original_filename,
          existingCreatedAt: existingByHash.created_at,
          fileHash,
        },
        { status: 409 }
      );
    }

    // Optional extra dedupe: avoid inserting duplicate rows in batch_items
    const { data: existingItems, error: existingItemsErr } = await supabase
      .from("batch_items")
      .select("recipient_name, account_identifier, amount, reference")
      .eq("batch_id", batchId);

    if (existingItemsErr) {
      return NextResponse.json(
        { error: "Failed to check existing batch items", details: existingItemsErr.message },
        { status: 500 }
      );
    }

    const existingKeys = new Set<string>();
    (existingItems ?? []).forEach((it: any) => {
      existingKeys.add(
        rowKey({
          recipient_name: it.recipient_name ?? "",
          account_identifier: it.account_identifier ?? "",
          amount: Number(it.amount ?? 0),
          reference: it.reference ?? null,
        })
      );
    });

    const uniqueValid = valid.filter((v) => !existingKeys.has(rowKey(v.normalized)));
    const skippedDuplicateRows = valid.length - uniqueValid.length;

    // 1) Create batch_uploads row (now includes file_hash)
    const { data: uploadRow, error: uploadErr } = await supabase
      .from("batch_uploads")
      .insert({
        batch_id: batchId,
        file_path: null,
        original_filename: file.name,
        uploaded_by: uploadedBy,
        file_hash: fileHash,
        row_count: rows.length,
        valid_count: uniqueValid.length,
        invalid_count: invalid.length,
      })
      .select("id")
      .single();

    // If unique index catches a race condition, return a clean 409
    if (uploadErr) {
      const msg = uploadErr.message ?? "";
      if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
        return NextResponse.json(
          { ok: false, error: "Duplicate upload blocked", message: "Already imported for this batch.", fileHash },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: "Failed to create batch_uploads record", details: uploadErr.message },
        { status: 500 }
      );
    }

    const batchUploadId = uploadRow.id;

    // 2) Insert invalid errors
    if (invalid.length > 0) {
      const errorRows = invalid.flatMap((r) =>
        r.errors.map((e) => ({
          batch_upload_id: batchUploadId,
          row_number: r.rowNumber,
          field: e.field,
          message: e.message,
        }))
      );

      const { error: errInsertErr } = await supabase.from("batch_item_errors").insert(errorRows);
      if (errInsertErr) {
        return NextResponse.json(
          { error: "Failed to insert batch_item_errors", details: errInsertErr.message },
          { status: 500 }
        );
      }
    }

    // 3) Insert unique valid rows
    let importedAmount = 0;

    if (uniqueValid.length > 0) {
      const itemRows = uniqueValid.map((v) => {
        importedAmount += v.normalized.amount;
        return {
          batch_id: batchId,
          recipient_name: v.normalized.recipient_name,
          account_identifier: v.normalized.account_identifier,
          amount: v.normalized.amount,
          reference: v.normalized.reference,
          status: "pending",
          failure_reason: null,
        };
      });

      const { error: itemsErr } = await supabase.from("batch_items").insert(itemRows);
      if (itemsErr) {
        return NextResponse.json(
          { error: "Failed to insert batch_items", details: itemsErr.message },
          { status: 500 }
        );
      }
    }

    // 4) Update batch totals
    const existingTotal = Number(batch.total_amount ?? 0);
    const existingCount = Number(batch.recipient_count ?? 0);

    const newTotal = Number((existingTotal + importedAmount).toFixed(2));
    const newCount = existingCount + uniqueValid.length;

    const { error: updErr } = await supabase
      .from("batches")
      .update({ total_amount: newTotal, recipient_count: newCount })
      .eq("id", batchId);

    if (updErr) {
      return NextResponse.json(
        { error: "Failed to update batch totals", details: updErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      dryRun: false,
      batchUploadId,
      filename: file.name,
      fileHash,
      rowCount: rows.length,
      validCount: valid.length,
      invalidCount: invalid.length,
      insertedCount: uniqueValid.length,
      skippedDuplicateRows,
      importedAmount: Number(importedAmount.toFixed(2)),
      currency: "GBP",
      batchTotals: { total_amount: newTotal, recipient_count: newCount },
      imported: importPayload,
    });
  } catch (err: any) {
    console.error("upload-csv error:", err);
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}