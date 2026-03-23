-- MVP: Replace/Remove Bulk Send CSV before completion.
-- Run this in Supabase SQL Editor to add the reset RPC if migrations aren't linked.

drop function if exists public.reset_standard_batch_uploads(uuid, uuid);

create or replace function public.reset_standard_batch_uploads(p_batch_id uuid, p_org_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_batch_type text;
begin
  -- Lock the batch row so deletes + totals reset are consistent.
  select status, batch_type
  into v_status, v_batch_type
  from batches
  where id = p_batch_id
    and org_id = p_org_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Batch not found');
  end if;

  if v_batch_type <> 'standard' then
    return jsonb_build_object('ok', false, 'error', 'Only Bulk Send batches can be reset');
  end if;

  -- Guardrail: once sent/completed (including with errors), keep audit trail intact.
  if v_status in ('completed', 'completed_with_errors') then
    return jsonb_build_object('ok', false, 'error', 'Cannot modify uploads after payments have been sent');
  end if;

  -- Clear upload-derived state so the next upload becomes the single effective source (MVP).
  delete from batch_item_errors
  where batch_upload_id in (
    select id from batch_uploads where batch_id = p_batch_id
  );

  delete from batch_items
  where batch_id = p_batch_id;

  delete from batch_uploads
  where batch_id = p_batch_id;

  -- Reset the displayed totals (UI reads from `batches`).
  update batches
  set total_amount = 0,
      recipient_count = 0
  where id = p_batch_id
    and org_id = p_org_id;

  return jsonb_build_object('ok', true);
exception when others then
  return jsonb_build_object('ok', false, 'error', SQLERRM);
end;
$$;

grant execute on function public.reset_standard_batch_uploads(uuid, uuid) to anon, authenticated;

