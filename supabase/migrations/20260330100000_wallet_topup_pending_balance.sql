-- Step 1: pending_balance column + apply_stripe_wallet_topup credits pending_balance only.

alter table public.wallets
  add column if not exists pending_balance numeric(18,2) not null default 0;

create or replace function public.apply_stripe_wallet_topup(
  p_stripe_event_id text,
  p_payment_intent_id text,
  p_wallet_id uuid,
  p_user_id text,
  p_org_id uuid,
  p_amount_minor bigint,
  p_currency text default 'GBP',
  p_event_type text default 'payment_intent.succeeded',
  p_livemode boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet record;
  v_txn_id uuid;
  v_idempotency_key text;
  v_amount numeric(18,2);
begin
  if p_payment_intent_id is null or trim(p_payment_intent_id) = '' then
    return jsonb_build_object('applied', false, 'reason', 'missing_payment_intent_id');
  end if;

  if p_amount_minor is null or p_amount_minor <= 0 then
    return jsonb_build_object('applied', false, 'reason', 'invalid_amount_minor');
  end if;

  if coalesce(upper(nullif(trim(p_currency), '')), 'GBP') <> 'GBP' then
    return jsonb_build_object('applied', false, 'reason', 'invalid_currency');
  end if;

  v_amount := round((p_amount_minor::numeric / 100.0), 2);
  v_idempotency_key := 'stripe-wallet-topup-pi-' || p_payment_intent_id;

  -- Use ledger_transactions unique idempotency_key as duplicate protection.
  insert into public.ledger_transactions (
    reference_type,
    reference_id,
    status,
    idempotency_key
  )
  values (
    'wallet_funding',
    p_wallet_id,
    'posted',
    v_idempotency_key
  )
  on conflict (idempotency_key) do nothing
  returning id into v_txn_id;

  if v_txn_id is null then
    return jsonb_build_object('applied', false, 'reason', 'duplicate_payment_intent');
  end if;

  -- Lock and verify target wallet belongs to the user and is GBP.
  select id, user_id, currency
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

  update public.wallets
  set pending_balance = pending_balance + v_amount,
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
    'credit',
    'wallet_funding',
    p_wallet_id
  );

  insert into public.audit_events (
    org_id,
    batch_id,
    actor_user_id,
    event_type,
    event_data
  )
  values (
    p_org_id,
    null,
    p_user_id,
    'wallet_funding_succeeded',
    jsonb_build_object(
      'provider', 'stripe',
      'stripe_event_id', p_stripe_event_id,
      'stripe_event_type', p_event_type,
      'stripe_livemode', p_livemode,
      'payment_intent_id', p_payment_intent_id,
      'wallet_id', p_wallet_id,
      'org_id', p_org_id,
      'user_id', p_user_id,
      'currency', 'GBP',
      'amount_minor', p_amount_minor,
      'amount', v_amount,
      'ledger_transaction_id', v_txn_id
    )
  );

  return jsonb_build_object(
    'applied', true,
    'ledger_transaction_id', v_txn_id,
    'wallet_id', p_wallet_id,
    'amount', v_amount
  );
end;
$$;

comment on function public.apply_stripe_wallet_topup(text, text, uuid, text, uuid, bigint, text, text, boolean) is
  'Applies Stripe wallet top-up atomically and idempotently (wallet credit + ledger entry + audit event).';

grant execute on function public.apply_stripe_wallet_topup(text, text, uuid, text, uuid, bigint, text, text, boolean)
to anon, authenticated, service_role;
