-- Process claimable batch payout in a single transaction: ledger, wallets, payouts, batch_claims, batch status.
-- Idempotency: idempotency_key = 'batch-payout-' || batch_id prevents double execution.

create or replace function process_claimable_batch_payout(p_batch_id uuid)
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
begin
  v_idempotency_key := 'batch-payout-' || p_batch_id;

  -- Lock batch and load
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

  -- Source of truth: batch_claims.claim_amount (locked saved amounts after Finalize allocations).
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

  -- Idempotency: try insert ledger_transaction
  insert into ledger_transactions (reference_type, reference_id, status, idempotency_key)
  values ('batch_payout', p_batch_id, 'posted', v_idempotency_key)
  on conflict (idempotency_key) do nothing
  returning id into v_txn_id;

  if v_txn_id is null then
    return jsonb_build_object('ok', false, 'error', 'Duplicate payout (idempotency)');
  end if;

  -- Sender wallet: get or create, lock, check balance (only if funded_by is set)
  if v_funded_by is not null and v_funded_by <> '' then
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

    if v_sender_balance < v_alloc_total then
      return jsonb_build_object('ok', false, 'error', 'Insufficient sender balance');
    end if;

    -- Debit exactly the sum of locked claim amounts (no recalculation).
    update wallets set current_balance = current_balance - v_alloc_total, updated_at = now()
    where id = v_sender_wallet_id;

    insert into ledger_entries (transaction_id, wallet_id, amount, entry_type)
    values (v_txn_id, v_sender_wallet_id, v_alloc_total, 'debit');
  end if;

  -- Process each claim using locked amount only (batch_claims.claim_amount); no equal-split recalculation.
  for v_claim in
    select id, user_id, (claim_amount)::numeric(18,2) as amt
    from batch_claims
    where batch_id = p_batch_id
    order by created_at
  loop
    -- Get or create recipient wallet
    insert into wallets (user_id, currency, current_balance, updated_at)
    values (v_claim.user_id, v_currency, 0, now())
    on conflict (user_id, currency) do nothing;

    select id into v_recipient_wallet_id from wallets where user_id = v_claim.user_id and currency = v_currency for update;

    update wallets set current_balance = current_balance + v_claim.amt, updated_at = now()
    where id = v_recipient_wallet_id;

    insert into ledger_entries (transaction_id, wallet_id, amount, entry_type)
    values (v_txn_id, v_recipient_wallet_id, v_claim.amt, 'credit');

    insert into payouts (batch_id, recipient_user_id, wallet_id, amount, status, processed_at)
    values (p_batch_id, v_claim.user_id, v_recipient_wallet_id, v_claim.amt, 'completed', now());

    update batch_claims
    set payout_status = 'paid', paid_at = now(), failure_reason = null
    where id = v_claim.id and batch_id = p_batch_id;
  end loop;

  update batches set status = 'completed' where id = p_batch_id;

  return jsonb_build_object('ok', true, 'transaction_id', v_txn_id, 'recipient_count', v_claim_count);
end;
$$;

comment on function process_claimable_batch_payout(uuid) is 'Runs in one transaction: debit sender wallet, credit recipient wallets, ledger entries, payouts, batch_claims, batch status. Idempotent via ledger_transactions.idempotency_key.';
