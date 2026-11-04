-- Client-side error reporting. Anonymous clients may only append rows; nobody
-- can read, update or delete through the API. The cap trigger keeps the table
-- bounded so a noisy or hostile client cannot grow storage without limit.

create table if not exists public.client_errors (
    id uuid primary key default gen_random_uuid(),
    kind text not null check (kind in ('error', 'rejection', 'manual')),
    message text not null check (char_length(message) between 1 and 300),
    source text check (char_length(source) <= 80),
    line integer,
    column_number integer,
    stack text check (char_length(stack) <= 1200),
    role text check (char_length(role) <= 20),
    release text check (char_length(release) <= 40),
    path text check (char_length(path) <= 120),
    created_at timestamptz not null default now()
);

alter table public.client_errors enable row level security;

drop policy if exists client_errors_insert_only on public.client_errors;
create policy client_errors_insert_only on public.client_errors
for insert to anon, authenticated
with check (true);

revoke all on public.client_errors from public, anon, authenticated;
grant insert on public.client_errors to anon, authenticated;

create or replace function private.cap_client_errors()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if (select count(*) from public.client_errors) >= 5000 then
        raise exception 'client_errors_capacity_reached';
    end if;
    return new;
end;
$$;

revoke all on function private.cap_client_errors() from public, anon, authenticated;

drop trigger if exists cap_client_errors on public.client_errors;
create trigger cap_client_errors
before insert on public.client_errors
for each row execute function private.cap_client_errors();
