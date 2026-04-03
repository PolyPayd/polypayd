/**
 * Production-safe labels for batch / claim recipients.
 * Never prefer raw Clerk `user_*` ids when a human-readable alternative exists.
 */

export type ClerkRecipientProfile = {
  displayName: string;
  primaryEmail: string | null;
};

export type RecipientIdentityInput = {
  clerkUserId: string;
  polypaydUsername: string | null | undefined;
  recipientDisplayName: string | null | undefined;
  recipientEmail: string | null | undefined;
  clerkProfile?: ClerkRecipientProfile | null;
};

export type RecipientDisplayResolved = {
  primary: string;
  subtext?: string;
};

export function isLikelyClerkUserId(value: string): boolean {
  const s = value.trim();
  return s.startsWith("user_") && s.length >= 12;
}

export function maskClerkUserId(clerkUserId: string): string {
  const id = clerkUserId.trim();
  if (id.length <= 8) return "Recipient";
  return `User …${id.slice(-5)}`;
}

function trimOrNull(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  return t.length > 0 ? t : null;
}

export function resolveRecipientDisplay(input: RecipientIdentityInput): RecipientDisplayResolved {
  const userId = input.clerkUserId.trim();
  const dbName = trimOrNull(input.recipientDisplayName);
  const dbEmail = trimOrNull(input.recipientEmail);
  const clerk = input.clerkProfile;
  const clerkName = trimOrNull(clerk?.displayName);
  const clerkEmail = trimOrNull(clerk?.primaryEmail);
  const email = dbEmail ?? clerkEmail;

  if (dbName) {
    if (email && dbName.toLowerCase() !== email.toLowerCase()) {
      return { primary: dbName, subtext: email };
    }
    return { primary: dbName };
  }

  if (clerkName && !isLikelyClerkUserId(clerkName)) {
    if (email && clerkName.toLowerCase() !== email.toLowerCase()) {
      return { primary: clerkName, subtext: email };
    }
    return { primary: clerkName };
  }

  const legacy = trimOrNull(input.polypaydUsername);
  if (legacy && legacy !== userId && !isLikelyClerkUserId(legacy) && !legacy.startsWith("user_")) {
    return { primary: legacy };
  }

  if (email) {
    return { primary: email };
  }

  if (clerkName && clerkName.length > 0) {
    return { primary: clerkName };
  }

  return { primary: maskClerkUserId(userId || "unknown") };
}

export function formatRecipientLifecycleLabel(status: string | null | undefined): string {
  const s = (status ?? "").trim().toLowerCase();
  const map: Record<string, string> = {
    pending: "Pending",
    claimable: "Claimable",
    claimed: "Claimed",
    paid_out: "Paid out",
    failed: "Failed",
    cancelled: "Cancelled",
  };
  return map[s] ?? (status ? status.replace(/_/g, " ") : "—");
}
