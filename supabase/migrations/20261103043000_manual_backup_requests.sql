create table if not exists public.backup_requests (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'queued' check (status in ('queued','dispatched','succeeded','failed')),
  result_message text,
  created_at timestamptz not null default now(),
  dispatched_at timestamptz,
  finished_at timestamptz
);
create index if not exists backup_requests_status_created_idx
  on public.backup_requests(status, created_at);
create unique index if not exists backup_requests_one_active_idx
  on public.backup_requests ((true))
  where status in ('queued','dispatched');
alter table public.backup_requests enable row level security;
revoke all on public.backup_requests from public, anon, authenticated;
create index if not exists restore_requests_backup_tag_idx
  on public.restore_requests(backup_tag);