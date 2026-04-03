import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import type { ClerkRecipientProfile } from "@/lib/recipientDisplay";

/**
 * Loads Clerk public-profile fields for a set of user ids (batch recipients / slot claimers).
 * Failures are swallowed per-id so one bad id does not break the page.
 */
export async function fetchClerkRecipientProfiles(
  userIds: string[]
): Promise<Map<string, ClerkRecipientProfile>> {
  const unique = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  const out = new Map<string, ClerkRecipientProfile>();
  if (unique.length === 0) return out;

  const client = await clerkClient();

  await Promise.all(
    unique.map(async (id) => {
      try {
        const u = await client.users.getUser(id);
        const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
        const username = u.username?.trim() ?? "";
        const displayName = full || username || "";
        const primaryEmail =
          u.primaryEmailAddress?.emailAddress ?? u.emailAddresses?.[0]?.emailAddress ?? null;
        const label = displayName || primaryEmail || "";
        if (!label && !primaryEmail) return;
        out.set(id, {
          displayName: label,
          primaryEmail,
        });
      } catch {
        /* missing user or Clerk misconfig — fall back to masking in UI */
      }
    })
  );

  return out;
}
