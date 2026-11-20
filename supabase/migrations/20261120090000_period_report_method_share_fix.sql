-- Fix a missing alias in the manager period-report payment-share aggregate.
-- pg_get_functiondef keeps the replacement narrowly scoped to the deployed
-- function body. Fail closed if the expected source is not present.
DO $migration$
DECLARE
    v_function regprocedure := 'private.get_period_report(uuid,date,date,text,text,uuid)'::regprocedure;
    v_definition text;
    v_bug text := '(SELECT SUM(total.cents) FROM method_groups)) * 100)';
    v_fix text := '(SELECT SUM(total.cents) FROM method_groups total)) * 100)';
BEGIN
    SELECT pg_get_functiondef(v_function) INTO v_definition;

    IF position(v_bug IN v_definition) > 0 THEN
        EXECUTE replace(v_definition, v_bug, v_fix);
    ELSIF position(v_fix IN v_definition) = 0 THEN
        RAISE EXCEPTION 'unexpected definition for private.get_period_report; refusing an unsafe rewrite';
    END IF;
END;
$migration$;

REVOKE ALL ON FUNCTION private.get_period_report(uuid, date, date, text, text, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.get_period_report(uuid, date, date, text, text, uuid)
    TO authenticated;
