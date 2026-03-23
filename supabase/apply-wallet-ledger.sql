-- Run this in Supabase SQL Editor to create wallet and ledger tables.
-- Use if migrations have not been applied (e.g. project not linked).

-- 1. wallets
create table if not exists wallets (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  currency text not null default 'GBP',
  current_balance numeric(18,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists wallets_user_id_currency_key on wallets (user_id, currency);
create index if not exists wallets_user_id_idx on wallets (user_id);
comment on table wallets is 'One wallet per user per currency; balance in that currency.';
comment on column wallets.user_id is 'App user identifier (e.g. Clerk user ID).';

-- 2. ledger_transactions
create table if not exists ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  reference_type text not null,
  reference_id uuid null,
  status text not null default 'posted',
  idempotency_key text unique,
  created_at timestamptz not null default now()
);
create index if not exists ledger_transactions_reference_idx on ledger_transactions (reference_type, reference_id);
create index if not exists ledger_transactions_idempotency_key_idx on ledger_transactions (idempotency_key) where idempotency_key is not null;
comment on table ledger_transactions is 'One row per logical money movement (e.g. batch payout).';

-- 3. ledger_entries
create table if not exists ledger_entries (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references ledger_transactions(id) on delete cascade,
  wallet_id uuid not null references wallets(id) on delete cascade,
  amount numeric(18,2) not null,
  entry_type text not null check (entry_type in ('debit', 'credit')),
  reference_type text null,
  reference_id uuid null,
  created_at timestamptz not null default now()
);
create index if not exists ledger_entries_transaction_id_idx on ledger_entries (transaction_id);
create index if not exists ledger_entries_wallet_id_idx on ledger_entries (wallet_id);
comment on table ledger_entries is 'Immutable debit/credit entries; amount is positive.';
comment on column ledger_entries.entry_type is 'debit = money out of wallet, credit = money in.';
