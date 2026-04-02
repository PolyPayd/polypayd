import "server-only";
import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getStripeConnectTestCreatePrefill,
  isStripeSecretKeyTestMode,
} from "@/lib/stripeConnectTestPrefill";
import { isInvalidConnectAccountForPlatformError } from "@/lib/stripeConnectErrors";

export function stripeApiModeForSecretKey(secretKey: string | undefined): "test" | "live" {
  return isStripeSecretKeyTestMode(secretKey) ? "test" : "live";
}

type ConnectRow = {
  stripe_account_id: string;
  stripe_api_mode: string | null;
};

export type EnsureStripeConnectAccountResult =
  | {
      ok: true;
      stripeAccountId: string;
      /** Row was removed because it was wrong mode or unknown to Stripe, then recreated */
      replacedStaleRow: boolean;
      /** No prior row or row was cleared */
      createdNew: boolean;
    }
  | { ok: false; error: string; status: number; errorCode?: string };

/**
 * Ensures `stripe_connect_accounts` has a Connect account id valid for the current STRIPE_SECRET_KEY.
 * - Mismatched `stripe_api_mode` (after migration) → delete row and recreate when allowCreate.
 * - accounts.retrieve fails with “not on platform” → delete row and recreate when allowCreate.
 */
export async function ensureStripeExpressAccountForUser(opts: {
  supabase: SupabaseClient;
  stripe: Stripe;
  userId: string;
  secretKey: string | undefined;
  allowCreate: boolean;
  testPrefillEmail?: string | null;
}): Promise<EnsureStripeConnectAccountResult> {
  const mode = stripeApiModeForSecretKey(opts.secretKey);

  const { data: existing, error: selErr } = await opts.supabase
    .from("stripe_connect_accounts")
    .select("stripe_account_id, stripe_api_mode")
    .eq("user_id", opts.userId)
    .maybeSingle();

  if (selErr) {
    console.error("stripe_connect_accounts select failed:", selErr);
    return { ok: false, error: selErr.message, status: 500 };
  }

  let row = existing as ConnectRow | null;
  let replacedStaleRow = false;

  async function deleteRow() {
    const { error } = await opts.supabase.from("stripe_connect_accounts").delete().eq("user_id", opts.userId);
    if (error) {
      console.error("stripe_connect_accounts delete failed:", error);
    }
    row = null;
    replacedStaleRow = true;
  }

  if (row?.stripe_account_id) {
    const storedMode = row.stripe_api_mode;
    if (storedMode != null && storedMode !== mode) {
      console.warn("[stripe connect] stored stripe_api_mode mismatch; clearing row", {
        userId: opts.userId,
        storedMode,
        currentMode: mode,
      });
      await deleteRow();
    }
  }

  if (row?.stripe_account_id) {
    try {
      await opts.stripe.accounts.retrieve(row.stripe_account_id);
      if (row.stripe_api_mode == null) {
        const { error: patchErr } = await opts.supabase
          .from("stripe_connect_accounts")
          .update({ stripe_api_mode: mode, updated_at: new Date().toISOString() })
          .eq("user_id", opts.userId);
        if (patchErr) {
          console.warn("stripe_connect_accounts stripe_api_mode backfill failed:", patchErr.message);
        }
      }
    } catch (err) {
      if (isInvalidConnectAccountForPlatformError(err)) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[stripe connect] stored acct invalid for this platform; clearing row", {
          userId: opts.userId,
          stripeAccountId: row.stripe_account_id,
          message: msg,
        });
        await deleteRow();
      } else {
        const msg = err instanceof Error ? err.message : "Unexpected error";
        console.error("stripe.accounts.retrieve failed:", err);
        return { ok: false, error: msg, status: 502 };
      }
    }
  }

  if (row?.stripe_account_id) {
    return {
      ok: true,
      stripeAccountId: row.stripe_account_id,
      replacedStaleRow,
      createdNew: false,
    };
  }

  if (!opts.allowCreate) {
    return {
      ok: false,
      error:
        "No valid Stripe Connect account for this deployment. Your saved connection may be from another environment—use “Connect bank” from the wallet to set up Connect again.",
      status: 400,
      errorCode: "STRIPE_CONNECT_ACCOUNT_INVALID_OR_MISSING",
    };
  }

  const useTestPrefill = isStripeSecretKeyTestMode(opts.secretKey);
  const account = await opts.stripe.accounts.create({
    type: "express",
    country: "GB",
    default_currency: "gbp",
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: { clerk_user_id: opts.userId },
    ...(useTestPrefill
      ? getStripeConnectTestCreatePrefill({ individualEmail: opts.testPrefillEmail ?? null })
      : {}),
  });

  const stripeAccountId = account.id;

  const { error: insErr } = await opts.supabase.from("stripe_connect_accounts").insert({
    user_id: opts.userId,
    stripe_account_id: stripeAccountId,
    stripe_api_mode: mode,
    updated_at: new Date().toISOString(),
  });

  if (insErr) {
    const { data: raced } = await opts.supabase
      .from("stripe_connect_accounts")
      .select("stripe_account_id, stripe_api_mode")
      .eq("user_id", opts.userId)
      .maybeSingle();

    if (raced?.stripe_account_id) {
      return {
        ok: true,
        stripeAccountId: raced.stripe_account_id,
        replacedStaleRow,
        createdNew: false,
      };
    }

    console.error("stripe_connect_accounts insert failed:", insErr);
    return { ok: false, error: insErr.message, status: 500 };
  }

  return {
    ok: true,
    stripeAccountId,
    replacedStaleRow,
    createdNew: true,
  };
}
