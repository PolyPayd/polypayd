-- Fix claim_batch_recipient: ON CONFLICT duplicate path returned success without verifying
-- wallet credits or batch_claims rows: recipients saw "success" / batch "completed" with £0 available.
-- Also credit legacy process_claimable_batch_payout to current_balance (available), not pending_balance.

-- ---------------------------------------------------------------------------
-- claim_batch_recipient: strict idempotency + resume if ledger row exists without entries
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
  v_has_recipient_credit boolean;
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

  v_key := 'claim-completed-' || v_bc.id::text;

  insert into public.wallets (user_id, currency, current_balance, pending_balance, updated_at)
  values (trim(p_actor_clerk_user_id), v_currency, 0, 0, now())
  on conflict (user_id, currency) do nothing;

  select id into v_recipient_wallet_id
  from public.wallets
  where user_id = trim(p_actor_clerk_user_id) and currency = v_currency;

  select id into v_txn_id
  from public.ledger_transactions
  where idempotency_key = v_key
  limit 1;

  if v_txn_id is not null and v_recipient_wallet_id is not null then
    select exists (
      select 1
      from public.ledger_entries le
      where le.transaction_id = v_txn_id
        and le.wallet_id = v_recipient_wallet_id
        and le.entry_type = 'credit'
    )
    into v_has_recipient_credit;
  else
    v_has_recipient_credit := false;
  end if;

  if v_bc.recipient_lifecycle_status = 'claimed' and v_has_recipient_credit then
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

  if v_bc.recipient_lifecycle_status is distinct from 'claimable'
     and not (v_bc.recipient_lifecycle_status = 'claimed' and not v_has_recipient_credit) then
    return jsonb_build_object('ok', false, 'error', 'Claim is not available for this recipient');
  end if;

  if v_txn_id is null then
    insert into public.ledger_transactions (
      reference_type, reference_id, status, idempotency_key
    )
    values (
      'claim_completed', v_bc.id, 'posted', v_key
    )
    on conflict (idempotency_key) do nothing
    returning id into v_txn_id;
  end if;

  if v_txn_id is null then
    select lt.id into v_txn_id
    from public.ledger_transactions lt
    where lt.idempotency_key = v_key
    limit 1;
  end if;

  if v_txn_id is null then
    return jsonb_build_object('ok', false, 'error', 'Could not create claim ledger record');
  end if;

  if v_has_recipient_credit then
    if not exists (
      select 1
      from public.payouts p
      where p.batch_id = v_bc.batch_id
        and p.recipient_user_id = trim(p_actor_clerk_user_id)
        and p.status = 'completed'
    ) then
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
    end if;

    update public.batch_claims
    set
      recipient_lifecycle_status = 'claimed',
      payout_status = 'paid',
      paid_at = coalesce(paid_at, now()),
      failure_reason = null
    where id = v_bc.id
      and batch_id = v_bc.batch_id;

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
      'duplicate', true,
      'claim_status', 'claimed',
      'batch_claim_id', v_bc.id,
      'wallet_id', v_recipient_wallet_id,
      'credited_amount', v_amt,
      'currency', v_currency,
      'ledger_transaction_id', v_txn_id,
      'batch_completed', v_open = 0
    );
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

  select id into v_recipient_wallet_id
  from public.wallets
  where user_id = trim(p_actor_clerk_user_id) and currency = v_currency
  for update;

  if v_recipient_wallet_id is null then
    raise exception 'Recipient wallet not found';
  end if;

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
  'Credits recipient current_balance from __system__ reserved liability. Idempotent: verifies credit ledger line exists; completes claim row if credit exists but claim was stuck.';

grant execute on function public.claim_batch_recipient(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Legacy one-shot claimable payout: credit recipient current_balance (available)
-- ---------------------------------------------------------------------------

create or replace function public.process_claimable_batch_payout(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch batches%rowtype;
  v_claim record;
  v_total_amount numeric(18,2);
  v_alloc_total numeric(18,2);
  v_sender_wallet_id uuid;
  v_sender_pending numeric(18,2);
  v_sender_current numeric(18,2);
  v_spendable numeric(18,2);
  v_from_pending numeric(18,2);
  v_from_current numeric(18,2);
  v_recipient_wallet_id uuid;
  v_txn_id uuid;
  v_idempotency_key text;
  v_currency text;
  v_funded_by text;
  v_claim_count int;
  c_platform_fee_bps int := 150;
  v_calculated_fee numeric(18,2) := 0;
  v_platform_fee numeric(18,2) := 0;
  v_total_debit numeric(18,2) := 0;
  v_platform_wallet_id uuid;
  v_impact_amount numeric(18,2) := 0;
begin
  v_idempotency_key := 'batch-payout-' || p_batch_id;

  select * into v_batch from batches where id = p_batch_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Batch not found');
  end if;

  if v_batch.batch_type is distinct from 'claimable' then
    return jsonb_build_object('ok', false, 'error', 'Batch is not claimable');
  end if;

  if v_batch.status = 'completed' or v_batch.status = 'completed_with_errors' then
    return jsonb_build_object('ok', false, 'error', 'Batch not eligible for payout');
  end if;

  if lower(trim(coalesce(v_batch.status, ''))) in ('funded', 'claiming') then
    return jsonb_build_object(
      'ok', false,
      'error',
      'This batch was funded for per-recipient wallet claims; use the claim flow instead of legacy batch payout.'
    );
  end if;

  if v_batch.allocations_locked_at is null then
    return jsonb_build_object('ok', false, 'error', 'Allocations must be finalized');
  end if;

  v_total_amount := coalesce(v_batch.total_amount, 0)::numeric(18,2);
  v_currency := coalesce(v_batch.currency, 'GBP');
  v_funded_by := v_batch.funded_by_user_id;

  select coalesce(sum((claim_amount)::numeric(18,2)), 0), count(*)
  into v_alloc_total, v_claim_count
  from batch_claims
  where batch_id = p_batch_id;

  if v_claim_count = 0 then
    return jsonb_build_object('ok', false, 'error', 'No recipients to pay');
  end if;

  if exists (select 1 from batch_claims where batch_id = p_batch_id and (claim_amount is null or claim_amount < 0)) then
    return jsonb_build_object('ok', false, 'error', 'Every recipient must have a valid locked amount (claim_amount). Save and finalize allocations first.');
  end if;

  if v_funded_by is null or v_funded_by = '' then
    return jsonb_build_object('ok', false, 'error', 'Batch has no funder (funded_by_user_id required for ledger)');
  end if;

  if abs(v_alloc_total - v_total_amount) > 0.01 then
    return jsonb_build_object('ok', false, 'error', 'Total allocations do not match batch amount');
  end if;

  v_calculated_fee := round(v_alloc_total * c_platform_fee_bps / 10000.0, 2);
  v_platform_fee := v_calculated_fee;
  v_total_debit := v_alloc_total + v_platform_fee;
  v_impact_amount := round(v_platform_fee * 0.01, 2);

  insert into ledger_transactions (
    reference_type, reference_id, status, idempotency_key, platform_fee, fee_bps
  )
  values ('batch_payout', p_batch_id, 'posted', v_idempotency_key, v_platform_fee, c_platform_fee_bps)
  on conflict (idempotency_key) do nothing
  returning id into v_txn_id;

  if v_txn_id is null then
    return jsonb_build_object('ok', false, 'error', 'Duplicate payout (idempotency)');
  end if;

  insert into wallets (user_id, currency, current_balance, updated_at)
  values (v_funded_by, v_currency, 0, now())
  on conflict (user_id, currency) do nothing;

  select id,
         coalesce(pending_balance, 0)::numeric(18,2),
         coalesce(current_balance, 0)::numeric(18,2)
  into v_sender_wallet_id, v_sender_pending, v_sender_current
  from wallets
  where user_id = v_funded_by and currency = v_currency
  for update;

  if v_sender_wallet_id is null then
    return jsonb_build_object('ok', false, 'error', 'Sender wallet not found');
  end if;

  v_spendable := v_sender_pending + v_sender_current;
  if v_spendable < v_total_debit then
    return jsonb_build_object('ok', false, 'error', 'Insufficient sender balance');
  end if;

  v_from_pending := least(v_sender_pending, v_total_debit);
  v_from_current := v_total_debit - v_from_pending;

  perform public.consume_wallet_topup_release_queue_for_debit(v_sender_wallet_id, v_from_pending);

  update wallets
  set pending_balance = pending_balance - v_from_pending,
      current_balance = current_balance - v_from_current,
      updated_at = now()
  where id = v_sender_wallet_id;

  insert into ledger_entries (transaction_id, wallet_id, amount, entry_type)
  values (v_txn_id, v_sender_wallet_id, v_total_debit, 'debit');

  for v_claim in
    select id, user_id, (claim_amount)::numeric(18,2) as amt
    from batch_claims
    where batch_id = p_batch_id
    order by created_at
  loop
    insert into wallets (user_id, currency, current_balance, pending_balance, updated_at)
    values (v_claim.user_id, v_currency, 0, 0, now())
    on conflict (user_id, currency) do nothing;

    select id into v_recipient_wallet_id from wallets where user_id = v_claim.user_id and currency = v_currency for update;

    update wallets
    set current_balance = current_balance + v_claim.amt,
        updated_at = now()
    where id = v_recipient_wallet_id;

    insert into ledger_entries (transaction_id, wallet_id, amount, entry_type)
    values (v_txn_id, v_recipient_wallet_id, v_claim.amt, 'credit');

    insert into payouts (batch_id, recipient_user_id, wallet_id, amount, status, processed_at)
    values (p_batch_id, v_claim.user_id, v_recipient_wallet_id, v_claim.amt, 'completed', now());

    update batch_claims
    set payout_status = 'paid', paid_at = now(), failure_reason = null
    where id = v_claim.id and batch_id = p_batch_id;
  end loop;

  if v_platform_fee > 0 then
    insert into wallets (user_id, currency, current_balance, updated_at)
    values ('__platform__', v_currency, 0, now())
    on conflict (user_id, currency) do nothing;

    select id into v_platform_wallet_id
    from wallets
    where user_id = '__platform__' and currency = v_currency
    for update;

    update wallets
    set pending_balance = pending_balance + v_platform_fee,
        updated_at = now()
    where id = v_platform_wallet_id;

    insert into ledger_entries (transaction_id, wallet_id, amount, entry_type)
    values (v_txn_id, v_platform_wallet_id, v_platform_fee, 'credit');

    perform apply_impact_from_platform_fee(v_txn_id, v_platform_fee, v_currency);
  end if;

  update batches set status = 'completed' where id = p_batch_id;

  return jsonb_build_object(
    'ok', true,
    'transaction_id', v_txn_id,
    'recipient_count', v_claim_count,
    'platform_fee', v_platform_fee,
    'fee_bps', c_platform_fee_bps,
    'impact_amount', v_impact_amount
  );
end;
$$;

grant execute on function public.process_claimable_batch_payout(uuid) to anon, authenticated, service_role;
