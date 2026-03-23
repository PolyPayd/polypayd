"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureWalletForUser } from "@/lib/wallet";

export type AddFundsState = { error?: string; success?: boolean };

export async function addFunds(
  orgId: string,
  amount: number,
  currency: string,
  _note?: string
): Promise<AddFundsState> {
  const { userId } = await auth();
  if (!userId) return { error: "You must be signed in to add funds." };

  if (amount <= 0 || !Number.isFinite(amount)) return { error: "Amount must be greater than 0." };
  const safeAmount = Math.round(amount * 100) / 100;
  const curr = (currency || "GBP").trim() || "GBP";

  const supabase = supabaseAdmin();
  const wallet = await ensureWalletForUser(supabase, userId, curr);
  if (!wallet) return { error: "Failed to get or create wallet." };
  const walletId = wallet.id;

  const { data: txn, error: txnErr } = await supabase
    .from("ledger_transactions")
    .insert({
      reference_type: "wallet_funding",
      reference_id: walletId,
      status: "posted",
    })
    .select("id")
    .single();

  if (txnErr || !txn) return { error: txnErr?.message ?? "Failed to create transaction." };

  const { error: entryErr } = await supabase.from("ledger_entries").insert({
    transaction_id: txn.id,
    wallet_id: walletId,
    amount: safeAmount,
    entry_type: "credit",
  });

  if (entryErr) return { error: entryErr.message };

  const newBalance = wallet.current_balance + safeAmount;
  const { error: updateErr } = await supabase
    .from("wallets")
    .update({ current_balance: newBalance, updated_at: new Date().toISOString() })
    .eq("id", walletId);

  if (updateErr) return { error: updateErr.message };

  revalidatePath(`/app/wallet`);
  return { success: true };
}
