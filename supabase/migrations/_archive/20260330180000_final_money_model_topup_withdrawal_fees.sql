-- Final money model: top-up gross vs wallet credit metadata; withdrawal fee + net payout + platform revenue line (fee amount set by app).

alter table public.stripe_connect_withdrawals
  add column if not exists fee_minor bigint not null default 0 check (fee_minor >= 0);

alter table public.stripe_connect_withdrawals
  add column if not exists net_payout_minor bigint not null default 0 check (net_payout_minor >= 0);

update public.stripe_connect_withdrawals
set net_payout_minor = amount_minor
where net_payout_minor = 0;

comment on column public.stripe_connect_withdrawals.amount_minor is
  'Gross amount debited from user wallet (minor units).';
comment on column public.stripe_connect_withdrawals.fee_minor is
  'Platform withdrawal fee retained (minor units).';
comment on column public.stripe_connect_withdrawals.net_payout_minor is
  'Amount sent to Connect / bank after fee (minor units).';

-- ---------------------------------------------------------------------------
-- Wallet top-up: p_amount_minor = wallet credit only; optional gross/fee audit
-- ---------------------------------------------------------------------------

drop function if exists public.apply_stripe_wallet_topup(text, text, uuid, text, uuid, bigint, text, text, boolean);

create or replace function public.apply_stripe_wallet_topup(
  p_stripe_event_id text,
  p_payment_intent_id text,
  p_wallet_id uuid,
  p_user_id text,
  p_org_id uuid,
  p_amount_minor bigint,
  p_currency text default 'GBP',
  p_event_type text default 'payment_intent.succeeded',
  p_livemode boolean default false,
  p_stripe_total_charged_minor bigint default null,
  p_processing_fee_minor bigint default null
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

  insert into public.wallet_topup_release_queue (
    wallet_id,
    payment_intent_id,
    amount_gbp,
    ledger_transaction_id
  )
  values (
    p_wallet_id,
    trim(p_payment_intent_id),
    v_amount,
    v_txn_id
  )
  on conflict (payment_intent_id) do nothing;

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
      'wallet_credit_minor', p_amount_minor,
      'amount_minor', p_amount_minor,
      'amount', v_amount,
      'stripe_total_charged_minor', p_stripe_total_charged_minor,
      'processing_fee_minor', p_processing_fee_minor,
      'ledger_transaction_id', v_txn_id
    )
  );

  return jsonb_build_object(
    'applied', true,
    'ledger_transaction_id', v_txn_id,
    'wallet_id', p_wallet_id,
    'amount', v_amount,
    'wallet_credit_minor', p_amount_minor
  );
end;
$$;

comment on function public.apply_stripe_wallet_topup(text, text, uuid, text, uuid, bigint, text, text, boolean, bigint, bigint) is
  'Idempotent wallet top-up: credits pending_balance by wallet credit (p_amount_minor). Optional gross/fee for audit.';

grant execute on function public.apply_stripe_wallet_topup(text, text, uuid, text, uuid, bigint, text, text, boolean, bigint, bigint)
to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Withdrawal: gross wallet debit; optional flat fee to __platform__ pending
-- ---------------------------------------------------------------------------

drop function if exists public.apply_stripe_connect_withdrawal(text, text, uuid, bigint, text, text);

create or replace function public.apply_stripe_connect_withdrawal(
  p_idempotency_key text,
  p_user_id text,
  p_wallet_id uuid,
  p_amount_minor bigint,
  p_stripe_transfer_id text,
  p_payout_id text,
  p_fee_minor bigint default 0
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
  v_fee numeric(18,2);
  v_net_minor bigint;
  v_existing public.stripe_connect_withdrawals%rowtype;
  v_platform_wallet_id uuid;
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

  if coalesce(p_fee_minor, 0) < 0 then
    return jsonb_build_object('applied', false, 'reason', 'invalid_fee_minor');
  end if;

  if p_amount_minor <= coalesce(p_fee_minor, 0) then
    return jsonb_build_object('applied', false, 'reason', 'net_payout_non_positive');
  end if;

  v_net_minor := p_amount_minor - coalesce(p_fee_minor, 0);
  v_amount := round((p_amount_minor::numeric / 100.0), 2);
  v_fee := round((coalesce(p_fee_minor, 0)::numeric / 100.0), 2);
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
      'fee_minor', v_existing.fee_minor,
      'net_payout_minor', v_existing.net_payout_minor,
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
        'fee_minor', v_existing.fee_minor,
        'net_payout_minor', v_existing.net_payout_minor,
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

  update public.wallets
  set current_balance = current_balance - v_amount,
      updated_at = now()
  where id = p_wallet_id
    and coalesce(current_balance, 0)::numeric(18,2) >= v_amount;

  if not found then
    raise exception 'Insufficient available balance for withdrawal (pending_balance is not withdrawable)';
  end if;

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

  if coalesce(p_fee_minor, 0) > 0 then
    insert into public.wallets (user_id, currency, current_balance, pending_balance, created_at, updated_at)
    values ('__platform__', 'GBP', 0, 0, now(), now())
    on conflict (user_id, currency) do nothing;

    select id into v_platform_wallet_id
    from public.wallets
    where user_id = '__platform__' and currency = 'GBP'
    for update;

    if v_platform_wallet_id is null then
      raise exception 'Platform wallet not found';
    end if;

    update public.wallets
    set pending_balance = pending_balance + v_fee,
        updated_at = now()
    where id = v_platform_wallet_id;

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
      v_platform_wallet_id,
      v_fee,
      'credit',
      'withdrawal_fee',
      p_wallet_id
    );
  end if;

  insert into public.stripe_connect_withdrawals (
    idempotency_key,
    user_id,
    wallet_id,
    amount_minor,
    fee_minor,
    net_payout_minor,
    stripe_transfer_id,
    stripe_payout_id,
    ledger_transaction_id
  )
  values (
    trim(p_idempotency_key),
    p_user_id,
    p_wallet_id,
    p_amount_minor,
    coalesce(p_fee_minor, 0),
    v_net_minor,
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
      'fee_minor', coalesce(p_fee_minor, 0),
      'net_payout_minor', v_net_minor,
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
    'fee_minor', coalesce(p_fee_minor, 0),
    'net_payout_minor', v_net_minor,
    'stripe_transfer_id', trim(p_stripe_transfer_id),
    'stripe_payout_id', trim(p_payout_id)
  );
end;
$$;

comment on function public.apply_stripe_connect_withdrawal(text, text, uuid, bigint, text, text, bigint) is
  'Idempotent withdrawal: debits user current_balance by gross; credits platform pending for fee; Stripe net = gross - fee.';

grant execute on function public.apply_stripe_connect_withdrawal(text, text, uuid, bigint, text, text, bigint)
  to service_role;
