-- Seed the two static platform-level ledger accounts.
-- UUIDs are fixed so they can be referenced in env vars or constants.
--   fees account:     00000000-0000-0000-0000-000000000001
--   external account: 00000000-0000-0000-0000-000000000002

insert into ledger_accounts (id, type, owner_user_id, batch_id, created_at)
values
  (
    '00000000-0000-0000-0000-000000000001',
    'fees',
    null,
    null,
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'external',
    null,
    null,
    now()
  )
on conflict (id) do nothing;
