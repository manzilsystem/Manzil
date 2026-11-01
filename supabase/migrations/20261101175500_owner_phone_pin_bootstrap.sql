-- Phone/password owner access uses Supabase Auth for password hashing.
-- Only the first-login reset flag and normalized phone are stored in profiles.
alter table public.profiles
  add column if not exists must_change_pin boolean not null default false;

create unique index if not exists profiles_phone_unique_idx
  on public.profiles (phone)
  where phone is not null and phone <> '';
