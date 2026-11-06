\set ON_ERROR_STOP on
\ir notification-building-isolation.integration.sql

\ir ../supabase/migrations/20261103165000_revoke_unused_table_grants.sql
\ir ../supabase/migrations/20261103172000_revoke_direct_financial_table_writes.sql
\ir ../supabase/migrations/20261106021427_resident_adjustments.sql

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

    FOREACH v_table IN ARRAY ARRAY['residents', 'income', 'expenses', 'resident_adjustments'] LOOP
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

-- Settlement ledger: one valid row per settlement and hard guards against bad shapes.
DO $adjustment_guards$
DECLARE
    v_building uuid := '20000000-0000-4000-8000-000000000001';
    v_resident uuid := '30000000-0000-4000-8000-000000000001';
    v_manager uuid := '10000000-0000-4000-8000-000000000001';
BEGIN
    INSERT INTO public.resident_adjustments
        (building_id, resident_id, effective_month, kind, amount, reason, created_by)
    VALUES
        (v_building, v_resident, '2026-11-01', 'waiver', 25, 'إعفاء اختباري', v_manager);

    BEGIN
        INSERT INTO public.resident_adjustments
            (building_id, resident_id, effective_month, kind, amount, reason, created_by)
        VALUES
            (v_building, v_resident, '2026-11-01', 'waiver', 0, 'صفر', v_manager);
        RAISE EXCEPTION 'zero settlement amount was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO public.resident_adjustments
            (building_id, resident_id, effective_month, kind, amount, reason, created_by)
        VALUES
            (v_building, v_resident, '2026-11-01', 'other', 10, 'نوع خاطئ', v_manager);
        RAISE EXCEPTION 'unknown settlement kind was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO public.resident_adjustments
            (building_id, resident_id, effective_month, kind, amount, reason, created_by)
        VALUES
            (v_building, v_resident, '2026-11-02', 'discount', 10, 'منتصف الشهر', v_manager);
        RAISE EXCEPTION 'settlement outside the first day of the month was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO public.resident_adjustments
            (building_id, resident_id, effective_month, kind, amount, reason, created_by)
        VALUES
            (v_building, v_resident, '2026-11-01', 'settlement', 10, '   ', v_manager);
        RAISE EXCEPTION 'blank settlement reason was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END;
$adjustment_guards$;

-- Visibility: managers and the unit owner read the row; other owners cannot.
SET ROLE authenticated;
DO $adjustment_visibility$
DECLARE
    v_visible integer;
BEGIN
    PERFORM set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
    SELECT count(*) INTO v_visible FROM public.resident_adjustments;
    IF v_visible <> 1 THEN
        RAISE EXCEPTION 'manager cannot read the settlement ledger (saw %)', v_visible;
    END IF;

    PERFORM set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
    SELECT count(*) INTO v_visible FROM public.resident_adjustments;
    IF v_visible <> 1 THEN
        RAISE EXCEPTION 'unit owner cannot read their own settlement (saw %)', v_visible;
    END IF;

    PERFORM set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
    SELECT count(*) INTO v_visible FROM public.resident_adjustments;
    IF v_visible <> 0 THEN
        RAISE EXCEPTION 'unrelated owner read another unit settlement (saw %)', v_visible;
    END IF;

    BEGIN
        INSERT INTO public.resident_adjustments
            (building_id, resident_id, effective_month, kind, amount, reason, created_by)
        VALUES
            ('20000000-0000-4000-8000-000000000001',
             '30000000-0000-4000-8000-000000000001',
             '2026-11-01', 'waiver', 5, 'كتابة مباشرة', '10000000-0000-4000-8000-000000000003');
        RAISE EXCEPTION 'authenticated direct settlement write was accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
END;
$adjustment_visibility$;
RESET ROLE;

SELECT 'resident adjustment guard and visibility tests passed' AS result;
