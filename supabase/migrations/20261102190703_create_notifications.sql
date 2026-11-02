create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  target_user_id uuid references auth.users(id) on delete cascade,
  target_resident_id uuid references public.residents(id) on delete cascade,
  target_scope uuid,
  kind text not null check (kind in ('unpaid','partial','payment','expense','collection_due','backup_stale','announcement')),
  dedupe_key text not null,
  title text not null,
  body text not null,
  severity text not null default 'info' check (severity in ('info','success','warning','danger')),
  action_path text,
  read_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notifications_target_check check (
    (target_user_id is null and target_resident_id is null) or target_user_id is not null
  )
);
alter table public.notifications enable row level security;
grant select, insert, update, delete on public.notifications to authenticated;
