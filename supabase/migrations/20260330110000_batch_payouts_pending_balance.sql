-- Step 4: Bulk payout RPCs debit/credit pending_balance (sender, recipients, __system__, __platform__).
-- Also updates apply_impact_from_platform_fee to move fees on pending_balance (matches fee credit above).

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
  set pending_balance = pending_balance - v_impact,
      updated_at = now()
  where id = v_platform_wallet_id
    and pending_balance >= v_impact;

  if not found then
    raise exception 'Impact allocation failed: insufficient balance in platform wallet';
  end if;

  update public.wallets
  set pending_balance = pending_balance + v_impact,
      updated_at = now()
  where id = v_impact_wallet_id;
end;
$$;

comment on function public.apply_impact_from_platform_fee(uuid, numeric, text) is
  'Moves 1% of p_platform_fee from __platform__ to __impact__; records impact_ledger (idempotent per source_transaction_id).';

grant execute on function public.apply_impact_from_platform_fee(uuid, numeric, text) to anon, authenticated, service_role;

create or replace function public.process_standard_batch_run(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_status text;
  v_batch_currency text;
  v_funded_by text;
  v_item record;
  v_success_count int := 0;
  v_processed_item_count int := 0;
  v_pending_amount numeric(18,2) := 0;
  v_pending_count int := 0;
  v_sender_wallet_id uuid;
  v_sender_balance numeric(18,2);
  v_remaining_balance numeric(18,2);
  v_system_wallet_id uuid;
  v_platform_wallet_id uuid;
  v_ledger_transaction_id uuid;
  v_ledger_idempotency_key text;
  v_error_context text;
  c_platform_fee_bps int := 150;
  v_calculated_fee numeric(18,2) := 0;
  v_min_platform_fee numeric(18,2) := 1.00;
  v_platform_fee numeric(18,2) := 0;
  v_total_debit numeric(18,2) := 0;
  v_impact_amount numeric(18,2) := 0;
begin
  select status, coalesce(currency, 'GBP'), funded_by_user_id
  into v_batch_status, v_batch_currency, v_funded_by
  from batches
  where id = p_batch_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Batch not found');
  end if;

  if v_batch_status <> 'processing' then
    return jsonb_build_object('ok', false, 'error', 'Batch must be in processing state to run');
  end if;

  if v_funded_by is null or v_funded_by = '' then
    return jsonb_build_object(
      'ok', false,
      'error', 'Batch has no funder (funded_by_user_id required for wallet validation)'
    );
  end if;

  select count(*), coalesce(sum((amount)::numeric(18,2)), 0)
  into v_pending_count, v_pending_amount
  from batch_items
  where batch_id = p_batch_id
    and (status is null or status = 'pending');

  if v_pending_count = 0 then
    return jsonb_build_object('ok', false, 'error', 'No batch items to process');
  end if;

  if v_pending_amount <= 0 then
    return jsonb_build_object('ok', false, 'error', 'Batch total must be greater than zero');
  end if;

  v_calculated_fee := round(v_pending_amount * c_platform_fee_bps / 10000.0, 2);
  v_platform_fee := greatest(v_calculated_fee, v_min_platform_fee);
  v_total_debit := v_pending_amount + v_platform_fee;
  v_impact_amount := round(v_platform_fee * 0.01, 2);

  select id, pending_balance into v_sender_wallet_id, v_sender_balance
  from wallets
  where user_id = v_funded_by
    and currency = v_batch_currency
  for update;

  if v_sender_balance is null then
    return jsonb_build_object('ok', false, 'error', 'Sender wallet not found');
  end if;

  if v_sender_balance < v_total_debit then
    return jsonb_build_object(
      'ok', false,
      'error',
      'Insufficient wallet balance. Pending balance is ' || v_sender_balance::text ||
      ' but required amount is ' || v_total_debit::text ||
      ' (principal ' || v_pending_amount::text || ' plus platform fee ' || v_platform_fee::text || ').' ||
      ' Add funds or reduce the amount.'
    );
  end if;

  for v_item in
    select id
    from batch_items
    where batch_id = p_batch_id
      and (status is null or status = 'pending')
    order by created_at
  loop
    update batch_items
    set status = 'success',
        failure_reason = null
    where id = v_item.id
      and batch_id = p_batch_id
      and (status is null or status = 'pending');

    if found then
      v_success_count := v_success_count + 1;
      v_processed_item_count := v_processed_item_count + 1;
    end if;
  end loop;

  update batches
  set status = 'completed'
  where id = p_batch_id;

  update wallets
  set pending_balance = pending_balance - v_total_debit,
      updated_at = now()
  where id = v_sender_wallet_id
    and pending_balance >= v_total_debit
  returning pending_balance into v_remaining_balance;

  if not found then
    raise exception 'Wallet debit failed (insufficient balance during debit).';
  end if;

  v_ledger_idempotency_key := 'standard-batch-run-' || p_batch_id::text;

  insert into wallets (user_id, currency, current_balance, updated_at)
  values ('__system__', v_batch_currency, 0, now())
  on conflict (user_id, currency) do nothing;

  select id into v_system_wallet_id
  from wallets
  where user_id = '__system__'
    and currency = v_batch_currency
  for update;

  select id into v_ledger_transaction_id
  from ledger_transactions
  where idempotency_key = v_ledger_idempotency_key;

  if v_ledger_transaction_id is null then
    insert into ledger_transactions (
      reference_type, reference_id, status, idempotency_key, platform_fee, fee_bps
    )
    values (
      'batch_run', p_batch_id, 'posted', v_ledger_idempotency_key, v_platform_fee, c_platform_fee_bps
    )
    returning id into v_ledger_transaction_id;

    if v_platform_fee > 0 then
      insert into wallets (user_id, currency, current_balance, updated_at)
      values ('__platform__', v_batch_currency, 0, now())
      on conflict (user_id, currency) do nothing;

      select id into v_platform_wallet_id
      from wallets
      where user_id = '__platform__'
        and currency = v_batch_currency
      for update;

      update wallets
      set pending_balance = pending_balance + v_platform_fee,
          updated_at = now()
      where id = v_platform_wallet_id;

      update wallets
      set pending_balance = pending_balance + v_pending_amount,
          updated_at = now()
      where id = v_system_wallet_id;

      insert into ledger_entries (transaction_id, wallet_id, amount, entry_type, reference_type, reference_id)
      values
        (v_ledger_transaction_id, v_sender_wallet_id, v_total_debit, 'debit', 'batch_run', p_batch_id),
        (v_ledger_transaction_id, v_platform_wallet_id, v_platform_fee, 'credit', 'batch_run', p_batch_id),
        (v_ledger_transaction_id, v_system_wallet_id, v_pending_amount, 'credit', 'batch_run', p_batch_id);
    else
      update wallets
      set pending_balance = pending_balance + v_pending_amount,
          updated_at = now()
      where id = v_system_wallet_id;

      insert into ledger_entries (transaction_id, wallet_id, amount, entry_type, reference_type, reference_id)
      values
        (v_ledger_transaction_id, v_sender_wallet_id, v_pending_amount, 'debit', 'batch_run', p_batch_id),
        (v_ledger_transaction_id, v_system_wallet_id, v_pending_amount, 'credit', 'batch_run', p_batch_id);
    end if;

    perform apply_impact_from_platform_fee(v_ledger_transaction_id, v_platform_fee, v_batch_currency);
  end if;

  insert into payouts (batch_id, recipient_user_id, wallet_id, amount, status, processed_at, batch_item_id)
  select
    bi.batch_id,
    coalesce(bi.account_identifier, 'UNKNOWN') as recipient_user_id,
    null as wallet_id,
    (bi.amount)::numeric(18,2) as amount,
    bi.status,
    now() as processed_at,
    bi.id as batch_item_id
  from batch_items bi
  where bi.batch_id = p_batch_id
    and bi.status in ('success', 'failed')
  on conflict (batch_item_id, status) where batch_item_id is not null do nothing;

  return jsonb_build_object(
    'ok', true,
    'success_count', v_success_count,
    'processed_item_count', v_processed_item_count,
    'debited_amount', v_pending_amount,
    'platform_fee', v_platform_fee,
    'fee_bps', c_platform_fee_bps,
    'impact_amount', v_impact_amount,
    'total_debited_from_sender', v_total_debit,
    'remaining_balance', v_remaining_balance,
    'ledger_transaction_id', v_ledger_transaction_id
  );
EXCEPTION WHEN others THEN
  GET STACKED DIAGNOSTICS v_error_context = PG_EXCEPTION_CONTEXT;
  RETURN jsonb_build_object(
    'ok', false,
    'error', SQLERRM || E'\n' || COALESCE(v_error_context, '')
  );
END;
$$;

grant execute on function public.process_standard_batch_run(uuid) to anon, authenticated;

-- 4) Claim Link payout: debit sender (alloc+fee), credit recipients (alloc), credit __platform__ (fee)
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
  v_sender_balance numeric(18,2);
  v_recipient_wallet_id uuid;
  v_txn_id uuid;
  v_idempotency_key text;
  v_currency text;
  v_funded_by text;
  v_claim_count int;
  c_platform_fee_bps int := 150;
  v_calculated_fee numeric(18,2) := 0;
  v_min_platform_fee numeric(18,2) := 1.00;
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
  v_platform_fee := greatest(v_calculated_fee, v_min_platform_fee);
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

  select id, pending_balance into v_sender_wallet_id, v_sender_balance
  from wallets
  where user_id = v_funded_by and currency = v_currency
  for update;

  if v_sender_wallet_id is null then
    return jsonb_build_object('ok', false, 'error', 'Sender wallet not found');
  end if;

  if v_sender_balance < v_total_debit then
    return jsonb_build_object('ok', false, 'error', 'Insufficient sender balance');
  end if;

  update wallets set pending_balance = pending_balance - v_total_debit, updated_at = now()
  where id = v_sender_wallet_id;

  insert into ledger_entries (transaction_id, wallet_id, amount, entry_type)
  values (v_txn_id, v_sender_wallet_id, v_total_debit, 'debit');

  for v_claim in
    select id, user_id, (claim_amount)::numeric(18,2) as amt
    from batch_claims
    where batch_id = p_batch_id
    order by created_at
  loop
    insert into wallets (user_id, currency, current_balance, updated_at)
    values (v_claim.user_id, v_currency, 0, now())
    on conflict (user_id, currency) do nothing;

    select id into v_recipient_wallet_id from wallets where user_id = v_claim.user_id and currency = v_currency for update;

    update wallets set pending_balance = pending_balance + v_claim.amt, updated_at = now()
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

grant execute on function public.process_claimable_batch_payout(uuid) to anon, authenticated;

-- 5) Retry failed standard items: per-item fee + platform credit + impact (aligned with main run)
create or replace function public.process_standard_batch_retry_failed(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch batches%rowtype;
  v_currency text;
  v_funded_by text;
  v_sender_wallet_id uuid;
  v_sender_balance numeric(18,2);
  v_system_wallet_id uuid;
  v_platform_wallet_id uuid;
  v_system_user_id text := '__system__';

  v_required_with_fees numeric(18,2) := 0;
  v_success_count int := 0;
  v_failed_count int := 0;
  v_success_amount numeric(18,2) := 0;
  v_failed_amount numeric(18,2) := 0;

  v_any_failed boolean := false;

  v_item record;
  v_should_fail boolean;
  v_failure_reason text;

  v_txn_id uuid;
  v_idempotency_key text;
  v_error_context text;
  c_platform_fee_bps int := 150;
  v_min_platform_fee numeric(18,2) := 1.00;
  v_line_calculated_fee numeric(18,2) := 0;
  v_line_fee numeric(18,2) := 0;
  v_line_total numeric(18,2) := 0;
begin
  select * into v_batch from batches where id = p_batch_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Batch not found');
  end if;

  if v_batch.batch_type is distinct from 'standard' then
    return jsonb_build_object('ok', false, 'error', 'Batch is not standard');
  end if;

  if v_batch.status <> 'completed_with_errors' then
    if v_batch.status = 'completed' then
      return jsonb_build_object('ok', false, 'error', 'No failed items to retry');
    end if;
  end if;

  v_currency := coalesce(v_batch.currency, 'GBP');
  v_funded_by := v_batch.funded_by_user_id;

  if v_funded_by is null or v_funded_by = '' then
    return jsonb_build_object('ok', false, 'error', 'Batch has no funder (funded_by_user_id required for ledger)');
  end if;

  select coalesce(round(sum(
    (amount)::numeric(18,2)
    + greatest(
        round((amount)::numeric(18,2) * c_platform_fee_bps / 10000.0, 2),
        v_min_platform_fee
      )
  ), 2), 0)
  into v_required_with_fees
  from batch_items
  where batch_id = p_batch_id
    and status = 'failed';

  if v_required_with_fees <= 0 then
    return jsonb_build_object('ok', false, 'error', 'No failed items to retry');
  end if;

  insert into wallets (user_id, currency, current_balance, updated_at)
  values (v_funded_by, v_currency, 0, now())
  on conflict (user_id, currency) do nothing;

  select id, pending_balance into v_sender_wallet_id, v_sender_balance
  from wallets
  where user_id = v_funded_by and currency = v_currency
  for update;

  if v_sender_wallet_id is null then
    return jsonb_build_object('ok', false, 'error', 'Sender wallet not found');
  end if;

  if v_sender_balance < v_required_with_fees then
    return jsonb_build_object(
      'ok', false,
      'error',
      'Insufficient wallet balance. Pending balance is ' || v_sender_balance::text ||
      ' but required amount (principal + platform fee on failed items) is ' || v_required_with_fees::text ||
      '. Add funds or reduce the amount.'
    );
  end if;

  insert into wallets (user_id, currency, current_balance, updated_at)
  values (v_system_user_id, v_currency, 0, now())
  on conflict (user_id, currency) do nothing;

  insert into wallets (user_id, currency, current_balance, updated_at)
  values ('__platform__', v_currency, 0, now())
  on conflict (user_id, currency) do nothing;

  select id into v_system_wallet_id
  from wallets
  where user_id = v_system_user_id and currency = v_currency
  for update;

  select id into v_platform_wallet_id
  from wallets
  where user_id = '__platform__' and currency = v_currency
  for update;

  for v_item in
    select id, (amount)::numeric(18,2) as amt, account_identifier
    from batch_items
    where batch_id = p_batch_id
      and status = 'failed'
    order by created_at
    for update
  loop
    v_should_fail := random() < 0.5;

    if v_should_fail then
      v_failure_reason := (array[
        'BANK_REJECTED',
        'ACCOUNT_INVALID',
        'INSUFFICIENT_FUNDS',
        'NETWORK_ERROR'
      ])[floor(random() * 4)::int + 1];

      update batch_items
      set status = 'failed',
          failure_reason = v_failure_reason
      where id = v_item.id
        and batch_id = p_batch_id
        and status = 'failed';

      v_failed_count := v_failed_count + 1;
      v_failed_amount := v_failed_amount + v_item.amt;

      insert into payouts (batch_id, recipient_user_id, wallet_id, amount, status, processed_at, batch_item_id)
      values (
        p_batch_id,
        coalesce(v_item.account_identifier, 'UNKNOWN'),
        null,
        v_item.amt,
        'failed',
        now(),
        v_item.id
      )
      on conflict (batch_item_id, status) where batch_item_id is not null do nothing;
    else
      update batch_items
      set status = 'success',
          failure_reason = null
      where id = v_item.id
        and batch_id = p_batch_id
        and status = 'failed';

      v_success_count := v_success_count + 1;
      v_success_amount := v_success_amount + v_item.amt;

      v_line_calculated_fee := round(v_item.amt * c_platform_fee_bps / 10000.0, 2);
      v_line_fee := greatest(v_line_calculated_fee, v_min_platform_fee);
      v_line_total := v_item.amt + v_line_fee;

      v_idempotency_key := 'standard-batch-item-payout-' || v_item.id::text;

      insert into ledger_transactions (
        reference_type, reference_id, status, idempotency_key, platform_fee, fee_bps
      )
      values ('batch_payout', p_batch_id, 'posted', v_idempotency_key, v_line_fee, c_platform_fee_bps)
      on conflict (idempotency_key) do nothing
      returning id into v_txn_id;

      if v_txn_id is not null then
        update wallets
        set pending_balance = pending_balance - v_line_total,
            updated_at = now()
        where id = v_sender_wallet_id;

        if v_line_fee > 0 then
          update wallets
          set pending_balance = pending_balance + v_line_fee,
              updated_at = now()
          where id = v_platform_wallet_id;

          update wallets
          set pending_balance = pending_balance + v_item.amt,
              updated_at = now()
          where id = v_system_wallet_id;

          insert into ledger_entries (transaction_id, wallet_id, amount, entry_type, reference_type, reference_id)
          values
            (v_txn_id, v_sender_wallet_id, v_line_total, 'debit', 'batch_item', v_item.id),
            (v_txn_id, v_platform_wallet_id, v_line_fee, 'credit', 'batch_item', v_item.id),
            (v_txn_id, v_system_wallet_id, v_item.amt, 'credit', 'batch_item', v_item.id);

          perform apply_impact_from_platform_fee(v_txn_id, v_line_fee, v_currency);
        else
          update wallets
          set pending_balance = pending_balance + v_item.amt,
              updated_at = now()
          where id = v_system_wallet_id;

          insert into ledger_entries (transaction_id, wallet_id, amount, entry_type, reference_type, reference_id)
          values
            (v_txn_id, v_sender_wallet_id, v_item.amt, 'debit', 'batch_item', v_item.id),
            (v_txn_id, v_system_wallet_id, v_item.amt, 'credit', 'batch_item', v_item.id);
        end if;

        insert into payouts (batch_id, recipient_user_id, wallet_id, amount, status, processed_at, batch_item_id)
        values (
          p_batch_id,
          coalesce(v_item.account_identifier, 'UNKNOWN'),
          v_system_wallet_id,
          v_item.amt,
          'completed',
          now(),
          v_item.id
        )
        on conflict (batch_item_id, status) where batch_item_id is not null do nothing;
      end if;
    end if;
  end loop;

  select exists(
    select 1 from batch_items
    where batch_id = p_batch_id and status = 'failed'
  ) into v_any_failed;

  update batches
  set status = case when v_any_failed then 'completed_with_errors' else 'completed' end
  where id = p_batch_id;

  return jsonb_build_object(
    'ok', true,
    'final_status', case when v_any_failed then 'completed_with_errors' else 'completed' end,
    'success_count', v_success_count,
    'remaining_failed_count', v_failed_count,
    'success_amount', v_success_amount,
    'failed_amount', v_failed_amount
  );
EXCEPTION WHEN others THEN
  GET STACKED DIAGNOSTICS v_error_context = PG_EXCEPTION_CONTEXT;
  RETURN jsonb_build_object(
    'ok', false,
    'error', SQLERRM || E'\n' || COALESCE(v_error_context, '')
  );
END;
$$;

grant execute on function public.process_standard_batch_retry_failed(uuid) to anon, authenticated;
