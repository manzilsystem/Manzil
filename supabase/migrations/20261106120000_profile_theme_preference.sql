-- Per-account theme preference for the read-only owner portal.
-- The building theme stays the manager default; an owner preference overrides it
-- only for that owner's account on every device.

alter table public.profiles
    add column if not exists theme_preference text;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conrelid = 'public.profiles'::regclass
          and conname = 'profiles_theme_preference_check'
    ) then
        alter table public.profiles
            add constraint profiles_theme_preference_check
            check (
                theme_preference is null
                or theme_preference in ('dark', 'light', 'emerald', 'ocean', 'sand', 'turquoise')
            );
    end if;
end;
$$;

create or replace function public.set_my_theme(p_theme text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.uid() is null then
        raise exception 'not_authenticated' using errcode = '28000';
    end if;
    if p_theme is null
       or p_theme not in ('dark', 'light', 'emerald', 'ocean', 'sand', 'turquoise') then
        raise exception 'invalid_theme' using errcode = '22023';
    end if;
    update public.profiles
       set theme_preference = p_theme
     where id = auth.uid();
end;
$$;

revoke all on function public.set_my_theme(text) from public, anon;
grant execute on function public.set_my_theme(text) to authenticated;
