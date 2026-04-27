-- Stripe Connect + GBP wallet withdrawals (idempotent ledger debit).

create table if not exists public.stripe_connect_accounts (
  user_id text primary key,
  stripe_account_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.stripe_connect_accounts is
  'Maps Clerk user_id to Stripe Connect Express account (acct_...).';

create index if not exists stripe_connect_accounts_stripe_account_id_idx
  on public.stripe_connect_accounts (stripe_account_id);

create table if not exists public.stripe_connect_withdrawals (
  idempotency_key text primary key,
  user_id text not null,
  wallet_id uuid not null references public.wallets (id) on delete restrict,
  amount_minor bigint not null check (amount_minor > 0),
  stripe_transfer_id text not null,
  stripe_payout_id text not null,
  ledger_transaction_id uuid references public.ledger_transactions (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists stripe_connect_withdrawals_user_id_idx
  on public.stripe_connect_withdrawals (user_id);

comment on table public.stripe_connect_withdrawals is
  'Completed Connect withdrawals; one row per successful idempotent API request.';

alter table public.audit_events
  alter column org_id drop not null;

create or replace function public.apply_stripe_connect_withdrawal(
  p_idempotency_key text,
  p_user_id text,
  p_wallet_id uuid,
  p_amount_minor bigint,
  p_stripe_transfer_id text,
  p_payout_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet record;
  v_txn_id uuid;
  v_ledger_key text;
  v_amount numeric(18,2);
  v_existing public.stripe_connect_withdrawals%rowtype;
begin
  if p_idempotency_key is null or trim(p_idempotency_key) = '' then
    return jsonb_build_object('applied', false, 'reason', 'missing_idempotency_key');
  end if;

  if p_stripe_transfer_id is null or trim(p_stripe_transfer_id) = ''
     or p_payout_id is null or trim(p_payout_id) = '' then
    return jsonb_build_object('applied', false, 'reason', 'missing_stripe_reference');
  end if;

  if p_amount_minor is null or p_amount_minor <= 0 then
    return jsonb_build_object('applied', false, 'reason', 'invalid_amount_minor');
  end if;

  v_amount := round((p_amount_minor::numeric / 100.0), 2);
  v_ledger_key := 'stripe-connect-withdrawal-' || trim(p_idempotency_key);

  select * into v_existing
  from public.stripe_connect_withdrawals
  where idempotency_key = trim(p_idempotency_key);

  if found then
    return jsonb_build_object(
      'applied', true,
      'duplicate', true,
      'ledger_transaction_id', v_existing.ledger_transaction_id,
      'wallet_id', v_existing.wallet_id,
      'amount', round((v_existing.amount_minor::numeric / 100.0), 2),
      'stripe_transfer_id', v_existing.stripe_transfer_id,
      'stripe_payout_id', v_existing.stripe_payout_id
    );
  end if;

  insert into public.ledger_transactions (
    reference_type,
    reference_id,
    status,
    idempotency_key
  )
  values (
    'stripe_connect_withdrawal',
    p_wallet_id,
    'posted',
    v_ledger_key
  )
  on conflict (idempotency_key) do nothing
  returning id into v_txn_id;

  if v_txn_id is null then
    select w.* into v_existing
    from public.stripe_connect_withdrawals w
    inner join public.ledger_transactions lt on lt.id = w.ledger_transaction_id
    where lt.idempotency_key = v_ledger_key;

    if found then
      return jsonb_build_object(
        'applied', true,
        'duplicate', true,
        'ledger_transaction_id', v_existing.ledger_transaction_id,
        'wallet_id', v_existing.wallet_id,
        'amount', round((v_existing.amount_minor::numeric / 100.0), 2),
        'stripe_transfer_id', v_existing.stripe_transfer_id,
        'stripe_payout_id', v_existing.stripe_payout_id
      );
    end if;

    return jsonb_build_object('applied', false, 'reason', 'ledger_idempotency_conflict');
  end if;

  select id, user_id, currency, current_balance
  into v_wallet
  from public.wallets
  where id = p_wallet_id
  for update;

  if v_wallet.id is null then
    raise exception 'Wallet % not found', p_wallet_id;
  end if;

  if v_wallet.user_id is distinct from p_user_id then
    raise exception 'Wallet ownership mismatch for user %', p_user_id;
  end if;

  if upper(coalesce(v_wallet.currency, '')) <> 'GBP' then
    raise exception 'Wallet currency mismatch. Expected GBP, got %', v_wallet.currency;
  end if;

  if coalesce(v_wallet.current_balance, 0)::numeric(18,2) < v_amount then
    raise exception 'Insufficient wallet balance';
  end if;

  update public.wallets
  set current_balance = current_balance - v_amount,
      updated_at = now()
  where id = p_wallet_id;

  insert into public.ledger_entries (
    transaction_id,
    wallet_id,
    amount,
    entry_type,
    reference_type,
    reference_id
  )
  values (
    v_txn_id,
    p_wallet_id,
    v_amount,
    'debit',
    'stripe_connect_withdrawal',
    p_wallet_id
  );

  insert into public.stripe_connect_withdrawals (
    idempotency_key,
    user_id,
    wallet_id,
    amount_minor,
    stripe_transfer_id,
    stripe_payout_id,
    ledger_transaction_id
  )
  values (
    trim(p_idempotency_key),
    p_user_id,
    p_wallet_id,
    p_amount_minor,
    trim(p_stripe_transfer_id),
    trim(p_payout_id),
    v_txn_id
  );

  insert into public.audit_events (
    org_id,
    batch_id,
    actor_user_id,
    event_type,
    event_data
  )
  values (
    null,
    null,
    p_user_id,
    'stripe_connect_withdrawal_posted',
    jsonb_build_object(
      'provider', 'stripe',
      'idempotency_key', trim(p_idempotency_key),
      'wallet_id', p_wallet_id,
      'currency', 'GBP',
      'amount_minor', p_amount_minor,
      'amount', v_amount,
      'stripe_transfer_id', trim(p_stripe_transfer_id),
      'stripe_payout_id', trim(p_payout_id),
      'ledger_transaction_id', v_txn_id
    )
  );

  return jsonb_build_object(
    'applied', true,
    'duplicate', false,
    'ledger_transaction_id', v_txn_id,
    'wallet_id', p_wallet_id,
    'amount', v_amount,
    'stripe_transfer_id', trim(p_stripe_transfer_id),
    'stripe_payout_id', trim(p_payout_id)
  );
end;
$$;

comment on function public.apply_stripe_connect_withdrawal(text, text, uuid, bigint, text, text) is
  'Idempotent GBP wallet debit after successful Stripe Connect transfer + payout.';

grant execute on function public.apply_stripe_connect_withdrawal(text, text, uuid, bigint, text, text)
  to service_role;
