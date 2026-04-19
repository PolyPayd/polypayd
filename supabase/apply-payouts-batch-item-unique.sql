-- LIVE SUPABASE: fixes: no unique constraint matching ON CONFLICT (batch_item_id, status)
-- Paste in SQL Editor. Requires public.batch_items.
--
-- Adds batch_item_id (nullable) + partial unique index on (batch_item_id, status).
-- Payout RPCs must use:
--   ON CONFLICT (batch_item_id, status) WHERE batch_item_id IS NOT NULL DO NOTHING
-- (see apply-process-standard-batch-payout.sql in repo)

alter table public.payouts
  add column if not exists batch_item_id uuid null references public.batch_items(id) on delete set null;

create unique index if not exists payouts_batch_item_id_status_key
  on public.payouts (batch_item_id, status)
  where batch_item_id is not null;

-- REQUIRED NEXT STEP (same session or after): redeploy standard batch RPCs from the repo so INSERT uses
--   ON CONFLICT (batch_item_id, status) WHERE batch_item_id IS NOT NULL DO NOTHING
-- Paste supabase/apply-process-standard-batch-payout.sql in full, or run migration 20260319150000 after pulling latest.
