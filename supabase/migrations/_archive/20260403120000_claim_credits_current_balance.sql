-- Internal batch claims: credit recipient current_balance (available), not pending_balance.
-- Reserved principal already cleared sender settlement at fund time; no card/top-up release queue applies.
-- Extend wallet_dashboard_ledger_aggregates with claim_completed credits for reporting.

-- ---------------------------------------------------------------------------
-- claim_batch_recipient: credit current_balance (withdrawable immediately)
-- ---------------------------------------------------------------------------

create or replace function public.claim_batch_recipient(
  p_claim_token text,
  p_actor_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bc record;
  v_batch record;
  v_txn_id uuid;
  v_key text;
  v_amt numeric(18,2);
  v_system_wallet_id uuid;
  v_recipient_wallet_id uuid;
  v_open int;
  v_currency text;
begin
  if p_claim_token is null or trim(p_claim_token) = '' then
    return jsonb_build_object('ok', false, 'error', 'Missing claim token');
  end if;

  if p_actor_clerk_user_id is null or trim(p_actor_clerk_user_id) = '' then
    return jsonb_build_object('ok', false, 'error', 'Missing actor');
  end if;

  select
    bc.id,
    bc.batch_id,
    bc.user_id,
    bc.claim_amount,
    bc.recipient_lifecycle_status,
    bc.claim_token
  into v_bc
  from public.batch_claims bc
  where bc.claim_token = trim(p_claim_token)
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Invalid claim token');
  end if;

  if v_bc.user_id is distinct from trim(p_actor_clerk_user_id) then
    return jsonb_build_object('ok', false, 'error', 'Claim token does not belong to this user');
  end if;

  select id, org_id, status, currency, total_amount
  into v_batch
  from public.batches
  where id = v_bc.batch_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Batch not found');
  end if;

  if lower(trim(coalesce(v_batch.status, ''))) not in ('funded', 'claiming')
     and v_bc.recipient_lifecycle_status is distinct from 'claimed' then
    return jsonb_build_object('ok', false, 'error', 'Batch is not open for wallet claims');
  end if;

  v_currency := coalesce(v_batch.currency, 'GBP');
  v_amt := round((v_bc.claim_amount)::numeric(18,2), 2);

  if v_bc.recipient_lifecycle_status = 'claimed' then
    v_key := 'claim-completed-' || v_bc.id::text;
    select id into v_txn_id
    from public.ledger_transactions
    where idempotency_key = v_key
    limit 1;

    select id into v_recipient_wallet_id
    from public.wallets
    where user_id = trim(p_actor_clerk_user_id) and currency = v_currency;

    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'claim_status', 'claimed',
      'batch_claim_id', v_bc.id,
      'wallet_id', v_recipient_wallet_id,
      'credited_amount', v_amt,
      'currency', v_currency,
      'ledger_transaction_id', v_txn_id
    );
  end if;

  if v_amt < 0 then
    return jsonb_build_object('ok', false, 'error', 'Invalid claim amount');
  end if;

  v_key := 'claim-completed-' || v_bc.id::text;

  insert into public.ledger_transactions (
    reference_type, reference_id, status, idempotency_key
  )
  values (
    'claim_completed', v_bc.id, 'posted', v_key
  )
  on conflict (idempotency_key) do nothing
  returning id into v_txn_id;

  if v_txn_id is null then
    select lt.id into v_txn_id
    from public.ledger_transactions lt
    where lt.idempotency_key = v_key
    limit 1;

    select id into v_recipient_wallet_id
    from public.wallets
    where user_id = trim(p_actor_clerk_user_id) and currency = v_currency;

    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'claim_status', 'claimed',
      'batch_claim_id', v_bc.id,
      'wallet_id', v_recipient_wallet_id,
      'credited_amount', v_amt,
      'currency', v_currency,
      'ledger_transaction_id', v_txn_id
    );
  end if;

  if v_bc.recipient_lifecycle_status is distinct from 'claimable' then
    return jsonb_build_object('ok', false, 'error', 'Claim is not available for this recipient');
  end if;

  select id into v_system_wallet_id
  from public.wallets
  where user_id = '__system__' and currency = v_currency
  for update;

  if v_system_wallet_id is null then
    raise exception 'System wallet not found';
  end if;

  if coalesce((
    select pending_balance from public.wallets where id = v_system_wallet_id
  ), 0)::numeric(18,2) < v_amt then
    raise exception 'Reserved batch funds insufficient (system wallet)';
  end if;

  update public.wallets
  set pending_balance = pending_balance - v_amt,
      updated_at = now()
  where id = v_system_wallet_id;

  insert into public.wallets (user_id, currency, current_balance, pending_balance, updated_at)
  values (trim(p_actor_clerk_user_id), v_currency, 0, 0, now())
  on conflict (user_id, currency) do nothing;

  select id into v_recipient_wallet_id
  from public.wallets
  where user_id = trim(p_actor_clerk_user_id) and currency = v_currency
  for update;

  update public.wallets
  set current_balance = current_balance + v_amt,
      updated_at = now()
  where id = v_recipient_wallet_id;

  insert into public.ledger_entries (
    transaction_id, wallet_id, amount, entry_type, reference_type, reference_id
  )
  values
    (v_txn_id, v_system_wallet_id, v_amt, 'debit', 'claim_completed', v_bc.id),
    (v_txn_id, v_recipient_wallet_id, v_amt, 'credit', 'claim_completed', v_bc.id);

  insert into public.payouts (
    batch_id, recipient_user_id, wallet_id, amount, status, processed_at
  )
  values (
    v_bc.batch_id,
    trim(p_actor_clerk_user_id),
    v_recipient_wallet_id,
    v_amt,
    'completed',
    now()
  );

  update public.batch_claims
  set
    recipient_lifecycle_status = 'claimed',
    payout_status = 'paid',
    paid_at = now(),
    failure_reason = null
  where id = v_bc.id
    and batch_id = v_bc.batch_id;

  insert into public.audit_events (
    org_id, batch_id, actor_user_id, event_type, event_data
  )
  values (
    v_batch.org_id,
    v_bc.batch_id,
    trim(p_actor_clerk_user_id),
    'claim_completed',
    jsonb_build_object(
      'batch_claim_id', v_bc.id,
      'wallet_id', v_recipient_wallet_id,
      'amount', v_amt,
      'currency', v_currency,
      'ledger_transaction_id', v_txn_id,
      'credited_to', 'current_balance'
    )
  );

  select count(*) into v_open
  from public.batch_claims
  where batch_id = v_bc.batch_id
    and recipient_lifecycle_status = 'claimable';

  if v_open = 0 then
    update public.batches
    set status = 'completed',
        updated_at = now()
    where id = v_bc.batch_id;
  else
    update public.batches
    set status = 'claiming',
        updated_at = now()
    where id = v_bc.batch_id
      and lower(trim(coalesce(status, ''))) = 'funded';
  end if;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'claim_status', 'claimed',
    'batch_claim_id', v_bc.id,
    'wallet_id', v_recipient_wallet_id,
    'credited_amount', v_amt,
    'currency', v_currency,
    'ledger_transaction_id', v_txn_id,
    'batch_completed', v_open = 0
  );
end;
$$;

comment on function public.claim_batch_recipient(text, text) is
  'Credits recipient current_balance (available) from __system__ reserved liability. Idempotent via claim-completed-<batch_claim_id>.';

grant execute on function public.claim_batch_recipient(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- wallet_dashboard_ledger_aggregates: internal claim credits (available funds)
-- ---------------------------------------------------------------------------

create or replace function public.wallet_dashboard_ledger_aggregates(p_wallet_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total_funded',
    coalesce(
      sum(le.amount) filter (
        where le.entry_type = 'credit'
          and lt.reference_type = 'wallet_funding'
      ),
      0
    ),
    'total_from_internal_claims',
    coalesce(
      sum(le.amount) filter (
        where le.entry_type = 'credit'
          and lt.reference_type = 'claim_completed'
      ),
      0
    ),
    'total_sent',
    coalesce(
      sum(le.amount) filter (
        where le.entry_type = 'debit'
          and lt.reference_type in (
            'batch_run',
            'batch_payout',
            'stripe_connect_withdrawal',
            'withdrawal_created'
          )
      ),
      0
    )
  )
  from public.ledger_entries le
  inner join public.ledger_transactions lt on lt.id = le.transaction_id
  where le.wallet_id = p_wallet_id;
$$;

comment on function public.wallet_dashboard_ledger_aggregates(uuid) is
  'total_funded = card/top-up credits (wallet_funding). total_from_internal_claims = batch claim credits (claim_completed, available). total_sent = debits for bulk send, legacy claim payout, Connect withdrawals, and reserve-first withdrawals.';

grant execute on function public.wallet_dashboard_ledger_aggregates(uuid) to service_role;
