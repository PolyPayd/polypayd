-- RLS policies. All tables use service role for server-side operations. Client-side queries use Clerk JWT mapped to users.id.

-- ---------------------------------------------------------------------------
-- HELPER
-- ---------------------------------------------------------------------------

-- Placeholder admin check — replace with a real roles table when needed.
create or replace function is_admin()
returns boolean language plpgsql security definer as $$
begin
  return auth.uid()::text = any(array[
    -- add admin user UUIDs here
  ]);
end;
$$;

-- ---------------------------------------------------------------------------
-- ENABLE RLS
-- ---------------------------------------------------------------------------

alter table users             enable row level security;
alter table bank_accounts     enable row level security;
alter table batches           enable row level security;
alter table batch_slots       enable row level security;
alter table claims            enable row level security;
alter table ledger_accounts   enable row level security;
alter table ledger_entries    enable row level security;
alter table crezco_webhooks   enable row level security;
alter table persona_webhooks  enable row level security;
alter table audit_logs        enable row level security;
alter table claim_links       enable row level security;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

create policy "users: read own row"
  on users for select
  using (id = auth.uid() or is_admin());

create policy "users: update own row"
  on users for update
  using (id = auth.uid());

-- ---------------------------------------------------------------------------
-- bank_accounts
-- ---------------------------------------------------------------------------

create policy "bank_accounts: select own"
  on bank_accounts for select
  using (user_id = auth.uid());

create policy "bank_accounts: insert own"
  on bank_accounts for insert
  with check (user_id = auth.uid());

create policy "bank_accounts: update own"
  on bank_accounts for update
  using (user_id = auth.uid());

create policy "bank_accounts: delete own"
  on bank_accounts for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- batches
-- ---------------------------------------------------------------------------

create policy "batches: sender full access"
  on batches for all
  using (sender_user_id = auth.uid())
  with check (sender_user_id = auth.uid());

-- Recipients can read batches they have a claim on.
create policy "batches: recipient read"
  on batches for select
  using (
    exists (
      select 1 from claims
      where claims.batch_id = batches.id
        and claims.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- batch_slots
-- ---------------------------------------------------------------------------

-- Batch sender can read all slots on their batches.
create policy "batch_slots: sender read"
  on batch_slots for select
  using (
    exists (
      select 1 from batches
      where batches.id = batch_slots.batch_id
        and batches.sender_user_id = auth.uid()
    )
  );

-- Claimant can read the slot they claimed.
create policy "batch_slots: claimant read"
  on batch_slots for select
  using (claimed_by_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- claims
-- ---------------------------------------------------------------------------

create policy "claims: read own"
  on claims for select
  using (user_id = auth.uid());

-- Batch sender can read all claims on their batches.
create policy "claims: sender read all"
  on claims for select
  using (
    exists (
      select 1 from batches
      where batches.id = claims.batch_id
        and batches.sender_user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- ledger_accounts — service role only (no user-facing policies)
-- ---------------------------------------------------------------------------

-- (No policies added; RLS is enabled so all direct user access is denied.)

-- ---------------------------------------------------------------------------
-- ledger_entries — service role only
-- ---------------------------------------------------------------------------

-- (No policies added.)

-- ---------------------------------------------------------------------------
-- crezco_webhooks — service role only
-- ---------------------------------------------------------------------------

-- (No policies added.)

-- ---------------------------------------------------------------------------
-- persona_webhooks — service role only
-- ---------------------------------------------------------------------------

-- (No policies added.)

-- ---------------------------------------------------------------------------
-- audit_logs — service role only; users can read their own entries
-- ---------------------------------------------------------------------------

create policy "audit_logs: read own"
  on audit_logs for select
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- claim_links — public read (unauthenticated claim landing page)
-- ---------------------------------------------------------------------------

create policy "claim_links: public read"
  on claim_links for select
  using (true);
