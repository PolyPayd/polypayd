-- Idempotent: payouts.batch_item_id + partial unique index for ON CONFLICT inference.

alter table public.payouts
  add column if not exists batch_item_id uuid null references public.batch_items(id) on delete set null;

create unique index if not exists payouts_batch_item_id_status_key
  on public.payouts (batch_item_id, status)
  where batch_item_id is not null;
