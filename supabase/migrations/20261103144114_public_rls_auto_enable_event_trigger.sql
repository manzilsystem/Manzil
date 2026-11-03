-- Track the production public-schema RLS safety event trigger in version control.
-- It was previously created manually and therefore broke clean local replays.
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
    cmd record;
    tbl name;
BEGIN
    FOR cmd IN
        SELECT *
        FROM pg_catalog.pg_event_trigger_ddl_commands()
        WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
          AND object_type IN ('table', 'partitioned table')
    LOOP
        IF cmd.schema_name IS NOT NULL
           AND cmd.schema_name = 'public'
           AND cmd.schema_name NOT IN ('pg_catalog', 'information_schema')
           AND cmd.schema_name NOT LIKE 'pg_toast%'
           AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
            BEGIN
                SELECT c.relname
                INTO tbl
                FROM pg_catalog.pg_class c
                WHERE c.oid = cmd.objid;

                EXECUTE format(
                    'ALTER TABLE IF EXISTS %I.%I ENABLE ROW LEVEL SECURITY',
                    cmd.schema_name,
                    tbl
                );
                RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
            EXCEPTION
                WHEN OTHERS THEN
                    RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
            END;
        ELSE
            RAISE LOG 'rls_auto_enable: skip % (schema: %)', cmd.object_identity, cmd.schema_name;
        END IF;
    END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
    v_function_oid oid := 'public.rls_auto_enable()'::regprocedure;
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_event_trigger
        WHERE evtname = 'ensure_rls'
          AND evtfoid <> v_function_oid
    ) THEN
        RAISE EXCEPTION 'event trigger ensure_rls already exists with a different function';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_event_trigger
        WHERE evtname = 'ensure_rls'
    ) THEN
        EXECUTE
            'CREATE EVENT TRIGGER ensure_rls ON ddl_command_end EXECUTE FUNCTION public.rls_auto_enable()';
    END IF;
END;
$$;
