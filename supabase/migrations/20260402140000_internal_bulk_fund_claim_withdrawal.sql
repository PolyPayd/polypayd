-- Internal bulk payout: fund batch → per-recipient claim → wallet withdrawal lifecycle.
-- Also: wallet_withdrawal_executions + RPCs (debit-before-Stripe), top-up audit/metadata columns on apply_stripe_wallet_topup,
-- batch_claims lifecycle + claim_token, and guard on legacy process_claimable_batch_payout when batch is funded.

-- ---------------------------------------------------------------------------
-- batch_claims: secure claim links + recipient lifecycle (alias for "batch_recipients")
-- ---------------------------------------------------------------------------

alter table public.batch_claims
  add column if not exists claim_token text null;

create unique index if not exists batch_claims_claim_token_key
  on public.batch_claims (claim_token)
  where claim_token is not null;

alter table public.batch_claims
  add column if not exists recipient_lifecycle_status text;

update public.batch_claims
set recipient_lifecycle_status = case
  when coalesce(recipient_lifecycle_status, '') <> '' then recipient_lifecycle_status
  when payout_status = 'paid' then 'claimed'
  when payout_status = 'failed' then 'failed'
  else 'pending'
end
where recipient_lifecycle_status is null;

alter table public.batch_claims
  alter column recipient_lifecycle_status set default 'pending';

update public.batch_claims
set recipient_lifecycle_status = 'pending'
where recipient_lifecycle_status is null;

alter table public.batch_claims
  alter column recipient_lifecycle_status set not null;

alter table public.batch_claims
  drop constraint if exists batch_claims_recipient_lifecycle_status_check;

alter table public.batch_claims
  add constraint batch_claims_recipient_lifecycle_status_check
  check (
    recipient_lifecycle_status in (
      'pending',
      'claimable',
      'claimed',
      'paid_out',
      'failed',
      'cancelled'
    )
  );

comment on column public.batch_claims.claim_token is
  'Opaque secret for POST /api/claims/[token]/claim; issued when batch is funded.';

comment on column public.batch_claims.recipient_lifecycle_status is
  'pending | claimable | claimed | paid_out | failed | cancelled';

-- ---------------------------------------------------------------------------
-- wallet_withdrawal_executions (pending → processing → completed | failed)
-- ---------------------------------------------------------------------------

create table if not exists public.wallet_withdrawal_executions (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  user_id text not null,
  wallet_id uuid not null references public.wallets (id) on delete restrict,
  requested_amount_minor bigint not null check (requested_amount_minor > 0),
  fee_minor bigint not null default 0 check (fee_minor >= 0),
  total_debit_minor bigint not null check (total_debit_minor > 0),
  net_payout_minor bigint not null check (net_payout_minor > 0),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  create_ledger_transaction_id uuid references public.ledger_transactions (id) on delete restrict,
  stripe_payout_id text null,
  failure_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wallet_withdrawal_executions_user_id_idx
  on public.wallet_withdrawal_executions (user_id);

create index if not exists wallet_withdrawal_executions_status_idx
  on public.wallet_withdrawal_executions (status);

comment on table public.wallet_withdrawal_executions is
  'Connect withdrawal: wallet debited at create; Stripe payout then complete_withdrawal or fail_withdrawal_and_refund.';

alter table public.batches add column if not exists updated_at timestamptz;

-- ---------------------------------------------------------------------------
-- apply_stripe_wallet_topup: optional platform vs Stripe cost split in audit
-- ---------------------------------------------------------------------------

drop function if exists public.apply_stripe_wallet_topup(
  text, text, uuid, text, uuid, bigint, text, text, boolean, bigint, bigint, boolean
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
  p_immediate_release boolean default false,
  p_platform_fee_minor bigint default null,
  p_stripe_cost_estimate_minor bigint default null
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
  v_platform_fee_audit bigint;
  v_stripe_cost_audit bigint;
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

  v_platform_fee_audit := coalesce(p_platform_fee_minor, 0);
  v_stripe_cost_audit := coalesce(p_stripe_cost_estimate_minor, p_processing_fee_minor);

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
    'wallet_topup_credited',
    jsonb_build_object(
      'provider', 'stripe',
      'logical_type', 'wallet_topup',
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
      'platform_fee_minor', v_platform_fee_audit,
      'stripe_cost_estimate_minor', v_stripe_cost_audit,
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
  text, text, uuid, text, uuid, bigint, text, text, boolean, bigint, bigint, boolean, bigint, bigint
) is
  'Idempotent wallet top-up (wallet_funding ledger). Audit includes wallet_topup logical type + platform vs Stripe cost metadata.';

grant execute on function public.apply_stripe_wallet_topup(
  text, text, uuid, text, uuid, bigint, text, text, boolean, bigint, bigint, boolean, bigint, bigint
)
to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- fund_batch_from_wallet
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
  'Debits funder wallet, moves principal to __system__ reserved liability, platform fee to __platform__. Idempotent via ledger idempotency_key batch-fund-<batch_id>.';

grant execute on function public.fund_batch_from_wallet(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- claim_batch_recipient
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
  'Credits recipient current_balance (available) from __system__ liability. Idempotent via claim-completed-<batch_claim_id>.';

grant execute on function public.claim_batch_recipient(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- create_withdrawal_from_wallet
-- ---------------------------------------------------------------------------

create or replace function public.create_withdrawal_from_wallet(
  p_idempotency_key text,
  p_user_id text,
  p_wallet_id uuid,
  p_total_debit_minor bigint,
  p_fee_minor bigint,
  p_requested_amount_minor bigint,
  p_net_payout_minor bigint
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
  v_total numeric(18,2);
  v_fee numeric(18,2);
  v_platform_wallet_id uuid;
  v_row public.wallet_withdrawal_executions%rowtype;
begin
  if p_idempotency_key is null or trim(p_idempotency_key) = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_idempotency_key');
  end if;

  if p_user_id is null or trim(p_user_id) = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_user_id');
  end if;

  if p_total_debit_minor is null or p_total_debit_minor <= 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_total_debit_minor');
  end if;

  if coalesce(p_fee_minor, 0) < 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_fee_minor');
  end if;

  if p_requested_amount_minor is null or p_requested_amount_minor <= 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_requested_amount_minor');
  end if;

  if p_net_payout_minor is null or p_net_payout_minor <= 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_net_payout_minor');
  end if;

  select * into v_row
  from public.wallet_withdrawal_executions
  where idempotency_key = trim(p_idempotency_key);

  if found then
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'execution_id', v_row.id,
      'ledger_transaction_id', v_row.create_ledger_transaction_id,
      'status', v_row.status,
      'total_debit_minor', v_row.total_debit_minor,
      'fee_minor', v_row.fee_minor,
      'net_payout_minor', v_row.net_payout_minor,
      'requested_amount_minor', v_row.requested_amount_minor
    );
  end if;

  v_total := round((p_total_debit_minor::numeric / 100.0), 2);
  v_fee := round((coalesce(p_fee_minor, 0)::numeric / 100.0), 2);
  v_ledger_key := 'withdrawal-created-' || trim(p_idempotency_key);

  insert into public.ledger_transactions (
    reference_type,
    reference_id,
    status,
    idempotency_key
  )
  values (
    'withdrawal_created',
    p_wallet_id,
    'posted',
    v_ledger_key
  )
  on conflict (idempotency_key) do nothing
  returning id into v_txn_id;

  if v_txn_id is null then
    return jsonb_build_object('ok', false, 'error', 'ledger_idempotency_conflict');
  end if;

  select id, user_id, currency, current_balance
  into v_wallet
  from public.wallets
  where id = p_wallet_id
  for update;

  if v_wallet.id is null then
    raise exception 'Wallet not found';
  end if;

  if v_wallet.user_id is distinct from trim(p_user_id) then
    raise exception 'Wallet ownership mismatch';
  end if;

  if upper(coalesce(v_wallet.currency, '')) <> 'GBP' then
    raise exception 'Only GBP withdrawals supported';
  end if;

  update public.wallets
  set current_balance = current_balance - v_total,
      updated_at = now()
  where id = p_wallet_id
    and coalesce(current_balance, 0)::numeric(18,2) >= v_total;

  if not found then
    raise exception 'Insufficient available balance for withdrawal';
  end if;

  insert into public.ledger_entries (
    transaction_id, wallet_id, amount, entry_type, reference_type, reference_id
  )
  values (
    v_txn_id, p_wallet_id, v_total, 'debit', 'withdrawal_created', p_wallet_id
  );

  if coalesce(p_fee_minor, 0) > 0 then
    insert into public.wallets (user_id, currency, current_balance, pending_balance, updated_at)
    values ('__platform__', 'GBP', 0, 0, now())
    on conflict (user_id, currency) do nothing;

    select id into v_platform_wallet_id
    from public.wallets
    where user_id = '__platform__' and currency = 'GBP'
    for update;

    update public.wallets
    set pending_balance = pending_balance + v_fee,
        updated_at = now()
    where id = v_platform_wallet_id;

    insert into public.ledger_entries (
      transaction_id, wallet_id, amount, entry_type, reference_type, reference_id
    )
    values (
      v_txn_id, v_platform_wallet_id, v_fee, 'credit', 'fee_charged', p_wallet_id
    );
  end if;

  insert into public.wallet_withdrawal_executions (
    idempotency_key,
    user_id,
    wallet_id,
    requested_amount_minor,
    fee_minor,
    total_debit_minor,
    net_payout_minor,
    status,
    create_ledger_transaction_id
  )
  values (
    trim(p_idempotency_key),
    trim(p_user_id),
    p_wallet_id,
    p_requested_amount_minor,
    coalesce(p_fee_minor, 0),
    p_total_debit_minor,
    p_net_payout_minor,
    'pending',
    v_txn_id
  )
  returning * into v_row;

  insert into public.audit_events (
    org_id, batch_id, actor_user_id, event_type, event_data
  )
  values (
    null,
    null,
    trim(p_user_id),
    'withdrawal_created',
    jsonb_build_object(
      'execution_id', v_row.id,
      'wallet_id', p_wallet_id,
      'idempotency_key', trim(p_idempotency_key),
      'requested_amount_minor', p_requested_amount_minor,
      'fee_minor', coalesce(p_fee_minor, 0),
      'total_debit_minor', p_total_debit_minor,
      'net_payout_minor', p_net_payout_minor,
      'ledger_transaction_id', v_txn_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'execution_id', v_row.id,
    'ledger_transaction_id', v_txn_id,
    'status', v_row.status,
    'total_debit_minor', v_row.total_debit_minor,
    'fee_minor', v_row.fee_minor,
    'net_payout_minor', v_row.net_payout_minor,
    'requested_amount_minor', v_row.requested_amount_minor
  );
end;
$$;

grant execute on function public.create_withdrawal_from_wallet(
  text, text, uuid, bigint, bigint, bigint, bigint
) to service_role;

-- ---------------------------------------------------------------------------
-- complete_withdrawal
-- ---------------------------------------------------------------------------

create or replace function public.complete_withdrawal(
  p_idempotency_key text,
  p_stripe_payout_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.wallet_withdrawal_executions%rowtype;
begin
  if p_idempotency_key is null or trim(p_idempotency_key) = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_idempotency_key');
  end if;

  if p_stripe_payout_id is null or trim(p_stripe_payout_id) = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_stripe_payout_id');
  end if;

  select * into v_row
  from public.wallet_withdrawal_executions
  where idempotency_key = trim(p_idempotency_key)
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'withdrawal_not_found');
  end if;

  if v_row.status = 'completed' then
    if coalesce(v_row.stripe_payout_id, '') = trim(p_stripe_payout_id) then
      return jsonb_build_object('ok', true, 'duplicate', true, 'execution_id', v_row.id);
    end if;
    return jsonb_build_object('ok', false, 'error', 'payout_id_mismatch');
  end if;

  if v_row.status = 'failed' then
    return jsonb_build_object('ok', false, 'error', 'withdrawal_already_failed');
  end if;

  update public.wallet_withdrawal_executions
  set
    status = 'completed',
    stripe_payout_id = trim(p_stripe_payout_id),
    updated_at = now()
  where id = v_row.id;

  insert into public.audit_events (
    org_id, batch_id, actor_user_id, event_type, event_data
  )
  values (
    null,
    null,
    v_row.user_id,
    'withdrawal_completed',
    jsonb_build_object(
      'execution_id', v_row.id,
      'idempotency_key', trim(p_idempotency_key),
      'stripe_payout_id', trim(p_stripe_payout_id),
      'wallet_id', v_row.wallet_id,
      'net_payout_minor', v_row.net_payout_minor
    )
  );

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'execution_id', v_row.id
  );
end;
$$;

grant execute on function public.complete_withdrawal(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- fail_withdrawal_and_refund
-- ---------------------------------------------------------------------------

create or replace function public.fail_withdrawal_and_refund(
  p_idempotency_key text,
  p_failure_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.wallet_withdrawal_executions%rowtype;
  v_refund_txn uuid;
  v_refund_key text;
  v_total numeric(18,2);
  v_fee numeric(18,2);
  v_platform_wallet_id uuid;
begin
  if p_idempotency_key is null or trim(p_idempotency_key) = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_idempotency_key');
  end if;

  select * into v_row
  from public.wallet_withdrawal_executions
  where idempotency_key = trim(p_idempotency_key)
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'withdrawal_not_found');
  end if;

  if v_row.status = 'failed' then
    return jsonb_build_object('ok', true, 'duplicate', true, 'execution_id', v_row.id);
  end if;

  if v_row.status = 'completed' then
    return jsonb_build_object('ok', false, 'error', 'withdrawal_already_completed');
  end if;

  v_refund_key := 'withdrawal-refund-' || trim(p_idempotency_key);

  insert into public.ledger_transactions (
    reference_type, reference_id, status, idempotency_key
  )
  values (
    'refund_posted',
    v_row.wallet_id,
    'posted',
    v_refund_key
  )
  on conflict (idempotency_key) do nothing
  returning id into v_refund_txn;

  if v_refund_txn is null then
    select id into v_refund_txn
    from public.ledger_transactions
    where idempotency_key = v_refund_key
    limit 1;

    update public.wallet_withdrawal_executions
    set
      status = 'failed',
      failure_reason = coalesce(nullif(trim(p_failure_reason), ''), failure_reason),
      updated_at = now()
    where id = v_row.id
      and status is distinct from 'failed';

    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'execution_id', v_row.id,
      'refund_ledger_transaction_id', v_refund_txn
    );
  end if;

  v_total := round((v_row.total_debit_minor::numeric / 100.0), 2);
  v_fee := round((coalesce(v_row.fee_minor, 0)::numeric / 100.0), 2);

  update public.wallets
  set current_balance = current_balance + v_total,
      updated_at = now()
  where id = v_row.wallet_id;

  insert into public.ledger_entries (
    transaction_id, wallet_id, amount, entry_type, reference_type, reference_id
  )
  values (
    v_refund_txn, v_row.wallet_id, v_total, 'credit', 'refund_posted', v_row.wallet_id
  );

  if v_fee > 0.0001 then
    select id into v_platform_wallet_id
    from public.wallets
    where user_id = '__platform__' and currency = 'GBP'
    for update;

    if v_platform_wallet_id is not null then
      update public.wallets
      set pending_balance = pending_balance - v_fee,
          updated_at = now()
      where id = v_platform_wallet_id
        and coalesce(pending_balance, 0)::numeric(18,2) >= v_fee;

      insert into public.ledger_entries (
        transaction_id, wallet_id, amount, entry_type, reference_type, reference_id
      )
      values (
        v_refund_txn, v_platform_wallet_id, v_fee, 'debit', 'fee_charged', v_row.wallet_id
      );
    end if;
  end if;

  update public.wallet_withdrawal_executions
  set
    status = 'failed',
    failure_reason = nullif(trim(p_failure_reason), ''),
    updated_at = now()
  where id = v_row.id;

  insert into public.audit_events (
    org_id, batch_id, actor_user_id, event_type, event_data
  )
  values (
    null,
    null,
    v_row.user_id,
    'withdrawal_failed',
    jsonb_build_object(
      'execution_id', v_row.id,
      'idempotency_key', trim(p_idempotency_key),
      'reason', nullif(trim(p_failure_reason), ''),
      'refund_ledger_transaction_id', v_refund_txn,
      'wallet_id', v_row.wallet_id,
      'refunded_total_debit_minor', v_row.total_debit_minor
    )
  );

  insert into public.audit_events (
    org_id, batch_id, actor_user_id, event_type, event_data
  )
  values (
    null,
    null,
    v_row.user_id,
    'withdrawal_refunded',
    jsonb_build_object(
      'execution_id', v_row.id,
      'idempotency_key', trim(p_idempotency_key),
      'refund_ledger_transaction_id', v_refund_txn,
      'wallet_id', v_row.wallet_id,
      'amount_minor', v_row.total_debit_minor
    )
  );

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'execution_id', v_row.id,
    'refund_ledger_transaction_id', v_refund_txn
  );
end;
$$;

grant execute on function public.fail_withdrawal_and_refund(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Legacy batch payout guard (funded / claiming batches use per-claim flow)
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
