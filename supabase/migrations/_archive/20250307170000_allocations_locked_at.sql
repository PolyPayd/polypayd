-- Add allocations_locked_at to batches for claimable batch payout finalization.
-- When set, no further joins or payout edits are allowed.

alter table batches
  add column if not exists allocations_locked_at timestamptz null;

comment on column batches.allocations_locked_at is 'When set, claimable batch allocations are finalized: no new joins, no payout edits.';
