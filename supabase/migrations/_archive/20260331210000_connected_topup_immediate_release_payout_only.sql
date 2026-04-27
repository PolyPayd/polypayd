-- Connected-account top-ups: optional immediate pending→current release (no platform balance.available tick).
-- Withdrawals: payout-only (no platform transfer); stripe_transfer_id nullable.

alter table public.stripe_connect_withdrawals
  alter column stripe_transfer_id drop not null;

comment on column public.stripe_connect_withdrawals.stripe_transfer_id is
  'Legacy: platform transfer id. Null when withdrawal uses connected balance only (payout-only).';

-- ---------------------------------------------------------------------------
-- apply_stripe_wallet_topup: add p_immediate_release
-- ---------------------------------------------------------------------------

drop function if exists public.apply_stripe_wallet_topup(
  text, text, uuid, text, uuid, bigint, text, text, boolean, bigint, bigint
);

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
  p_processing_fee_minor bigint default null,
  p_immediate_release boolean default false
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
  v_release_txn_id uuid;
  v_q record;
  v_take numeric(18,2);
  v_pend numeric(18,2);
  v_residual numeric(18,2);
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
  v_idempotency_key := 'stripe-wallet-topup-pi-' || trim(p_payment_intent_id);

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
      'ledger_transaction_id', v_txn_id,
      'immediate_release', coalesce(p_immediate_release, false)
    )
  );

  if coalesce(p_immediate_release, false) then
    insert into public.ledger_transactions (
      reference_type,
      reference_id,
      status,
      idempotency_key
    )
    values (
      'wallet_topup_instant_release',
      p_wallet_id,
      'posted',
      'wallet-topup-inst-rel-' || trim(p_payment_intent_id)
    )
    on conflict (idempotency_key) do nothing
    returning id into v_release_txn_id;

    if v_release_txn_id is null then
      select id into v_release_txn_id
      from public.ledger_transactions
      where idempotency_key = 'wallet-topup-inst-rel-' || trim(p_payment_intent_id)
      limit 1;
    end if;

    if v_release_txn_id is not null then
      select
        q.id,
        q.amount_gbp,
        q.released_to_current_gbp,
        q.consumed_by_payout_gbp
      into v_q
      from public.wallet_topup_release_queue q
      where q.payment_intent_id = trim(p_payment_intent_id)
      for update of q;

      if v_q.id is not null then
        v_residual :=
          v_q.amount_gbp - v_q.released_to_current_gbp - v_q.consumed_by_payout_gbp;

        if v_residual > 0.0001 then
          select coalesce(w.pending_balance, 0)::numeric(18,2)
          into v_pend
          from public.wallets w
          where w.id = p_wallet_id
          for update;

          v_take := least(v_residual, v_pend);

          if v_take > 0 then
            update public.wallets
            set pending_balance = pending_balance - v_take,
                current_balance = current_balance + v_take,
                updated_at = now()
            where id = p_wallet_id;

            update public.wallet_topup_release_queue
            set released_to_current_gbp = released_to_current_gbp + v_take
            where id = v_q.id;

            insert into public.ledger_entries (
              transaction_id,
              wallet_id,
              amount,
              entry_type,
              reference_type,
              reference_id
            )
            values (
              v_release_txn_id,
              p_wallet_id,
              v_take,
              'credit',
              'wallet_funding_release',
              p_wallet_id
            );
          end if;
        end if;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'applied', true,
    'ledger_transaction_id', v_txn_id,
    'wallet_id', p_wallet_id,
    'amount', v_amount,
    'wallet_credit_minor', p_amount_minor,
    'immediate_release', coalesce(p_immediate_release, false)
  );
end;
$$;

comment on function public.apply_stripe_wallet_topup(
  text, text, uuid, text, uuid, bigint, text, text, boolean, bigint, bigint, boolean
) is
  'Idempotent wallet top-up: credits pending_balance from metadata wallet credit. If p_immediate_release, moves funds to current in the same call (connected-account top-ups).';

grant execute on function public.apply_stripe_wallet_topup(
  text, text, uuid, text, uuid, bigint, text, text, boolean, bigint, bigint, boolean
)
to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- apply_stripe_connect_withdrawal: optional transfer id (payout-only)
-- ---------------------------------------------------------------------------

drop function if exists public.apply_stripe_connect_withdrawal(text, text, uuid, bigint, text, text, bigint, bigint);

create or replace function public.apply_stripe_connect_withdrawal(
  p_idempotency_key text,
  p_user_id text,
  p_wallet_id uuid,
  p_amount_minor bigint,
  p_stripe_transfer_id text,
  p_payout_id text,
  p_fee_minor bigint default 0,
  p_requested_amount_minor bigint default null
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
  v_requested bigint;
  v_transfer_id text;
begin
  if p_idempotency_key is null or trim(p_idempotency_key) = '' then
    return jsonb_build_object('applied', false, 'reason', 'missing_idempotency_key');
  end if;

  if p_payout_id is null or trim(p_payout_id) = '' then
    return jsonb_build_object('applied', false, 'reason', 'missing_stripe_reference');
  end if;

  v_transfer_id := nullif(trim(coalesce(p_stripe_transfer_id, '')), '');

  if p_amount_minor is null or p_amount_minor <= 0 then
    return jsonb_build_object('applied', false, 'reason', 'invalid_amount_minor');
  end if;

  if coalesce(p_fee_minor, 0) < 0 then
    return jsonb_build_object('applied', false, 'reason', 'invalid_fee_minor');
  end if;

  if p_amount_minor <= coalesce(p_fee_minor, 0) then
    return jsonb_build_object('applied', false, 'reason', 'net_payout_non_positive');
  end if;

  v_requested := coalesce(p_requested_amount_minor, p_amount_minor);
  if v_requested is null or v_requested <= 0 then
    return jsonb_build_object('applied', false, 'reason', 'invalid_requested_amount_minor');
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
      'requested_amount_minor', coalesce(v_existing.requested_amount_minor, v_existing.amount_minor),
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
        'requested_amount_minor', coalesce(v_existing.requested_amount_minor, v_existing.amount_minor),
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
    requested_amount_minor,
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
    v_requested,
    v_transfer_id,
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
      'wallet_debit_minor', p_amount_minor,
      'requested_amount_minor', v_requested,
      'fee_minor', coalesce(p_fee_minor, 0),
      'net_payout_minor', v_net_minor,
      'fee_deducted_from_withdrawal', (p_amount_minor = v_requested),
      'amount', v_amount,
      'stripe_transfer_id', v_transfer_id,
      'stripe_payout_id', trim(p_payout_id),
      'ledger_transaction_id', v_txn_id,
      'payout_only', (v_transfer_id is null)
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
    'requested_amount_minor', v_requested,
    'stripe_transfer_id', v_transfer_id,
    'stripe_payout_id', trim(p_payout_id)
  );
end;
$$;

comment on function public.apply_stripe_connect_withdrawal(text, text, uuid, bigint, text, text, bigint, bigint) is
  'Idempotent withdrawal: debits wallet; net to bank via Stripe payout. stripe_transfer_id optional (null = payout-only from connected balance).';

grant execute on function public.apply_stripe_connect_withdrawal(text, text, uuid, bigint, text, text, bigint, bigint)
  to service_role;
