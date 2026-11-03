\set ON_ERROR_STOP on
\ir notification-building-isolation.integration.sql

\ir ../supabase/migrations/20261103165000_revoke_unused_table_grants.sql

DO $grant_checks$
BEGIN
    IF NOT has_table_privilege('authenticated', 'public.buildings', 'SELECT')
       OR NOT has_table_privilege('authenticated', 'public.buildings', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.buildings', 'INSERT')
       OR has_table_privilege('authenticated', 'public.buildings', 'DELETE') THEN
        RAISE EXCEPTION 'authenticated building table privileges are not least-privilege';
    END IF;

    IF NOT has_table_privilege('authenticated', 'public.audit_logs', 'SELECT')
       OR NOT has_table_privilege('authenticated', 'public.audit_logs', 'INSERT')
       OR has_table_privilege('authenticated', 'public.audit_logs', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.audit_logs', 'DELETE') THEN
        RAISE EXCEPTION 'authenticated audit log privileges are not append-only';
    END IF;
END;
$grant_checks$;

SELECT 'unused authenticated table grants revoked successfully' AS result;
