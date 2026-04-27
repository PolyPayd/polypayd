import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import { requireUser } from "@/lib/users";
import { createServerClient } from "@/lib/db/client";
import { generateClaimCode } from "@/lib/claim-codes";
import { calculateFee } from "@/lib/fees";
import { logAuditEvent } from "@/lib/audit";

// POST /api/app/batches
//
// Creates a new batch in `awaiting_funding` state. For custom_amounts mode,
// also inserts the per-recipient slots. The claim code is generated locally
// with rejection-sampled randomness; we retry on the unique constraint
// violation (Postgres SQLSTATE 23505) up to MAX_CLAIM_CODE_ATTEMPTS times.
//
// Returns 201 { batchId } on success.

const FEES_LEDGER_ACCOUNT_ID = "00000000-0000-0000-0000-000000000001";
const MAX_CLAIM_CODE_ATTEMPTS = 5;
// £10,000 cap mirrors the client-side total_amount_gbp guard.
const MAX_TOTAL_PENCE = 1_000_000;

const recipientSchema = z.object({
  label: z.string().max(120),
  amount_pence: z.number().int().positive(),
});

const bodySchema = z.object({
  name:           z.string().min(1).max(80),
  description:    z.string().max(300).optional(),
  mode:           z.enum(["equal_shares", "custom_amounts"]),
  closing_mode:   z.enum(["close_when_full", "manual_close"]),
  total_pence:    z.number().int().positive().max(MAX_TOTAL_PENCE),
  max_recipients: z.number().int().min(1).max(100),
  recipients:     z.array(recipientSchema).max(50).optional(),
});

export async function POST(req: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let user;
  try {
    user = await requireUser(userId);
  } catch {
    return Response.json({ error: "user_not_found" }, { status: 404 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: "validation_error", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const {
    name,
    description,
    mode,
    closing_mode,
    total_pence,
    max_recipients,
    recipients,
  } = parsed.data;

  // Custom mode: recipients required and their sum must equal total_pence.
  if (mode === "custom_amounts") {
    if (!recipients || recipients.length === 0) {
      return Response.json(
        {
          error: "validation_error",
          message: "Custom amounts mode requires at least one recipient",
        },
        { status: 422 }
      );
    }
    const recipientsTotal = recipients.reduce(
      (sum, r) => sum + r.amount_pence,
      0
    );
    if (recipientsTotal !== total_pence) {
      return Response.json(
        {
          error: "validation_error",
          message: "Recipients total must equal total_pence",
        },
        { status: 422 }
      );
    }
  }

  const feePence = calculateFee(total_pence, max_recipients);
  const db = createServerClient();

  let batchId: string | null = null;
  for (let attempt = 0; attempt < MAX_CLAIM_CODE_ATTEMPTS; attempt++) {
    const claimCode = generateClaimCode();

    const { data: batch, error } = await db
      .from("batches")
      .insert({
        sender_user_id:     user.id,
        name,
        description:        description ?? null,
        mode,
        closing_mode,
        status:             "awaiting_funding",
        total_amount_pence: total_pence,
        fee_pence:          feePence,
        max_recipients,
        claim_code:         claimCode,
      })
      .select("id")
      .single();

    if (!error && batch) {
      batchId = batch.id;
      break;
    }

    // 23505 = unique_violation — retry with a freshly generated claim code.
    const code = (error as { code?: string } | null)?.code;
    if (code && code !== "23505") {
      console.error("[batches] insert error:", error);
      return Response.json({ error: "internal" }, { status: 500 });
    }
  }

  if (!batchId) {
    return Response.json(
      { error: "internal", message: "Failed to generate unique claim code" },
      { status: 500 }
    );
  }

  // Public claim-link record for the share URL.
  const { error: claimLinkError } = await db
    .from("claim_links")
    .insert({ batch_id: batchId });
  if (claimLinkError) {
    console.error("[batches] claim_links insert error:", claimLinkError);
  }

  // Per-recipient slots for custom_amounts batches.
  if (mode === "custom_amounts" && recipients && recipients.length > 0) {
    const slots = recipients.map((r, i) => ({
      batch_id:       batchId as string,
      slot_index:     i,
      amount_pence:   r.amount_pence,
      reference_name: r.label || null,
    }));
    const { error: slotError } = await db.from("batch_slots").insert(slots);
    if (slotError) {
      // Non-fatal: the batch exists; surface in logs and continue.
      console.error("[batches] slot insert error:", slotError);
    }
  }

  // Reserve fees against the batch escrow account so reconciliation tools
  // see the upcoming charge before funding lands.
  const { data: escrowAccount } = await db
    .from("ledger_accounts")
    .insert({ type: "batch_escrow", batch_id: batchId })
    .select("id")
    .single();

  if (escrowAccount) {
    const txId = crypto.randomUUID();
    const { error: ledgerError } = await db.from("ledger_entries").insert([
      {
        account_id:     FEES_LEDGER_ACCOUNT_ID,
        direction:      "credit",
        amount_pence:   feePence,
        transaction_id: txId,
        reference:      `fee_reservation:${batchId}`,
      },
      {
        account_id:     escrowAccount.id,
        direction:      "debit",
        amount_pence:   feePence,
        transaction_id: txId,
        reference:      `fee_reservation:${batchId}`,
      },
    ]);
    if (ledgerError) {
      console.error("[batches] ledger insert error:", ledgerError);
    }
  }

  await logAuditEvent({
    userId:     user.id,
    action:     "batch_created",
    entityType: "batch",
    entityId:   batchId,
    metadata:   {
      name,
      mode,
      total_pence,
      fee_pence: feePence,
      max_recipients,
    },
  });

  return Response.json({ batchId }, { status: 201 });
}
