-- Claimable payout schema for PolyPayd.
-- Run this in Supabase SQL Editor if Create Batch (claimable) shows "Claimable payout schema is not fully applied yet."
-- Requires: batches and batch_claims tables must already exist (core app tables).

-- ========== 1. batches: claimable columns ==========
alter table batches
  add column if not exists batch_type text null,
  add column if not exists batch_code text null,
  add column if not exists expires_at timestamptz null,
  add column if not exists max_claims integer null,
  add column if not exists recipient_count integer null,
  add column if not exists total_amount numeric(18,2) null,
  add column if not exists amount_per_claim numeric null,
  add column if not exists allocation_mode text null,
  add column if not exists funded_by_user_id text null,
  add column if not exists allocations_locked_at timestamptz null;

create unique index if not exists batches_batch_code_key
  on batches (batch_code) where batch_code is not null;

comment on column batches.batch_type is 'standard | claimable';
comment on column batches.batch_code is 'Public code for claimable batches; unique.';
comment on column batches.expires_at is 'When claimable batch stops accepting joins.';
comment on column batches.max_claims is 'Max number of claims for claimable batches.';
comment on column batches.amount_per_claim is 'Fixed amount per claim for claimable batches (even mode).';
comment on column batches.allocation_mode is 'Claimable: even | custom.';
comment on column batches.funded_by_user_id is 'User ID (e.g. Clerk) whose wallet is debited when claimable batch payouts run.';
comment on column batches.allocations_locked_at is 'When set, claimable batch allocations are finalized: no new joins, no payout edits.';

-- ========== 2. batch_claims: claimable columns ==========
alter table batch_claims
  add column if not exists claim_amount numeric null,
  add column if not exists claim_slot_id uuid null,
  add column if not exists payout_status text null,
  add column if not exists paid_at timestamptz null,
  add column if not exists failure_reason text null;

create unique index if not exists batch_claims_batch_id_user_id_key
  on batch_claims (batch_id, user_id);
create unique index if not exists batch_claims_claim_slot_id_key
  on batch_claims (claim_slot_id) where claim_slot_id is not null;

comment on column batch_claims.claim_amount is 'Monetary amount assigned to this claim.';
comment on column batch_claims.claim_slot_id is 'Reference to claim_slots when assigned from a slot.';
comment on column batch_claims.payout_status is 'Claimable payout: pending | paid | failed';
comment on column batch_claims.paid_at is 'When the claim was marked paid (simulated or real).';
comment on column batch_claims.failure_reason is 'Reason when payout_status = failed.';

-- ========== 3. claim_slots table ==========
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

-- ========== 4. audit_events (for batch_created and other audit logs) ==========
create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  batch_id uuid null,
  actor_user_id text null,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_org_id_idx on audit_events(org_id);
create index if not exists audit_events_batch_id_idx on audit_events(batch_id);
create index if not exists audit_events_created_at_idx on audit_events(created_at desc);
