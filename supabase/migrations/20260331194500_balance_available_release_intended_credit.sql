-- Fix: pending → current release must use intended wallet credit from wallet_topup_release_queue,
-- capped only by that row's residual and the wallet's pending_balance — never Stripe's net
-- available-balance delta (fees already covered by the customer's processing uplift on the PI).

comment on table public.stripe_platform_gbp_checkpoint is
  'Reconciliation: last seen Stripe GBP available total (minor units). Not used to size user wallet releases.';

create or replace function public.apply_stripe_balance_available_release(
  p_stripe_event_id text,
  p_livemode boolean,
  p_new_available_gbp_minor bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_txn_id uuid;
  v_old_minor bigint;
  v_delta_minor bigint;
  v_released_total numeric(18,2) := 0;
  r record;
  v_residual numeric(18,2);
  v_wid uuid;
  v_pend numeric(18,2);
  v_take numeric(18,2);
begin
  if p_stripe_event_id is null or trim(p_stripe_event_id) = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_stripe_event_id');
  end if;

  if p_new_available_gbp_minor is null or p_new_available_gbp_minor < 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_new_available_minor');
  end if;

  insert into public.ledger_transactions (reference_type, reference_id, status, idempotency_key)
  values ('stripe_balance_available', null, 'posted', 'stripe-bal-avail-' || trim(p_stripe_event_id))
  on conflict (idempotency_key) do nothing
  returning id into v_txn_id;

  if v_txn_id is null then
    return jsonb_build_object('ok', true, 'duplicate_event', true, 'released_gbp', 0);
  end if;

  select c.available_gbp_minor
  into v_old_minor
  from public.stripe_platform_gbp_checkpoint c
  where c.livemode = p_livemode
  for update;

  if v_old_minor is null then
    insert into public.stripe_platform_gbp_checkpoint (livemode, available_gbp_minor, updated_at)
    values (p_livemode, p_new_available_gbp_minor, now());
    return jsonb_build_object(
      'ok', true,
      'released_gbp', 0,
      'reason', 'checkpoint_baseline',
      'ledger_transaction_id', v_txn_id,
      'new_available_gbp_minor', p_new_available_gbp_minor
    );
  end if;

  v_delta_minor := greatest(0::bigint, p_new_available_gbp_minor - v_old_minor);

  update public.stripe_platform_gbp_checkpoint
  set available_gbp_minor = p_new_available_gbp_minor,
      updated_at = now()
  where livemode = p_livemode;

  -- Release FIFO: each queue row's unreleased intended credit, up to wallet pending — independent of v_delta_minor.

  for r in
    select q.id, q.wallet_id, q.amount_gbp, q.released_to_current_gbp, q.consumed_by_payout_gbp
    from public.wallet_topup_release_queue q
    where (q.amount_gbp - q.released_to_current_gbp - q.consumed_by_payout_gbp) > 0.0001
    order by q.created_at
    for update of q
  loop
    v_residual := r.amount_gbp - r.released_to_current_gbp - r.consumed_by_payout_gbp;
    if v_residual <= 0 then
      continue;
    end if;

    select w.id, coalesce(w.pending_balance, 0)::numeric(18,2)
    into v_wid, v_pend
    from public.wallets w
    where w.id = r.wallet_id
    for update;

    if v_wid is null then
      continue;
    end if;

    v_take := least(v_residual, v_pend);
    if v_take <= 0 then
      continue;
    end if;

    update public.wallets
    set pending_balance = pending_balance - v_take,
        current_balance = current_balance + v_take,
        updated_at = now()
    where id = v_wid;

    update public.wallet_topup_release_queue
    set released_to_current_gbp = released_to_current_gbp + v_take
    where id = r.id;

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
      v_wid,
      v_take,
      'credit',
      'wallet_funding_release',
      v_wid
    );

    v_released_total := v_released_total + v_take;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'released_gbp', v_released_total,
    'delta_gbp_minor', v_delta_minor,
    'stripe_available_delta_gbp_minor', v_delta_minor,
    'stripe_available_gbp_minor', p_new_available_gbp_minor,
    'ledger_transaction_id', v_txn_id,
    'release_basis', 'wallet_topup_queue_and_pending_balance'
  );
end;
$$;

comment on function public.apply_stripe_balance_available_release(text, boolean, bigint) is
  'Idempotent per Stripe event. Records Stripe GBP available for reconciliation; moves pending→current using intended top-up queue amounts only (not Stripe net delta).';
