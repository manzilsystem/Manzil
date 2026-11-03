-- This legacy helper is not part of the application API.
DO $guard$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    EXECUTE 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  END IF;
END;
$guard$;
