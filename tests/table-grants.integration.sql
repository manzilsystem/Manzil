\set ON_ERROR_STOP on
\ir notification-building-isolation.integration.sql

\ir ../supabase/migrations/20261103165000_revoke_unused_table_grants.sql

DO $grant_checks$
DECLARE
    v_table text;
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

    FOREACH v_table IN ARRAY ARRAY['residents', 'income', 'expenses'] LOOP
        IF NOT has_table_privilege('authenticated', format('public.%I', v_table), 'SELECT')
           OR has_table_privilege('authenticated', format('public.%I', v_table), 'INSERT')
           OR has_table_privilege('authenticated', format('public.%I', v_table), 'UPDATE')
           OR has_table_privilege('authenticated', format('public.%I', v_table), 'DELETE')
           OR has_table_privilege('authenticated', format('public.%I', v_table), 'TRUNCATE') THEN
            RAISE EXCEPTION 'authenticated direct financial table privileges are too broad: %', v_table;
        END IF;
    END LOOP;
END;
$grant_checks$;

SELECT 'unused authenticated table grants revoked successfully' AS result;
