-- Wallet + ledger posting for CSV/manual (standard) batches.
-- This adds RPC functions that:
-- - simulate item execution
-- - check sender wallet balance at execution time
-- - debit sender wallet for successful items
-- - credit an internal clearing wallet for successful items (to keep the ledger balanced)
-- - update batch_items statuses and batches status
-- - ensure idempotency via ledger_transactions.idempotency_key (per batch_item)

-- Payout trace auditability: add per-batch_item idempotency key
alter table payouts
  add column if not exists batch_item_id uuid null references batch_items(id) on delete set null;

create unique index if not exists payouts_batch_item_id_status_key
  on payouts (batch_item_id, status)
  where batch_item_id is not null;

create or replace function public.process_standard_batch_run(p_batch_id uuid)
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
  v_system_user_id text := '__system__';

  v_pending_amount numeric(18,2) := 0;
  v_success_count int := 0;
  v_failed_count int := 0;
  v_success_amount numeric(18,2) := 0;
  v_failed_amount numeric(18,2) := 0;

  v_item record;
  v_should_fail boolean;
  v_failure_reason text;

  v_txn_id uuid;
  v_idempotency_key text;
  v_error_context text;
begin
  -- Lock batch and load
  select * into v_batch from batches where id = p_batch_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Batch not found');
  end if;

  if v_batch.batch_type is distinct from 'standard' then
    return jsonb_build_object('ok', false, 'error', 'Batch is not standard');
  end if;

  -- Idempotency guard: if already completed, just report status.
  if v_batch.status = 'completed' or v_batch.status = 'completed_with_errors' then
    select
      coalesce(sum((amount)::numeric(18,2)), 0),
      count(*)
    into v_success_amount, v_success_count
    from batch_items
    where batch_id = p_batch_id and status = 'success';

    select
      coalesce(sum((amount)::numeric(18,2)), 0),
      count(*)
    into v_failed_amount, v_failed_count
    from batch_items
    where batch_id = p_batch_id and status = 'failed';

    return jsonb_build_object(
      'ok', true,
      'already_processed', true,
      'final_status', v_batch.status,
      'success_count', v_success_count,
      'failed_count', v_failed_count,
      'success_amount', v_success_amount,
      'failed_amount', v_failed_amount
    );
  end if;

  if v_batch.status <> 'processing' then
    return jsonb_build_object('ok', false, 'error', 'Batch must be in processing state to run');
  end if;

  v_currency := coalesce(v_batch.currency, 'GBP');
  v_funded_by := v_batch.funded_by_user_id;

  if v_funded_by is null or v_funded_by = '' then
    return jsonb_build_object('ok', false, 'error', 'Batch has no funder (funded_by_user_id required for ledger)');
  end if;

  -- Candidate items are the ones still pending.
  select
    coalesce(sum((amount)::numeric(18,2)), 0)
  into v_pending_amount
  from batch_items
  where batch_id = p_batch_id
    and (status is null or status = 'pending');

  if v_pending_amount <= 0 then
    return jsonb_build_object('ok', false, 'error', 'No pending items to process');
  end if;

  -- Sender wallet (create if missing)
  insert into wallets (user_id, currency, current_balance, updated_at)
  values (v_funded_by, v_currency, 0, now())
  on conflict (user_id, currency) do nothing;

  select id, current_balance into v_sender_wallet_id, v_sender_balance
  from wallets
  where user_id = v_funded_by and currency = v_currency
  for update;

  if v_sender_wallet_id is null then
    return jsonb_build_object('ok', false, 'error', 'Sender wallet not found');
  end if;

  -- Conservative wallet check (debit occurs only for successes, but check against full pending amount).
  if v_sender_balance < v_pending_amount then
    return jsonb_build_object(
      'ok', false,
      'error',
      'Insufficient wallet balance. Available balance is ' || v_sender_balance::text ||
      ' but pending batch amount is ' || v_pending_amount::text ||
      '. Add funds or reduce the amount.'
    );
  end if;

  -- System clearing wallet (create if missing)
  insert into wallets (user_id, currency, current_balance, updated_at)
  values (v_system_user_id, v_currency, 0, now())
  on conflict (user_id, currency) do nothing;

  select id into v_system_wallet_id
  from wallets
  where user_id = v_system_user_id and currency = v_currency
  for update;

  -- Simulate + post ledger for each pending item.
  for v_item in
    select id, (amount)::numeric(18,2) as amt, account_identifier
    from batch_items
    where batch_id = p_batch_id
      and (status is null or status = 'pending')
    order by created_at
  loop
    -- ~20% failure, to match the existing JS behavior.
    v_should_fail := random() < 0.2;

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
        and (status is null or status = 'pending');

      v_failed_count := v_failed_count + 1;
      v_failed_amount := v_failed_amount + v_item.amt;

      insert into payouts (batch_id, recipient_user_id, wallet_id, amount, status, processed_at)
      values (
        p_batch_id,
        coalesce(v_item.account_identifier, 'UNKNOWN'),
        null,
        v_item.amt,
        'failed',
        now()
      );
    else
      update batch_items
      set status = 'success',
          failure_reason = null
      where id = v_item.id
        and batch_id = p_batch_id
        and (status is null or status = 'pending');

      v_success_count := v_success_count + 1;
      v_success_amount := v_success_amount + v_item.amt;

      -- Per-item idempotency: never debit twice for the same batch_item.
      v_idempotency_key := 'standard-batch-item-payout-' || v_item.id::text;

      insert into ledger_transactions (reference_type, reference_id, status, idempotency_key)
      values ('batch_payout', p_batch_id, 'posted', v_idempotency_key)
      on conflict (idempotency_key) do nothing
      returning id into v_txn_id;

      if v_txn_id is not null then
        -- Debit sender and credit system clearing wallet.
        update wallets
        set current_balance = current_balance - v_item.amt,
            updated_at = now()
        where id = v_sender_wallet_id;

        insert into ledger_entries (transaction_id, wallet_id, amount, entry_type, reference_type, reference_id)
        values (v_txn_id, v_sender_wallet_id, v_item.amt, 'debit', 'batch_item', v_item.id);

        insert into ledger_entries (transaction_id, wallet_id, amount, entry_type, reference_type, reference_id)
        values (v_txn_id, v_system_wallet_id, v_item.amt, 'credit', 'batch_item', v_item.id);

        -- Best-effort payout record for traceability.
        insert into payouts (batch_id, recipient_user_id, wallet_id, amount, status, processed_at)
        values (
          p_batch_id,
          coalesce(v_item.account_identifier, 'UNKNOWN'),
          v_system_wallet_id,
          v_item.amt,
          'completed',
          now()
        );
      end if;
    end if;
  end loop;

  update batches
  set status = case when v_failed_count > 0 then 'completed_with_errors' else 'completed' end
  where id = p_batch_id;

  return jsonb_build_object(
    'ok', true,
    'final_status', case when v_failed_count > 0 then 'completed_with_errors' else 'completed' end,
    'success_count', v_success_count,
    'failed_count', v_failed_count,
    'success_amount', v_success_amount,
    'failed_amount', v_failed_amount,
    'processed_item_count', v_success_count + v_failed_count
  );
EXCEPTION WHEN others THEN
  GET STACKED DIAGNOSTICS v_error_context = PG_EXCEPTION_CONTEXT;
  RETURN jsonb_build_object(
    'ok', false,
    'error', SQLERRM || E'\n' || COALESCE(v_error_context, '')
  );
END;
$$;

-- Rebuilt minimal, deterministic batch runner (step-by-step rebuild).
-- This intentionally excludes ledger, payouts, and wallet logic for now.
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
  v_ledger_transaction_id uuid;
  v_ledger_idempotency_key text;
  v_error_context text;
begin
  -- Step 1: Select batch and ensure status = 'processing'
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

  -- Wallet balance validation (Phase 2)
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

  select id, current_balance into v_sender_wallet_id, v_sender_balance
  from wallets
  where user_id = v_funded_by
    and currency = v_batch_currency
  for update;

  if v_sender_balance is null then
    return jsonb_build_object('ok', false, 'error', 'Sender wallet not found');
  end if;

  if v_sender_balance < v_pending_amount then
    return jsonb_build_object(
      'ok', false,
      'error',
      'Insufficient wallet balance. Available balance is ' || v_sender_balance::text ||
      ' but pending batch amount is ' || v_pending_amount::text ||
      '. Add funds or reduce the amount.'
    );
  end if;

  -- Step 2: Loop through batch_items and update ALL pending items to success
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

  -- Step 3: Update batch status to completed
  update batches
  set status = 'completed'
  where id = p_batch_id;

  -- Step 5: Debit the sender wallet by the processed total.
  update wallets
  set current_balance = current_balance - v_pending_amount,
      updated_at = now()
  where id = v_sender_wallet_id
    and current_balance >= v_pending_amount
  returning current_balance into v_remaining_balance;

  if not found then
    raise exception 'Wallet debit failed (insufficient balance during debit).';
  end if;

  -- Phase 4: Ledger transaction + entries (deterministic, idempotent).
  v_ledger_idempotency_key := 'standard-batch-run-' || p_batch_id::text;

  -- Ensure internal clearing wallet exists.
  insert into wallets (user_id, currency, current_balance, updated_at)
  values ('__system__', v_batch_currency, 0, now())
  on conflict (user_id, currency) do nothing;

  select id into v_system_wallet_id
  from wallets
  where user_id = '__system__'
    and currency = v_batch_currency
  for update;

  -- If a ledger transaction already exists for this batch run, skip re-posting.
  select id into v_ledger_transaction_id
  from ledger_transactions
  where idempotency_key = v_ledger_idempotency_key;

  if v_ledger_transaction_id is null then
    insert into ledger_transactions (reference_type, reference_id, status, idempotency_key)
    values ('batch_run', p_batch_id, 'posted', v_ledger_idempotency_key)
    returning id into v_ledger_transaction_id;

    -- Balanced double-entry: debit sender, credit system clearing wallet.
    insert into ledger_entries (transaction_id, wallet_id, amount, entry_type, reference_type, reference_id)
    values
      (v_ledger_transaction_id, v_sender_wallet_id, v_pending_amount, 'debit', 'batch_run', p_batch_id),
      (v_ledger_transaction_id, v_system_wallet_id, v_pending_amount, 'credit', 'batch_run', p_batch_id);
  end if;

  -- Payout trace rows for auditability (idempotent)
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
  on conflict (batch_item_id, status) do nothing;

  return jsonb_build_object(
    'ok', true,
    'success_count', v_success_count,
    'processed_item_count', v_processed_item_count,
    'debited_amount', v_pending_amount,
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
  v_system_user_id text := '__system__';

  v_retry_amount numeric(18,2) := 0;
  v_success_count int := 0;
  v_failed_count int := 0;
  v_success_amount numeric(18,2) := 0;
  v_failed_amount numeric(18,2) := 0;

  v_item record;
  v_should_fail boolean;
  v_failure_reason text;

  v_txn_id uuid;
  v_idempotency_key text;
  v_error_context text;
begin
  select * into v_batch from batches where id = p_batch_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Batch not found');
  end if;

  if v_batch.batch_type is distinct from 'standard' then
    return jsonb_build_object('ok', false, 'error', 'Batch is not standard');
  end if;

  -- Retry only makes sense when we previously had errors.
  if v_batch.status <> 'completed_with_errors' then
    if v_batch.status = 'completed' then
      return jsonb_build_object('ok', false, 'error', 'No failed items to retry');
    end if;
    -- Allow retry while still in-flight, but rely on item status selection.
  end if;

  v_currency := coalesce(v_batch.currency, 'GBP');
  v_funded_by := v_batch.funded_by_user_id;

  if v_funded_by is null or v_funded_by = '' then
    return jsonb_build_object('ok', false, 'error', 'Batch has no funder (funded_by_user_id required for ledger)');
  end if;

  -- Candidate items are the ones that are still failed.
  select
    coalesce(sum((amount)::numeric(18,2)), 0)
  into v_retry_amount
  from batch_items
  where batch_id = p_batch_id
    and status = 'failed';

  if v_retry_amount <= 0 then
    return jsonb_build_object('ok', false, 'error', 'No failed items to retry');
  end if;

  insert into wallets (user_id, currency, current_balance, updated_at)
  values (v_funded_by, v_currency, 0, now())
  on conflict (user_id, currency) do nothing;

  select id, current_balance into v_sender_wallet_id, v_sender_balance
  from wallets
  where user_id = v_funded_by and currency = v_currency
  for update;

  if v_sender_wallet_id is null then
    return jsonb_build_object('ok', false, 'error', 'Sender wallet not found');
  end if;

  -- Conservative wallet check.
  if v_sender_balance < v_retry_amount then
    return jsonb_build_object(
      'ok', false,
      'error',
      'Insufficient wallet balance. Available balance is ' || v_sender_balance::text ||
      ' but remaining failed amount is ' || v_retry_amount::text ||
      '. Add funds or reduce the amount.'
    );
  end if;

  insert into wallets (user_id, currency, current_balance, updated_at)
  values (v_system_user_id, v_currency, 0, now())
  on conflict (user_id, currency) do nothing;

  select id into v_system_wallet_id
  from wallets
  where user_id = v_system_user_id and currency = v_currency
  for update;

  for v_item in
    select id, (amount)::numeric(18,2) as amt, account_identifier
    from batch_items
    where batch_id = p_batch_id
      and status = 'failed'
    order by created_at
    for update
  loop
    -- ~50/50 retry success/failure, to match the existing JS behavior.
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

      insert into payouts (batch_id, recipient_user_id, wallet_id, amount, status, processed_at)
      values (
        p_batch_id,
        coalesce(v_item.account_identifier, 'UNKNOWN'),
        null,
        v_item.amt,
        'failed',
        now()
      );
    else
      update batch_items
      set status = 'success',
          failure_reason = null
      where id = v_item.id
        and batch_id = p_batch_id
        and status = 'failed';

      v_success_count := v_success_count + 1;
      v_success_amount := v_success_amount + v_item.amt;

      v_idempotency_key := 'standard-batch-item-payout-' || v_item.id::text;

      insert into ledger_transactions (reference_type, reference_id, status, idempotency_key)
      values ('batch_payout', p_batch_id, 'posted', v_idempotency_key)
      on conflict (idempotency_key) do nothing
      returning id into v_txn_id;

      if v_txn_id is not null then
        update wallets
        set current_balance = current_balance - v_item.amt,
            updated_at = now()
        where id = v_sender_wallet_id;

        insert into ledger_entries (transaction_id, wallet_id, amount, entry_type, reference_type, reference_id)
        values (v_txn_id, v_sender_wallet_id, v_item.amt, 'debit', 'batch_item', v_item.id);

        insert into ledger_entries (transaction_id, wallet_id, amount, entry_type, reference_type, reference_id)
        values (v_txn_id, v_system_wallet_id, v_item.amt, 'credit', 'batch_item', v_item.id);

        insert into payouts (batch_id, recipient_user_id, wallet_id, amount, status, processed_at)
        values (
          p_batch_id,
          coalesce(v_item.account_identifier, 'UNKNOWN'),
          v_system_wallet_id,
          v_item.amt,
          'completed',
          now()
        );
      end if;
    end if;
  end loop;

  -- Remaining failures = items that stayed failed.
  update batches
  set status = case when v_failed_count > 0 then 'completed_with_errors' else 'completed' end
  where id = p_batch_id;

  return jsonb_build_object(
    'ok', true,
    'final_status', case when v_failed_count > 0 then 'completed_with_errors' else 'completed' end,
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

