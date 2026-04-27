-- Claim Link payout: debit sender from pending_balance first, then current_balance.
-- Fixes production where funds may live in one bucket while an older RPC only read the other,
-- and aligns with top-ups (pending) plus any legacy/current_balance-only balance.

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
