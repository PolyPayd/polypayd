-- Joined (matched) batch_claims: instant wallet credit when the sender funds/unlocks the batch.
-- Unmatched rows (no user_id): issue claim_token + claimable only.
-- Fixes regression where fund_batch_from_wallet set claim_token on everyone, so wallets were not
-- credited until a redundant claim step.

-- ---------------------------------------------------------------------------
-- Refresh batch status from per-recipient claimable count (shared by fund + claim RPCs)
-- ---------------------------------------------------------------------------

create or replace function public.refresh_claimable_batch_status_after_claim(p_batch_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_open int;
begin
  select count(*) into v_open
  from public.batch_claims
  where batch_id = p_batch_id
    and recipient_lifecycle_status = 'claimable';

  if v_open = 0 then
    update public.batches
    set status = 'completed',
        updated_at = now()
    where id = p_batch_id;
  else
    update public.batches
    set status = 'claiming',
        updated_at = now()
    where id = p_batch_id
      and lower(trim(coalesce(status, ''))) = 'funded';
  end if;

  return v_open;
end;
$$;

comment on function public.refresh_claimable_batch_status_after_claim(uuid) is
  'Sets batches.status to completed when no claimable rows remain, else claiming when still funded.';

grant execute on function public.refresh_claimable_batch_status_after_claim(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Core wallet credit from __system__ reserved liability (no batch status side effects)
-- ---------------------------------------------------------------------------

create or replace function public.complete_joined_batch_claim_wallet_credit(p_batch_claim_id uuid)
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
  v_currency text;
  v_has_recipient_credit boolean;
  v_actor text;
begin
  if p_batch_claim_id is null then
    return jsonb_build_object('ok', false, 'error', 'Missing batch claim id');
  end if;

  select
    bc.id,
    bc.batch_id,
    bc.user_id,
    bc.claim_amount,
    bc.recipient_lifecycle_status
  into v_bc
  from public.batch_claims bc
  where bc.id = p_batch_claim_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Batch claim not found');
  end if;

  v_actor := trim(coalesce(v_bc.user_id, ''));
  if v_actor = '' then
    return jsonb_build_object('ok', false, 'error', 'Recipient is not linked to a PolyPayd user');
  end if;

  select id, org_id, status, currency
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
  values (v_actor, v_currency, 0, 0, now())
  on conflict (user_id, currency) do nothing;

  select id into v_recipient_wallet_id
  from public.wallets
  where user_id = v_actor and currency = v_currency;

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
     and v_bc.recipient_lifecycle_status is distinct from 'pending'
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
        and p.recipient_user_id = v_actor
        and p.status = 'completed'
    ) then
      insert into public.payouts (
        batch_id, recipient_user_id, wallet_id, amount, status, processed_at
      )
      values (
        v_bc.batch_id,
        v_actor,
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
      failure_reason = null,
      claim_token = null
    where id = v_bc.id
      and batch_id = v_bc.batch_id;

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

  select id into v_system_wallet_id
  from public.wallets
  where user_id = '__system__' and currency = v_currency
  for update;

  if v_system_wallet_id is null then
    return jsonb_build_object('ok', false, 'error', 'System wallet not found');
  end if;

  if coalesce((
    select pending_balance from public.wallets where id = v_system_wallet_id
  ), 0)::numeric(18,2) < v_amt then
    return jsonb_build_object('ok', false, 'error', 'Reserved batch funds insufficient (system wallet)');
  end if;

  update public.wallets
  set pending_balance = pending_balance - v_amt,
      updated_at = now()
  where id = v_system_wallet_id;

  select id into v_recipient_wallet_id
  from public.wallets
  where user_id = v_actor and currency = v_currency
  for update;

  if v_recipient_wallet_id is null then
    return jsonb_build_object('ok', false, 'error', 'Recipient wallet not found');
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
    v_actor,
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
    failure_reason = null,
    claim_token = null
  where id = v_bc.id
    and batch_id = v_bc.batch_id;

  insert into public.audit_events (
    org_id, batch_id, actor_user_id, event_type, event_data
  )
  values (
    v_batch.org_id,
    v_bc.batch_id,
    v_actor,
    'claim_completed',
    jsonb_build_object(
      'batch_claim_id', v_bc.id,
      'wallet_id', v_recipient_wallet_id,
      'amount', v_amt,
      'currency', v_currency,
      'ledger_transaction_id', v_txn_id,
      'credited_to', 'current_balance',
      'source', 'joined_auto_credit'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'claim_status', 'claimed',
    'batch_claim_id', v_bc.id,
    'wallet_id', v_recipient_wallet_id,
    'credited_amount', v_amt,
    'currency', v_currency,
    'ledger_transaction_id', v_txn_id
  );
end;
$$;

comment on function public.complete_joined_batch_claim_wallet_credit(uuid) is
  'Idempotent: credits joined recipient from __system__ pending reserve. Clears claim_token. Does not update batches.status.';

grant execute on function public.complete_joined_batch_claim_wallet_credit(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- claim_batch_recipient: delegate credit to complete_joined_* + shared status refresh
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
  v_credit jsonb;
  v_open int;
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

  if v_bc.recipient_lifecycle_status is distinct from 'claimable'
     and v_bc.recipient_lifecycle_status is distinct from 'claimed' then
    return jsonb_build_object('ok', false, 'error', 'Claim is not available for this recipient');
  end if;

  v_credit := public.complete_joined_batch_claim_wallet_credit(v_bc.id);

  if coalesce(v_credit->>'ok', 'false') <> 'true' then
    return v_credit;
  end if;

  v_open := public.refresh_claimable_batch_status_after_claim(v_bc.batch_id);

  return v_credit || jsonb_build_object('batch_completed', v_open = 0);
end;
$$;

comment on function public.claim_batch_recipient(text, text) is
  'Token-based claim: credits recipient current_balance from __system__ reserved liability. Joined auto-credit uses the same core function.';

-- ---------------------------------------------------------------------------
-- fund_batch_from_wallet: tokens only for unmatched; instant credit for joined
-- ---------------------------------------------------------------------------

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
  v_cred jsonb;
  v_open int;
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
    v_batch_status := lower(trim(coalesce(v_batch.status, '')));
    if v_batch_status not in ('funded', 'claiming', 'completed') then
      return jsonb_build_object(
        'ok', false,
        'error',
        'Fund ledger exists but batch is not in a claimable state; contact support.'
      );
    end if;

    if not exists (
      select 1
      from public.ledger_entries le
      join public.wallets w on w.id = le.wallet_id
      where le.transaction_id = v_txn_id
        and le.entry_type = 'debit'
        and w.user_id = v_funded_by
    ) then
      return jsonb_build_object(
        'ok', false,
        'error',
        'Fund ledger is missing sender debit entries; contact support.'
      );
    end if;

    if exists (
      select 1
      from public.batch_claims bc
      where bc.batch_id = p_batch_id
        and trim(coalesce(bc.user_id, '')) <> ''
        and bc.recipient_lifecycle_status is distinct from 'claimed'
    ) then
      for v_claim in
        select id
        from public.batch_claims
        where batch_id = p_batch_id
          and trim(coalesce(user_id, '')) <> ''
          and recipient_lifecycle_status is distinct from 'claimed'
        order by created_at
      loop
        v_cred := public.complete_joined_batch_claim_wallet_credit(v_claim.id);
        if coalesce(v_cred->>'ok', 'false') <> 'true' then
          return jsonb_build_object(
            'ok', false,
            'error',
            format('Fund repair: could not credit joined recipient: %s', v_cred->>'error')
          );
        end if;
      end loop;
    end if;

    if exists (
      select 1
      from public.batch_claims bc
      where bc.batch_id = p_batch_id
        and trim(coalesce(bc.user_id, '')) = ''
        and (bc.claim_token is null or trim(bc.claim_token) = '')
    ) then
      for v_claim in
        select id
        from public.batch_claims
        where batch_id = p_batch_id
          and trim(coalesce(user_id, '')) = ''
          and (claim_token is null or trim(claim_token) = '')
        order by created_at
      loop
        v_tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
        update public.batch_claims
        set claim_token = v_tok,
            recipient_lifecycle_status = 'claimable'
        where id = v_claim.id
          and batch_id = p_batch_id;
      end loop;
    end if;

    select count(*) into v_open
    from public.batch_claims
    where batch_id = p_batch_id
      and recipient_lifecycle_status = 'claimable';

    if v_open = 0 then
      update public.batches
      set status = 'completed',
          updated_at = now()
      where id = p_batch_id;
    else
      update public.batches
      set status = 'claiming',
          updated_at = now()
      where id = p_batch_id;
    end if;

    if exists (
      select 1
      from public.batch_claims bc
      where bc.batch_id = p_batch_id
        and trim(coalesce(bc.user_id, '')) <> ''
        and bc.recipient_lifecycle_status is distinct from 'claimed'
    ) then
      return jsonb_build_object(
        'ok', false,
        'error',
        'Fund ledger exists but joined recipients are not fully credited; contact support.'
      );
    end if;

    if exists (
      select 1
      from public.batch_claims bc
      where bc.batch_id = p_batch_id
        and trim(coalesce(bc.user_id, '')) = ''
        and (bc.claim_token is null or trim(bc.claim_token) = '')
    ) then
      return jsonb_build_object(
        'ok', false,
        'error',
        'Fund ledger exists but claim links are missing for open slots; contact support.'
      );
    end if;

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
    select id
    from public.batch_claims
    where batch_id = p_batch_id
      and (user_id is null or trim(user_id) = '')
    order by created_at
  loop
    v_tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    update public.batch_claims
    set claim_token = v_tok,
        recipient_lifecycle_status = 'claimable'
    where id = v_claim.id
      and batch_id = p_batch_id;
  end loop;

  for v_claim in
    select id
    from public.batch_claims
    where batch_id = p_batch_id
      and user_id is not null
      and trim(user_id) <> ''
    order by created_at
  loop
    v_cred := public.complete_joined_batch_claim_wallet_credit(v_claim.id);
    if coalesce(v_cred->>'ok', 'false') <> 'true' then
      raise exception 'Joined auto-credit failed: %', v_cred->>'error';
    end if;
  end loop;

  select count(*) into v_open
  from public.batch_claims
  where batch_id = p_batch_id
    and recipient_lifecycle_status = 'claimable';

  if v_open = 0 then
    update public.batches
    set status = 'completed',
        updated_at = now()
    where id = p_batch_id;
  else
    update public.batches
    set status = 'claiming',
        updated_at = now()
    where id = p_batch_id;
  end if;

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
  'Debits funder wallet, reserves principal on __system__, fee to __platform__. Joined recipients are credited immediately; only unmatched rows get claim_token. Idempotent with self-heal for legacy all-token rows.';

grant execute on function public.fund_batch_from_wallet(uuid, text) to service_role;
