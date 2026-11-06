\set ON_ERROR_STOP on

DO $partial_settlement$
DECLARE
    v_building uuid := '20000000-0000-4000-8000-000000000003';
    v_resident uuid := '30000000-0000-4000-8000-000000000003';
    v_manager uuid := '10000000-0000-4000-8000-000000000001';
    v_settlement uuid := '70000000-0000-4000-8000-000000000003';
    v_payment_one uuid := '80000000-0000-4000-8000-000000000003';
    v_payment_two uuid := '80000000-0000-4000-8000-000000000004';
    v_version bigint;
    v_payload jsonb;
    v_result jsonb;
BEGIN
    INSERT INTO public.buildings (id, name)
    VALUES (v_building, 'Settlement integration')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.building_members (building_id, user_id, role)
    VALUES (v_building, v_manager, 'manager')
    ON CONFLICT (building_id, user_id) DO NOTHING;

    INSERT INTO public.residents (id, building_id, name, apartment_number, monthly_amount)
    VALUES (v_resident, v_building, 'Settlement Resident', 'S3', 500)
    ON CONFLICT (id) DO NOTHING;

    PERFORM set_config('request.jwt.claim.sub', v_manager::text, true);
    SELECT state_version INTO v_version FROM public.buildings WHERE id = v_building;

    v_payload := jsonb_build_object(
        'building', jsonb_build_object('name', 'Settlement integration'),
        'residents', jsonb_build_array(jsonb_build_object(
            'id', v_resident, 'name', 'Settlement Resident',
            'apartment_number', 'S3', 'monthly_amount', 500,
            'created_at', '2026-11-01T00:00:00Z'
        )),
        'income', jsonb_build_array(jsonb_build_object(
            'id', v_payment_one, 'resident_id', v_resident, 'amount', 200,
            'month', 'نوفمبر 2026', 'notes', 'دفعة تسوية أولى',
            'payment_method', 'cash', 'purpose_code', 'settlement',
            'settlement_adjustment_id', v_settlement,
            'paid_at', '2026-11-06T10:00:00Z'
        )),
        'expenses', '[]'::jsonb,
        'notices', '[]'::jsonb,
        'audit_logs', '[]'::jsonb,
        'resident_adjustments', jsonb_build_array(jsonb_build_object(
            'id', v_settlement, 'resident_id', v_resident,
            'effective_month', '2026-11-01', 'kind', 'settlement',
            'amount', 500, 'reason', 'اتفاق تسوية اختباري'
        ))
    );

    v_result := private.persist_building_snapshot(
        v_building, v_version, '90000000-0000-4000-8000-000000000003', v_payload
    );
    IF v_result->>'ok' IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'first partial settlement payment failed: %', v_result;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.income
        WHERE id = v_payment_one AND purpose_code = 'settlement'
          AND settlement_adjustment_id = v_settlement AND amount = 200
    ) THEN
        RAISE EXCEPTION 'settlement payment did not enter the income/cash ledger';
    END IF;

    SELECT state_version INTO v_version FROM public.buildings WHERE id = v_building;
    v_payload := jsonb_set(
        v_payload,
        '{income}',
        (v_payload->'income') || jsonb_build_array(jsonb_build_object(
            'id', v_payment_two, 'resident_id', v_resident, 'amount', 300,
            'month', 'نوفمبر 2026', 'notes', 'دفعة تسوية ثانية',
            'payment_method', 'wallet', 'purpose_code', 'settlement',
            'settlement_adjustment_id', v_settlement,
            'paid_at', '2026-11-06T11:00:00Z'
        ))
    );
    v_result := private.persist_building_snapshot(
        v_building, v_version, '90000000-0000-4000-8000-000000000004', v_payload
    );
    IF v_result->>'ok' IS DISTINCT FROM 'true'
       OR (SELECT SUM(amount) FROM public.income WHERE settlement_adjustment_id = v_settlement) <> 500 THEN
        RAISE EXCEPTION 'installments up to the settlement cap failed: %', v_result;
    END IF;

    SELECT state_version INTO v_version FROM public.buildings WHERE id = v_building;
    v_payload := jsonb_set(
        v_payload,
        '{income,1,amount}',
        '301'::jsonb
    );
    BEGIN
        PERFORM private.persist_building_snapshot(
            v_building, v_version, '90000000-0000-4000-8000-000000000005', v_payload
        );
        RAISE EXCEPTION 'settlement overpayment was accepted';
    EXCEPTION WHEN SQLSTATE '22023' THEN
        IF SQLERRM NOT LIKE '%settlement_payment_exceeds_agreement%' THEN
            RAISE EXCEPTION 'unexpected settlement cap rejection: %', SQLERRM;
        END IF;
    END;
    IF (SELECT state_version FROM public.buildings WHERE id = v_building) <> v_version
       OR (SELECT SUM(amount) FROM public.income WHERE settlement_adjustment_id = v_settlement) <> 500 THEN
        RAISE EXCEPTION 'overpayment rejection did not roll back the whole snapshot';
    END IF;

    -- A settlement purpose cannot be posted without its agreement link.
    v_payload := jsonb_set(v_payload, '{income,1,amount}', '300'::jsonb);
    v_payload := jsonb_set(
        v_payload,
        '{income}',
        (v_payload->'income') || jsonb_build_array(jsonb_build_object(
            'id', '80000000-0000-4000-8000-000000000005',
            'resident_id', v_resident, 'amount', 1,
            'month', 'نوفمبر 2026', 'notes', 'تسوية بلا رابط',
            'payment_method', 'cash', 'purpose_code', 'settlement',
            'paid_at', '2026-11-06T12:00:00Z'
        ))
    );
    BEGIN
        PERFORM private.persist_building_snapshot(
            v_building, v_version, '90000000-0000-4000-8000-000000000006', v_payload
        );
        RAISE EXCEPTION 'unlinked settlement income was accepted';
    EXCEPTION WHEN SQLSTATE '22023' THEN
        IF SQLERRM NOT LIKE '%invalid_settlement_payment_link%' THEN
            RAISE EXCEPTION 'unexpected unlinked settlement rejection: %', SQLERRM;
        END IF;
    END;

    -- Ordinary subscription income cannot be mixed with an active settlement month.
    v_payload := jsonb_set(v_payload, '{income,2,purpose_code}', '"subscription"'::jsonb);
    BEGIN
        PERFORM private.persist_building_snapshot(
            v_building, v_version, '90000000-0000-4000-8000-000000000007', v_payload
        );
        RAISE EXCEPTION 'subscription income was accepted for a settlement month';
    EXCEPTION WHEN SQLSTATE '22023' THEN
        IF SQLERRM NOT LIKE '%settlement_conflicts_with_subscription_income%' THEN
            RAISE EXCEPTION 'unexpected subscription/settlement rejection: %', SQLERRM;
        END IF;
    END;
END;
$partial_settlement$;

SELECT 'partial settlement cap, linkage and atomic rollback tests passed' AS result;
