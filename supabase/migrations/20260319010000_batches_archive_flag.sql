alter table batches
  add column if not exists archived_at timestamptz null;

create index if not exists batches_org_id_archived_at_idx
  on batches (org_id, archived_at, created_at desc);

