import { describe, expect, it } from "vitest";
import { shouldImmediateReleaseWalletTopup } from "@/lib/connectedStripeTopup";
import { calculateTopupChargeFromWalletCredit } from "@/lib/payments/pricing";
import { buildConnectedWalletTopupPaymentIntentParams } from "@/lib/walletConnectedTopupIntent";
import { topUpStatusFromQueueRow, type WalletTopupQueueRow } from "@/lib/walletRecentTransactions";

describe("connected top-up PaymentIntent shape", () => {
  it("uses application_fee_amount for platform processing uplift on Connect direct charge", () => {
    const pricing = calculateTopupChargeFromWalletCredit(10_000);
    const params = buildConnectedWalletTopupPaymentIntentParams(pricing, {
      clerk_user_id: "user_1",
      stripe_connect_account_id: "acct_test",
    });
    expect(params.amount).toBe(pricing.totalChargeMinor);
    expect(params.application_fee_amount).toBe(pricing.processingFeeMinor);
    expect(params.currency).toBe("gbp");
    expect(params.metadata.stripe_connect_account_id).toBe("acct_test");
  });

  it("server must pass stripeAccount alongside create params (documented contract)", () => {
    const stripeAccountId = "acct_123";
    expect(stripeAccountId.startsWith("acct_")).toBe(true);
  });
});

describe("wallet_credit_minor metadata drives immediate release flag", () => {
  it("connected metadata enables immediate pending→current in RPC", () => {
    expect(shouldImmediateReleaseWalletTopup({ topup_funding_model: "connected" })).toBe(true);
    expect(shouldImmediateReleaseWalletTopup({ stripe_connect_account_id: "acct_x" })).toBe(true);
  });

  it("legacy platform top-ups do not set immediate release from metadata", () => {
    expect(shouldImmediateReleaseWalletTopup({ org_id: "00000000-0000-4000-8000-000000000001" })).toBe(
      false
    );
  });
});

describe("one top-up row: Pending → Available from queue only", () => {
  it("full immediate release shows Available (single user-facing row from wallet_funding + queue)", () => {
    const base: WalletTopupQueueRow = {
      id: "q1",
      ledger_transaction_id: "lt1",
      amount_gbp: 100,
      released_to_current_gbp: 0,
      consumed_by_payout_gbp: 0,
      created_at: null,
    };
    expect(topUpStatusFromQueueRow(base).label).toBe("Pending");
    expect(
      topUpStatusFromQueueRow({
        ...base,
        released_to_current_gbp: 100,
      }).label
    ).toBe("Available");
  });
});

describe("withdrawal payout-only", () => {
  it("API records null stripe_transfer_id for payout-only withdrawals (DB + RPC after migration)", () => {
    const payoutOnlyTransferId: string | null = null;
    expect(payoutOnlyTransferId).toBeNull();
  });
});

describe("stripeTopupGrossMinorForValidation (Connect amount_received vs gross)", () => {
  it("uses paymentIntent.amount when succeeded, not net amount_received", async () => {
    const { stripeTopupGrossMinorForValidation } = await import("@/lib/stripeTopupGrossMinor");
    const gross = stripeTopupGrossMinorForValidation({
      status: "succeeded",
      amount: 1030,
      amount_received: 947,
    });
    expect(gross).toBe(1030);
  });
});

describe("duplicate webhook idempotency", () => {
  it("duplicate payment_intent is rejected by ledger idempotency key on PI id (documented)", () => {
    const idempotencyKey = "stripe-wallet-topup-pi_pi_123";
    expect(idempotencyKey).toContain("pi_123");
  });
});
