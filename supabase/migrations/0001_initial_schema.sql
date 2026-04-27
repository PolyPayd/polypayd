-- Initial schema for PolyPayd
-- Enums first, then tables in dependency order.

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------

create type kyc_status_enum as enum (
  'none',
  'pending',
  'verified',
  'failed',
  'blocked'
);

create type batch_mode_enum as enum (
  'equal_shares',
  'custom_amounts'
);

create type batch_closing_mode_enum as enum (
  'close_when_full',
  'manual_close'
);

create type batch_status_enum as enum (
  'draft',
  'awaiting_funding',
  'open',
  'ready_to_approve',
  'approved',
  'processing',
  'completed',
  'partially_completed',
  'cancelled',
  'refunded',
  'held'
);

create type claim_status_enum as enum (
  'slot_held',
  'claimed',
  'expired',
  'payout_pending',
  'payout_completed',
  'payout_failed',
  'cancelled'
);

create type ledger_account_type_enum as enum (
  'user_wallet',
  'batch_escrow',
  'fees',
  'external'
);

create type ledger_direction_enum as enum (
  'credit',
  'debit'
);

-- ---------------------------------------------------------------------------
-- TABLES
-- ---------------------------------------------------------------------------

create table users (
  id                 uuid        primary key default gen_random_uuid(),
  clerk_id           text        unique not null,
  email              text        not null,
  first_name         text,
  last_name          text,
  display_name       text,
  phone_number       text,
  kyc_status         kyc_status_enum not null default 'none',
  kyc_verified_at    timestamptz,
  persona_inquiry_id text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table bank_accounts (
  id             uuid    primary key default gen_random_uuid(),
  user_id        uuid    not null references users(id) on delete cascade,
  sort_code      text    not null,   -- encrypted at app layer
  account_number text    not null,   -- encrypted at app layer
  account_name   text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

create table batches (
  id                 uuid                    primary key default gen_random_uuid(),
  sender_user_id     uuid                    not null references users(id),
  name               text                    not null,
  description        text,
  mode               batch_mode_enum         not null,
  closing_mode       batch_closing_mode_enum not null,
  status             batch_status_enum       not null default 'draft',
  total_amount_pence bigint                  not null,
  fee_pence          bigint                  not null,
  max_recipients     int                     not null,
  claim_link_id      uuid                    not null unique default gen_random_uuid(),
  claim_code         text                    not null unique,
  crezco_payment_id  text,
  opened_at          timestamptz,
  closed_at          timestamptz,
  approved_at        timestamptz,
  completed_at       timestamptz,
  cancelled_at       timestamptz,
  refunded_at        timestamptz,
  created_at         timestamptz             not null default now()
);

create table batch_slots (
  id                 uuid    primary key default gen_random_uuid(),
  batch_id           uuid    not null references batches(id) on delete cascade,
  slot_index         int     not null,
  amount_pence       bigint  not null,
  reference_name     text,
  claimed_by_user_id uuid    references users(id),
  unique (batch_id, slot_index)
);

create table claims (
  id                  uuid              primary key default gen_random_uuid(),
  batch_id            uuid              not null references batches(id),
  slot_id             uuid              references batch_slots(id),
  user_id             uuid              not null references users(id),
  amount_pence        bigint            not null,
  bank_account_id     uuid              references bank_accounts(id),
  status              claim_status_enum not null default 'slot_held',
  slot_held_until     timestamptz,
  claimed_at          timestamptz,
  payout_initiated_at timestamptz,
  payout_completed_at timestamptz,
  crezco_payout_id    text,
  created_at          timestamptz       not null default now()
);

create table ledger_accounts (
  id            uuid                     primary key default gen_random_uuid(),
  type          ledger_account_type_enum not null,
  owner_user_id uuid                     references users(id),
  batch_id      uuid                     references batches(id),
  created_at    timestamptz              not null default now()
);

create table ledger_entries (
  id             uuid                  primary key default gen_random_uuid(),
  account_id     uuid                  not null references ledger_accounts(id),
  direction      ledger_direction_enum not null,
  amount_pence   bigint                not null check (amount_pence > 0),
  transaction_id uuid                  not null,
  reference      text,
  created_at     timestamptz           not null default now()
);

create table crezco_webhooks (
  id           uuid        primary key default gen_random_uuid(),
  event_id     text        unique not null,
  event_type   text        not null,
  payload      jsonb       not null,
  processed_at timestamptz,
  created_at   timestamptz not null default now()
);

create table persona_webhooks (
  id           uuid        primary key default gen_random_uuid(),
  event_id     text        unique not null,
  event_type   text        not null,
  payload      jsonb       not null,
  processed_at timestamptz,
  created_at   timestamptz not null default now()
);

create table audit_logs (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        references users(id),
  action      text        not null,
  entity_type text,
  entity_id   uuid,
  metadata    jsonb,
  ip_address  text,
  created_at  timestamptz not null default now()
);

create table claim_links (
  id         uuid        primary key default gen_random_uuid(),
  batch_id   uuid        not null references batches(id) on delete cascade,
  is_active  boolean     not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------

create index idx_batches_sender_user_id  on batches (sender_user_id);
create index idx_batches_claim_code      on batches (claim_code);
create index idx_batches_status          on batches (status);

create index idx_claims_batch_id         on claims (batch_id);
create index idx_claims_user_id          on claims (user_id);
create index idx_claims_status           on claims (status);

create index idx_ledger_entries_account_id    on ledger_entries (account_id);
create index idx_ledger_entries_transaction_id on ledger_entries (transaction_id);

create index idx_audit_logs_user_id            on audit_logs (user_id);
create index idx_audit_logs_entity             on audit_logs (entity_type, entity_id);

create index idx_bank_accounts_user_id         on bank_accounts (user_id);

-- ---------------------------------------------------------------------------
-- TRIGGERS
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_users_updated_at
  before update on users
  for each row execute function set_updated_at();
