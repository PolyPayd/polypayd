-- Track which Stripe API mode (test vs live) created the Connect account so staging never reuses live acct_ ids.

alter table public.stripe_connect_accounts
  add column if not exists stripe_api_mode text;

alter table public.stripe_connect_accounts
  drop constraint if exists stripe_connect_accounts_stripe_api_mode_check;

alter table public.stripe_connect_accounts
  add constraint stripe_connect_accounts_stripe_api_mode_check
  check (stripe_api_mode is null or stripe_api_mode in ('test', 'live'));

comment on column public.stripe_connect_accounts.stripe_api_mode is
  'Stripe key mode when this row was created: test (sk_test_) or live (sk_live_). Null = legacy row; validated via Stripe API on next use.';
