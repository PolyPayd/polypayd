-- Create audit_events table for tracking important actions in PolyPayd
create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  batch_id uuid null,
  actor_user_id text null,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_org_id_idx on audit_events(org_id);
create index if not exists audit_events_batch_id_idx on audit_events(batch_id);
create index if not exists audit_events_created_at_idx on audit_events(created_at desc);
