-- Human-readable recipient identity for claimable batches (operator-facing UI).
-- Populated at join time from Clerk; optional email for subtext / disambiguation.

alter table public.batch_claims
  add column if not exists recipient_display_name text null;

alter table public.batch_claims
  add column if not exists recipient_email text null;

comment on column public.batch_claims.recipient_display_name is
  'Full or display name captured when the recipient joined (Clerk first + last, or username).';

comment on column public.batch_claims.recipient_email is
  'Primary email captured at join for operator reference (not a login identifier in UI).';

comment on column public.batch_claims.polypayd_username is
  'Legacy label field; prefer recipient_display_name. Avoid storing raw Clerk user ids as the only label.';
