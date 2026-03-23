-- Allocation mode for claimable batches: even | custom
alter table batches
  add column if not exists allocation_mode text null;

comment on column batches.allocation_mode is 'Claimable batches: even = equal amount per slot; custom = slot amounts set manually with remainder auto-filled.';

-- Claim slots: one row per claimable slot, source of truth for claim amounts
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

comment on table claim_slots is 'One row per claim slot for claimable batches; amount and status per slot.';
comment on column claim_slots.slot_index is 'Zero-based index of the slot.';
comment on column claim_slots.status is 'open | claimed.';

-- Link batch_claims to the slot they claimed (optional for legacy claims)
alter table batch_claims
  add column if not exists claim_slot_id uuid null;

comment on column batch_claims.claim_slot_id is 'Reference to claim_slots when claim was assigned from a slot.';

create unique index if not exists batch_claims_claim_slot_id_key
  on batch_claims (claim_slot_id) where claim_slot_id is not null;
