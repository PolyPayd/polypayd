-- Add payout execution tracking to batch_claims for claimable batch send-payouts flow.

alter table batch_claims
  add column if not exists payout_status text null,
  add column if not exists paid_at timestamptz null,
  add column if not exists failure_reason text null;

comment on column batch_claims.payout_status is 'Claimable payout: pending | paid | failed';
comment on column batch_claims.paid_at is 'When the claim was marked paid (simulated or real).';
comment on column batch_claims.failure_reason is 'Reason when payout_status = failed.';
