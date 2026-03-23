-- Consolidated claimable payout schema for PolyPayd.
-- Run this once; all operations use "if not exists" / safe patterns.
-- Covers: batch_type, batch_code, expiry, max_claims, amount_per_claim, allocation_mode,
-- batch_claims.claim_amount, batch_claims.claim_slot_id, claim_slots table, unique constraints.

-- Batches: claimable batch columns
alter table batches
  add column if not exists batch_type text null,
  add column if not exists batch_code text null,
  add column if not exists expires_at timestamptz null,
  add column if not exists max_claims integer null,
  add column if not exists amount_per_claim numeric null,
  add column if not exists allocation_mode text null;

create unique index if not exists batches_batch_code_key
  on batches (batch_code) where batch_code is not null;

comment on column batches.batch_type is 'standard | claimable';
comment on column batches.batch_code is 'Public code for claimable batches; unique.';
comment on column batches.expires_at is 'When claimable batch stops accepting joins.';
comment on column batches.max_claims is 'Max number of claims for claimable batches.';
comment on column batches.amount_per_claim is 'Fixed amount per claim for claimable batches (even mode).';
comment on column batches.allocation_mode is 'Claimable: even | custom.';

-- Batch claims: amount and optional slot link
alter table batch_claims
  add column if not exists claim_amount numeric null,
  add column if not exists claim_slot_id uuid null;

comment on column batch_claims.claim_amount is 'Monetary amount assigned to this claim.';
comment on column batch_claims.claim_slot_id is 'Reference to claim_slots when assigned from a slot.';

create unique index if not exists batch_claims_batch_id_user_id_key
  on batch_claims (batch_id, user_id);

create unique index if not exists batch_claims_claim_slot_id_key
  on batch_claims (claim_slot_id) where claim_slot_id is not null;

-- Claim slots: one row per claimable slot (custom/even allocation)
create table if not exists claim_slots (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  slot_index integer not null,
  amount numeric not null,
  status text not null default 'open',
  claimed_by_user_id text null,
  claimed_at timestamptz null,
  created_at timestamptz not null default now()
);

create unique index if not exists claim_slots_batch_id_slot_index_key
  on claim_slots (batch_id, slot_index);

create index if not exists claim_slots_batch_id_idx on claim_slots (batch_id);
create index if not exists claim_slots_status_idx on claim_slots (batch_id, status) where status = 'open';

comment on table claim_slots is 'One row per claim slot for claimable batches.';
comment on column claim_slots.slot_index is 'Zero-based slot index.';
comment on column claim_slots.status is 'open | claimed';
