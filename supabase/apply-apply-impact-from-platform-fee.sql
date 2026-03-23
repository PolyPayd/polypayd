-- Minimal fix: missing function and/or impact_ledger.
-- For a single paste that also adds impact_distributions, use apply-impact-schema-live.sql instead.

-- 1) impact_ledger
create table if not exists public.impact_ledger (
  id uuid primary key default gen_random_uuid(),
  source_transaction_id uuid not null references public.ledger_transactions(id) on delete restrict,
  amount numeric(18,2) not null check (amount >= 0),
  currency text not null default 'GBP',
  created_at timestamptz not null default now(),
  unique (source_transaction_id)
);

create index if not exists impact_ledger_created_at_idx
  on public.impact_ledger (created_at desc);

-- 2) impact_distributions (optional app table; safe if not used yet)
create table if not exists public.impact_distributions (
  id uuid primary key default gen_random_uuid(),
  impact_ledger_id uuid null references public.impact_ledger(id) on delete set null,
  beneficiary_name text not null,
  beneficiary_ref text null,
  amount numeric(18,2) not null check (amount > 0),
  currency text not null default 'GBP',
  status text not null default 'pending' check (status in ('pending', 'posted', 'failed')),
  notes text null,
  created_at timestamptz not null default now()
);

create index if not exists impact_distributions_status_idx
  on public.impact_distributions (status, created_at desc);

-- 3) Helper: idempotent per source_transaction_id; moves round(platform_fee * 0.01, 2) from __platform__ to __impact__
create or replace function public.apply_impact_from_platform_fee(
  p_source_transaction_id uuid,
  p_platform_fee numeric,
  p_currency text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_impact numeric(18,2);
  v_platform_wallet_id uuid;
  v_impact_wallet_id uuid;
  v_cur text;
  v_inserted int;
begin
  v_cur := coalesce(nullif(trim(p_currency), ''), 'GBP');

  if p_platform_fee is null or p_platform_fee <= 0 then
    return;
  end if;

  v_impact := round(p_platform_fee::numeric * 0.01, 2);
  if v_impact <= 0 then
    return;
  end if;

  insert into public.impact_ledger (source_transaction_id, amount, currency)
  values (p_source_transaction_id, v_impact, v_cur)
  on conflict (source_transaction_id) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return;
  end if;

  insert into public.wallets (user_id, currency, current_balance, updated_at)
  values ('__platform__', v_cur, 0, now())
  on conflict (user_id, currency) do nothing;

  insert into public.wallets (user_id, currency, current_balance, updated_at)
  values ('__impact__', v_cur, 0, now())
  on conflict (user_id, currency) do nothing;

  select id into v_platform_wallet_id
  from public.wallets
  where user_id = '__platform__' and currency = v_cur
  for update;

  select id into v_impact_wallet_id
  from public.wallets
  where user_id = '__impact__' and currency = v_cur
  for update;

  if v_platform_wallet_id is null or v_impact_wallet_id is null then
    raise exception 'Impact allocation failed: platform or impact wallet missing';
  end if;

  update public.wallets
  set current_balance = current_balance - v_impact,
      updated_at = now()
  where id = v_platform_wallet_id
    and current_balance >= v_impact;

  if not found then
    raise exception 'Impact allocation failed: insufficient balance in platform wallet';
  end if;

  update public.wallets
  set current_balance = current_balance + v_impact,
      updated_at = now()
  where id = v_impact_wallet_id;
end;
$$;

comment on function public.apply_impact_from_platform_fee(uuid, numeric, text) is
  'Moves 1% of p_platform_fee from __platform__ to __impact__; records impact_ledger (idempotent per source_transaction_id).';

grant execute on function public.apply_impact_from_platform_fee(uuid, numeric, text) to anon, authenticated, service_role;
