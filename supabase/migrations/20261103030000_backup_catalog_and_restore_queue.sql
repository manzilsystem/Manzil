create table if not exists public.backup_catalog (
  tag text primary key check (tag ~ '^backup-[0-9]{8}T[0-9]{6}Z$'),
  file_name text not null,
  size_bytes bigint not null check (size_bytes > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
create table if not exists public.restore_requests (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  requested_by uuid not null references auth.users(id),
  backup_tag text not null references public.backup_catalog(tag),
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed')),
  result_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists restore_requests_status_created_idx on public.restore_requests(status, created_at);
alter table public.backup_catalog enable row level security;
alter table public.restore_requests enable row level security;
revoke all on public.backup_catalog from anon, authenticated;
revoke all on public.restore_requests from anon, authenticated;
