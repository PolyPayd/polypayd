-- Wallet dashboard: totals must use full ledger history with explicit reference_type rules,
-- not a sliding window of recent rows (which breaks when new settlement lines appear).

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
    'total_sent',
    coalesce(
      sum(le.amount) filter (
        where le.entry_type = 'debit'
          and lt.reference_type in (
            'batch_run',
            'batch_payout',
            'stripe_connect_withdrawal'
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
  'Total funded = credits on wallet_funding (intended top-up). Total sent = debits on batch_run, batch_payout, stripe_connect_withdrawal only. Ignores settlement reclass (wallet_funding_release), Stripe sync parents, platform fee lines on other wallets.';

grant execute on function public.wallet_dashboard_ledger_aggregates(uuid) to service_role;
