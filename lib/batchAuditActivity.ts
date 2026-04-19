/**
 * Human-readable labels and detail lines for batch audit_events (operator-facing activity feed).
 */

import { formatBatchCodeForDisplay } from "@/lib/batchCodePublic";
import { maskClerkUserId } from "@/lib/recipientDisplay";
import type { ClerkRecipientProfile } from "@/lib/recipientDisplay";

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function formatMoneyAmount(amount: number, currency = "GBP"): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
}

/** Map internal audit event_type to a short product headline. */
export function formatAuditEventTitle(eventType: string): string {
  const key = eventType.trim().toLowerCase();
  const map: Record<string, string> = {
    batch_created: "Batch created",
    batch_claimed: "Recipient joined",
    batch_approved: "Batch approved",
    batch_run_started: "Bulk send started",
    batch_run_completed: "Bulk send completed",
    retry_failed_started: "Retry failed payouts started",
    retry_failed_completed: "Retry failed payouts completed",
    claimable_payouts_started: "Wallet payouts unlocked",
    batch_funded: "Pool reserved: claim links enabled",
    claim_completed: "Wallet credit completed",
    wallet_topup_pending: "Top-up received (pending)",
    wallet_topup_available: "Top-up cleared to available",
    withdrawal_created: "Withdrawal started",
    withdrawal_completed: "Withdrawal completed",
    withdrawal_failed: "Withdrawal failed",
    stripe_payment_received: "Card payment recorded",
  };
  if (map[key]) return map[key];
  return key
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * One or two readable sentences for the activity row (no raw JSON).
 */
export function formatAuditEventSummary(
  eventType: string,
  eventData: Record<string, unknown>
): string {
  const d = eventData ?? {};
  const cur = str(d.currency) ?? "GBP";

  const recipientCount = num(d.recipient_count);
  const successCount = num(d.success_count);
  const failedCount = num(d.failed_count);
  const finalStatus = str(d.final_status);
  const amount = num(d.amount);
  const allocTotal = num(d.alloc_total);
  const platformFee = num(d.platform_fee);
  const impactAmount = num(d.impact_amount);
  const status = str(d.status);

  const t = eventType.trim().toLowerCase();

  const name = str(d.name);
  const batchCodeRaw = str(d.batch_code);

  switch (t) {
    case "batch_created": {
      const bits: string[] = [];
      if (name) bits.push(`“${name}”`);
      if (batchCodeRaw) bits.push(`Invite code ${formatBatchCodeForDisplay(batchCodeRaw)}`);
      const bt = str(d.batch_type);
      if (bt === "claimable") bits.push("Claim Link");
      else if (bt === "standard") bits.push("Bulk send");
      return bits.length ? bits.join(" · ") : "New payout batch.";
    }
    case "batch_claimed": {
      if (batchCodeRaw) return `Joined using invite code ${formatBatchCodeForDisplay(batchCodeRaw)}.`;
      return "A recipient joined this batch.";
    }
    case "batch_approved": {
      if (status) return `Status set to ${status.replace(/_/g, " ")}.`;
      return "Batch approved for processing.";
    }
    case "claimable_payouts_started": {
      if (recipientCount != null) {
        return `${recipientCount} recipient${recipientCount === 1 ? "" : "s"} can now claim to their wallet.`;
      }
      return "Recipients can claim their payouts to their wallets.";
    }
    case "batch_funded": {
      const bits: string[] = [];
      if (recipientCount != null) {
        bits.push(`${recipientCount} recipient${recipientCount === 1 ? "" : "s"}`);
      }
      if (allocTotal != null && allocTotal > 0) bits.push(`${formatMoneyAmount(allocTotal, cur)} allocated`);
      if (platformFee != null && platformFee > 0) bits.push(`${formatMoneyAmount(platformFee, cur)} platform fee`);
      if (impactAmount != null && impactAmount > 0) bits.push(`${formatMoneyAmount(impactAmount, cur)} impact allocation`);
      return bits.length ? bits.join(" · ") : "Pool reserved and claim links enabled.";
    }
    case "claim_completed": {
      if (amount != null && amount > 0) {
        return `${formatMoneyAmount(amount, cur)} credited to the recipient’s available wallet balance.`;
      }
      return "Recipient wallet was credited.";
    }
    case "batch_run_started":
      return "Processing pending recipients.";
    case "batch_run_completed": {
      const bits: string[] = [];
      if (successCount != null) bits.push(`${successCount} succeeded`);
      if (failedCount != null) bits.push(`${failedCount} failed`);
      if (finalStatus) bits.push(`batch status: ${finalStatus.replace(/_/g, " ")}`);
      return bits.length ? bits.join(" · ") : "Run finished.";
    }
    case "retry_failed_started":
      return "Retrying failed payouts.";
    case "retry_failed_completed": {
      if (finalStatus) return `Result: ${finalStatus.replace(/_/g, " ")}.`;
      return "Retry run finished.";
    }
    case "withdrawal_created":
    case "withdrawal_completed":
    case "withdrawal_failed": {
      const req = num(d.requested_amount_minor ?? d.requestedAmountMinor);
      const net = num(d.net_payout_minor ?? d.netPayoutMinor);
      if (net != null) return `${formatMoneyAmount(net / 100, cur)} to bank.`;
      if (req != null) return `${formatMoneyAmount(req / 100, cur)} requested.`;
      return "Wallet withdrawal activity.";
    }
    default: {
      if (recipientCount != null) {
        return `${recipientCount} recipient${recipientCount === 1 ? "" : "s"}.`;
      }
      const stripeType = str(d.stripe_event_type);
      if (stripeType) return `Stripe: ${stripeType.replace(/\./g, " ")}.`;
      return "";
    }
  }
}

export function resolveAuditActorLabel(
  actorUserId: string | null | undefined,
  viewerUserId: string | null | undefined,
  profiles: ReadonlyMap<string, ClerkRecipientProfile>
): string {
  if (!actorUserId?.trim()) return "System";
  const id = actorUserId.trim();
  if (viewerUserId && id === viewerUserId.trim()) return "You";
  const p = profiles.get(id);
  const label = p?.displayName?.trim() ?? "";
  if (label && !label.startsWith("user_")) return label;
  const email = p?.primaryEmail?.trim();
  if (email) return email;
  return maskClerkUserId(id);
}

/** Pretty JSON for technical disclosure (stable ordering optional). */
export function formatAuditEventDataRaw(eventData: Record<string, unknown>): string {
  try {
    return JSON.stringify(eventData ?? {}, null, 2);
  } catch {
    return String(eventData);
  }
}
