import "server-only";

import { Resend } from "resend";

/**
 * Singleton Resend client for server-side use only.
 *
 * - Reads `process.env.RESEND_API_KEY` (never use `NEXT_PUBLIC_*` for secrets).
 * - Import this module only from Server Components, Route Handlers, or Server Actions, never from client components.
 */
let client: Resend | null = null;

/**
 * @throws If `RESEND_API_KEY` is missing or blank when a client is requested.
 */
export function getResend(): Resend {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "RESEND_API_KEY is not set. Add it to the server environment (e.g. `.env.local` or your host’s secrets) to send email.",
    );
  }
  if (!client) {
    client = new Resend(key);
  }
  return client;
}

/** Use when email is optional, e.g. skip sending in dev without a key. */
export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}
