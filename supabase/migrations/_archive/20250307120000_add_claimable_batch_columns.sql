-- Add columns for claimable batch support on batches table
-- Safe for existing rows: new columns are nullable; batch_type default keeps existing behaviour.

alter table batches
  add column if not exists batch_type text null,
  add column if not exists batch_code text null,
  add column if not exists expires_at timestamptz null,
  add column if not exists max_claims integer null;

-- Unique index on batch_code so claimable batches have distinct codes
create unique index if not exists batches_batch_code_key on batches (batch_code) where batch_code is not null;

comment on column batches.batch_type is 'standard | claimable';
comment on column batches.batch_code is 'Public code for claimable batches; unique.';
comment on column batches.expires_at is 'When claimable batch stops accepting joins.';
comment on column batches.max_claims is 'Max number of claims for claimable batches.';
