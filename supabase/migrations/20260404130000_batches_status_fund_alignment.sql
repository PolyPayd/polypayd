-- Align public.batches.status CHECK with Claim Link wallet funding.
--
-- Root issue: legacy deployments may allow only Bulk Send statuses (draft/ready/processing/completed/…)
-- but not `funded` or `claiming`. fund_batch_from_wallet then fails on:
--   update batches set status = 'funded' …
-- with check constraint batches_status_check.
--
-- Also tighten: only draft/ready/processing may enter the debit path (matches API + UI).

-- Default PostgreSQL name from older app schema; staging reported this exact name.
alter table public.batches drop constraint if exists batches_status_check;

alter table public.batches
  add constraint batches_status_check check (
    status in (
      'draft',
      'ready',
      'processing',
      'funded',
      'claiming',
      'completed',
      'completed_with_errors',
      'failed'
    )
  );

comment on constraint batches_status_check on public.batches is
  'Bulk Send + Claim Link lifecycle. funded/claiming are reserve-to-claim-link phases; completed* / failed end states.';

create or replace function public.fund_batch_from_wallet(
  p_batch_id uuid,
  p_actor_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.batches%rowtype;
  v_org_ok boolean;
  v_batch_status text;
  v_alloc_total numeric(18,2);
  v_claim_count int;
  v_total_amount numeric(18,2);
  v_currency text;
  v_funded_by text;
  v_sender_wallet_id uuid;
  v_sender_pending numeric(18,2);
  v_sender_current numeric(18,2);
  v_spendable numeric(18,2);
  v_from_pending numeric(18,2);
  v_from_current numeric(18,2);
  v_txn_id uuid;
  v_idempotency_key text;
  c_platform_fee_bps int := 150;
  v_platform_fee numeric(18,2) := 0;
  v_total_debit numeric(18,2) := 0;
  v_system_wallet_id uuid;
  v_platform_wallet_id uuid;
  v_impact_amount numeric(18,2) := 0;
  v_claim record;
  v_tok text;
begin
  if p_batch_id is null then
    return jsonb_build_object('ok', false, 'error', 'Missing batch id');
  end if;

  if p_actor_clerk_user_id is null or trim(p_actor_clerk_user_id) = '' then
    return jsonb_build_object('ok', false, 'error', 'Missing actor');
  end if;

  select exists(
    select 1
    from public.batches b
    inner join public.org_members om
      on om.org_id = b.org_id
      and om.clerk_user_id = trim(p_actor_clerk_user_id)
      and om.role in ('owner', 'operator')
    where b.id = p_batch_id
  )
  into v_org_ok;

  if not coalesce(v_org_ok, false) then
    return jsonb_build_object('ok', false, 'error', 'Batch not found or forbidden');
  end if;

  select * into v_batch from public.batches where id = p_batch_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Batch not found');
  end if;

  if v_batch.batch_type is distinct from 'claimable' then
    return jsonb_build_object('ok', false, 'error', 'Only claimable batches can be funded this way');
  end if;

  if v_batch.allocations_locked_at is null then
    return jsonb_build_object('ok', false, 'error', 'Allocations must be finalized before funding');
  end if;

  v_funded_by := trim(coalesce(v_batch.funded_by_user_id, ''));
  if v_funded_by = '' then
    return jsonb_build_object('ok', false, 'error', 'Batch has no funder on record');
  end if;

  if v_funded_by is distinct from trim(p_actor_clerk_user_id) then
    return jsonb_build_object('ok', false, 'error', 'Only the batch funder can fund from wallet');
  end if;

  v_idempotency_key := 'batch-fund-' || p_batch_id::text;

  select id into v_txn_id
  from public.ledger_transactions
  where idempotency_key = v_idempotency_key
  limit 1;

  if v_txn_id is not null then
    return jsonb_build_object(
      'ok', true,
      'already_funded', true,
      'ledger_transaction_id', v_txn_id,
      'batch_id', p_batch_id
    );
  end if;

  v_batch_status := lower(trim(coalesce(v_batch.status, '')));

  if v_batch_status in ('completed', 'completed_with_errors') then
    return jsonb_build_object('ok', false, 'error', 'Batch is not in a fundable state');
  end if;

  if v_batch_status in ('funded', 'claiming') then
    return jsonb_build_object(
      'ok', false,
      'error',
      'Batch is marked funded but no fund ledger was found; contact support with the batch ID.'
    );
  end if;

  if v_batch_status not in ('draft', 'ready', 'processing') then
    return jsonb_build_object('ok', false, 'error', 'Batch is not in a fundable state');
  end if;

  v_total_amount := coalesce(v_batch.total_amount, 0)::numeric(18,2);
  v_currency := coalesce(v_batch.currency, 'GBP');

  select coalesce(sum((claim_amount)::numeric(18,2)), 0), count(*)
  into v_alloc_total, v_claim_count
  from public.batch_claims
  where batch_id = p_batch_id;

  if v_claim_count = 0 then
    return jsonb_build_object('ok', false, 'error', 'No recipients to fund');
  end if;

  if exists (
    select 1 from public.batch_claims
    where batch_id = p_batch_id and (claim_amount is null or claim_amount < 0)
  ) then
    return jsonb_build_object('ok', false, 'error', 'Invalid claim_amount on one or more recipients');
  end if;

  if abs(v_alloc_total - v_total_amount) > 0.01 then
    return jsonb_build_object('ok', false, 'error', 'Total allocations do not match batch amount');
  end if;

  v_platform_fee := round(v_alloc_total * c_platform_fee_bps / 10000.0, 2);
  v_total_debit := v_alloc_total + v_platform_fee;
  v_impact_amount := round(v_platform_fee * 0.01, 2);

  insert into public.ledger_transactions (
    reference_type, reference_id, status, idempotency_key, platform_fee, fee_bps
  )
  values (
    'batch_funded', p_batch_id, 'posted', v_idempotency_key, v_platform_fee, c_platform_fee_bps
  )
  returning id into v_txn_id;

  insert into public.wallets (user_id, currency, current_balance, pending_balance, updated_at)
  values (v_funded_by, v_currency, 0, 0, now())
  on conflict (user_id, currency) do nothing;

  select id,
         coalesce(pending_balance, 0)::numeric(18,2),
         coalesce(current_balance, 0)::numeric(18,2)
  into v_sender_wallet_id, v_sender_pending, v_sender_current
  from public.wallets
  where user_id = v_funded_by and currency = v_currency
  for update;

  if v_sender_wallet_id is null then
    raise exception 'Sender wallet not found';
  end if;

  v_spendable := v_sender_pending + v_sender_current;
  if v_spendable < v_total_debit then
    raise exception 'Insufficient wallet balance for batch fund (principal + platform fee)';
  end if;

  v_from_pending := least(v_sender_pending, v_total_debit);
  v_from_current := v_total_debit - v_from_pending;

  perform public.consume_wallet_topup_release_queue_for_debit(v_sender_wallet_id, v_from_pending);

  update public.wallets
  set pending_balance = pending_balance - v_from_pending,
      current_balance = current_balance - v_from_current,
      updated_at = now()
  where id = v_sender_wallet_id;

  insert into public.wallets (user_id, currency, current_balance, pending_balance, updated_at)
  values ('__system__', v_currency, 0, 0, now())
  on conflict (user_id, currency) do nothing;

  select id into v_system_wallet_id
  from public.wallets
  where user_id = '__system__' and currency = v_currency
  for update;

  if v_system_wallet_id is null then
    raise exception 'System wallet not found';
  end if;

  update public.wallets
  set pending_balance = pending_balance + v_alloc_total,
      updated_at = now()
  where id = v_system_wallet_id;

  insert into public.ledger_entries (
    transaction_id, wallet_id, amount, entry_type, reference_type, reference_id
  )
  values (
    v_txn_id, v_sender_wallet_id, v_total_debit, 'debit', 'batch_funded', p_batch_id
  ),
  (
    v_txn_id, v_system_wallet_id, v_alloc_total, 'credit', 'batch_funded', p_batch_id
  );

  if v_platform_fee > 0 then
    insert into public.wallets (user_id, currency, current_balance, pending_balance, updated_at)
    values ('__platform__', v_currency, 0, 0, now())
    on conflict (user_id, currency) do nothing;

    select id into v_platform_wallet_id
    from public.wallets
    where user_id = '__platform__' and currency = v_currency
    for update;

    update public.wallets
    set pending_balance = pending_balance + v_platform_fee,
        updated_at = now()
    where id = v_platform_wallet_id;

    insert into public.ledger_entries (
      transaction_id, wallet_id, amount, entry_type, reference_type, reference_id
    )
    values (
      v_txn_id, v_platform_wallet_id, v_platform_fee, 'credit', 'fee_charged', p_batch_id
    );

    perform public.apply_impact_from_platform_fee(v_txn_id, v_platform_fee, v_currency);
  end if;

  update public.batches
  set status = 'funded',
      updated_at = now()
  where id = p_batch_id;

  for v_claim in
    select id from public.batch_claims where batch_id = p_batch_id order by created_at
  loop
    v_tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    update public.batch_claims
    set claim_token = v_tok,
        recipient_lifecycle_status = 'claimable'
    where id = v_claim.id
      and batch_id = p_batch_id;
  end loop;

  insert into public.audit_events (
    org_id, batch_id, actor_user_id, event_type, event_data
  )
  values (
    v_batch.org_id,
    p_batch_id,
    trim(p_actor_clerk_user_id),
    'batch_funded',
    jsonb_build_object(
      'ledger_transaction_id', v_txn_id,
      'alloc_total', v_alloc_total,
      'platform_fee', v_platform_fee,
      'fee_bps', c_platform_fee_bps,
      'currency', v_currency,
      'recipient_count', v_claim_count,
      'impact_amount', v_impact_amount
    )
  );

  return jsonb_build_object(
    'ok', true,
    'already_funded', false,
    'ledger_transaction_id', v_txn_id,
    'batch_id', p_batch_id,
    'platform_fee', v_platform_fee,
    'fee_bps', c_platform_fee_bps,
    'impact_amount', v_impact_amount,
    'recipient_count', v_claim_count
  );
end;
$$;

comment on function public.fund_batch_from_wallet(uuid, text) is
  'Debits funder wallet, moves principal to __system__ reserved liability, platform fee to __platform__. Idempotent via ledger idempotency_key batch-fund-<batch_id>. Allowed batch statuses before fund: draft, ready, processing.';

grant execute on function public.fund_batch_from_wallet(uuid, text) to service_role;
