\set ON_ERROR_STOP on
\ir notification-building-isolation.integration.sql

\ir ../supabase/migrations/20261103165000_revoke_unused_table_grants.sql
\ir ../supabase/migrations/20261103172000_revoke_direct_financial_table_writes.sql

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

-- Settlements travel inside the atomic snapshot and survive clients that omit them.
DO $adjustment_snapshot$
DECLARE
    v_building uuid := '20000000-0000-4000-8000-000000000001';
    v_resident uuid := '30000000-0000-4000-8000-000000000001';
    v_manager uuid := '10000000-0000-4000-8000-000000000001';
    v_adjustment uuid := '60000000-0000-4000-8000-000000000001';
    v_base jsonb;
    v_payload jsonb;
    v_version bigint;
    v_result jsonb;
BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_manager::text, true);

    v_base := jsonb_build_object(
        'building', jsonb_build_object('name', 'Manzil'),
        'residents', jsonb_build_array(jsonb_build_object(
            'id', v_resident, 'name', 'Owner A', 'apartment_number', 'A1',
            'monthly_amount', 100, 'created_at', '2026-11-02T10:00:00Z'
        )),
        'income', '[]'::jsonb,
        'expenses', '[]'::jsonb,
        'notices', '[]'::jsonb,
        'audit_logs', '[]'::jsonb
    );

    SELECT state_version INTO v_version FROM public.buildings WHERE id = v_building;
    v_payload := jsonb_set(v_base, '{resident_adjustments}', jsonb_build_array(jsonb_build_object(
        'id', v_adjustment,
        'resident_id', v_resident,
        'effective_month', '2026-11-01',
        'kind', 'waiver',
        'amount', 25,
        'reason', 'إعفاء اختباري'
    )));

    SELECT private.persist_building_snapshot(v_building, v_version, gen_random_uuid(), v_payload)
    INTO v_result;
    IF (v_result->>'ok')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'snapshot with a settlement was rejected: %', v_result;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.resident_adjustments
        WHERE id = v_adjustment AND building_id = v_building
          AND resident_id = v_resident AND amount = 25 AND kind = 'waiver'
    ) THEN
        RAISE EXCEPTION 'settlement was not persisted by the snapshot RPC';
    END IF;

    -- Older clients omit the key: the stored ledger must stay untouched.
    SELECT state_version INTO v_version FROM public.buildings WHERE id = v_building;
    SELECT private.persist_building_snapshot(v_building, v_version, gen_random_uuid(), v_base)
    INTO v_result;
    IF NOT EXISTS (
        SELECT 1 FROM public.resident_adjustments WHERE id = v_adjustment
    ) THEN
        RAISE EXCEPTION 'omitting resident_adjustments erased the settlement ledger';
    END IF;

    -- Settlements may not exceed the month subscription entitlement.
    SELECT state_version INTO v_version FROM public.buildings WHERE id = v_building;
    v_payload := jsonb_set(v_base, '{resident_adjustments}', jsonb_build_array(jsonb_build_object(
        'id', v_adjustment,
        'resident_id', v_resident,
        'effective_month', '2026-11-01',
        'kind', 'waiver',
        'amount', 500,
        'reason', 'إعفاء أكبر من المستحق'
    )));
    BEGIN
        PERFORM private.persist_building_snapshot(v_building, v_version, gen_random_uuid(), v_payload);
        RAISE EXCEPTION 'settlement above the month entitlement was accepted';
    EXCEPTION WHEN SQLSTATE '22023' THEN
        IF SQLERRM NOT LIKE '%adjustment_exceeds_month_due%' THEN
            RAISE EXCEPTION 'unexpected settlement rejection: %', SQLERRM;
        END IF;
    END;

    -- A settlement must reference a resident included in the snapshot.
    SELECT state_version INTO v_version FROM public.buildings WHERE id = v_building;
    v_payload := jsonb_set(v_base, '{resident_adjustments}', jsonb_build_array(jsonb_build_object(
        'id', v_adjustment,
        'resident_id', '30000000-0000-4000-8000-000000000099',
        'effective_month', '2026-11-01',
        'kind', 'discount',
        'amount', 10,
        'reason', 'ساكن خارج اللقطة'
    )));
    BEGIN
        PERFORM private.persist_building_snapshot(v_building, v_version, gen_random_uuid(), v_payload);
        RAISE EXCEPTION 'settlement for a resident outside the snapshot was accepted';
    EXCEPTION WHEN SQLSTATE '42501' THEN
        IF SQLERRM NOT LIKE '%adjustment_resident_not_in_snapshot%' THEN
            RAISE EXCEPTION 'unexpected settlement rejection: %', SQLERRM;
        END IF;
    END;
END;
$adjustment_snapshot$;

SELECT 'resident adjustment snapshot and entitlement tests passed' AS result;

\ir partial-settlement.integration.sql
