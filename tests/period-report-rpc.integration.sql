\set ON_ERROR_STOP on

-- Exercise the period report read model against real PostgreSQL rows. This test
-- runs after the migration/fixture chain in table-grants.integration.sql.
BEGIN;

INSERT INTO public.residents (
    id, building_id, name, apartment_number, monthly_amount, created_at
) VALUES (
    '30000000-0000-4000-8000-000000000004',
    '20000000-0000-4000-8000-000000000001',
    'Period report fixture', 'RPC-1', 100, '2024-01-01T00:00:00Z'
);

INSERT INTO public.resident_subscription_rates (
    building_id, resident_id, effective_month, monthly_amount, created_by
) VALUES (
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000004',
    '2024-01-01', 100, '10000000-0000-4000-8000-000000000001'
);

INSERT INTO public.income (
    id, building_id, resident_id, amount, month, payment_method,
    paid_at, created_by, purpose_code, cash_account_code
) VALUES
(
    '50000000-0000-4000-8000-000000000101',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000004', 40, 'يناير 2024', 'cash',
    '2024-01-10T12:00:00Z', '10000000-0000-4000-8000-000000000001', 'subscription', 'main'
),
(
    '50000000-0000-4000-8000-000000000102',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000004', 30, '2024-02', 'wallet',
    '2024-02-10T12:00:00Z', '10000000-0000-4000-8000-000000000001', 'subscription', 'main'
),
(
    '50000000-0000-4000-8000-000000000103',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000004', 10, 'فبراير 2024', 'cash',
    '2024-02-11T12:00:00Z', '10000000-0000-4000-8000-000000000001', 'donation', 'main'
),
(
    '50000000-0000-4000-8000-000000000104',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000004', 25, '2024-02', 'instapay',
    '2024-02-12T12:00:00Z', '10000000-0000-4000-8000-000000000001', 'development', 'development'
);

INSERT INTO public.expenses (
    id, building_id, title, amount, category, month, spent_at,
    created_by, cash_account_code
) VALUES
(
    '60000000-0000-4000-8000-000000000101',
    '20000000-0000-4000-8000-000000000001',
    'مصروف رئيسي', 20, 'صيانة', 'فبراير 2024', '2024-02-13T12:00:00Z',
    '10000000-0000-4000-8000-000000000001', 'main'
),
(
    '60000000-0000-4000-8000-000000000102',
    '20000000-0000-4000-8000-000000000001',
    'مصروف تطوير', 5, 'تطوير', '2024-02', '2024-02-14T12:00:00Z',
    '10000000-0000-4000-8000-000000000001', 'development'
);

INSERT INTO public.resident_adjustments (
    building_id, resident_id, effective_month, kind, amount, reason, created_by
) VALUES (
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000004',
    '2024-02-01', 'waiver', 25, 'إعفاء اختباري',
    '10000000-0000-4000-8000-000000000001'
);

DO $period_report_grants$
BEGIN
    IF NOT has_function_privilege(
        'authenticated',
        'public.get_period_report(uuid,date,date,text,text,uuid)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'authenticated managers cannot execute the period report RPC';
    END IF;
    IF has_function_privilege(
        'anon',
        'public.get_period_report(uuid,date,date,text,text,uuid)',
        'EXECUTE'
    ) OR has_function_privilege(
        'anon',
        'private.get_period_report(uuid,date,date,text,text,uuid)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'anonymous users can execute the period report RPC';
    END IF;
END;
$period_report_grants$;

SET ROLE authenticated;
DO $period_report_manager$
DECLARE
    v_manager uuid := '10000000-0000-4000-8000-000000000001';
    v_building uuid := '20000000-0000-4000-8000-000000000001';
    v_resident uuid := '30000000-0000-4000-8000-000000000004';
    v_report jsonb;
    v_filtered jsonb;
    v_cents bigint;
    v_expected_cents bigint;
    v_adjustment_cents bigint;
    v_total_income_cents bigint;
    v_collected_cents bigint;
    v_other_income_cents bigint;
    v_outstanding_cents bigint;
    v_expense_cents bigint;
    v_net_cents bigint;
BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_manager::text, true);

    v_report := public.get_period_report(v_building, '2024-01-01', '2024-02-01');
    IF (v_report #>> '{months,0,expectedCents}')::bigint <> 10000
       OR (v_report #>> '{months,0,collectedCents}')::bigint <> 4000
       OR (v_report #>> '{months,0,outstandingCents}')::bigint <> 6000
       OR (v_report #>> '{months,1,expectedCents}')::bigint <> 7500
       OR (v_report #>> '{months,1,adjustmentCents}')::bigint <> 2500
       OR (v_report #>> '{months,1,collectedCents}')::bigint <> 3000
       OR (v_report #>> '{months,1,otherIncomeCents}')::bigint <> 3500
       OR (v_report #>> '{months,1,outstandingCents}')::bigint <> 4500
       OR (v_report #>> '{months,1,expenseCents}')::bigint <> 2500
       OR (v_report #>> '{months,1,netCents}')::bigint <> 4000 THEN
        RAISE EXCEPTION 'period report monthly accounting is incorrect: %', v_report->'months';
    END IF;

    SELECT
        COALESCE(SUM((month.item->>'expectedCents')::bigint), 0)::bigint,
        COALESCE(SUM((month.item->>'adjustmentCents')::bigint), 0)::bigint,
        COALESCE(SUM((month.item->>'totalIncomeCents')::bigint), 0)::bigint,
        COALESCE(SUM((month.item->>'collectedCents')::bigint), 0)::bigint,
        COALESCE(SUM((month.item->>'otherIncomeCents')::bigint), 0)::bigint,
        COALESCE(SUM((month.item->>'outstandingCents')::bigint), 0)::bigint,
        COALESCE(SUM((month.item->>'expenseCents')::bigint), 0)::bigint,
        COALESCE(SUM((month.item->>'netCents')::bigint), 0)::bigint
    INTO v_expected_cents, v_adjustment_cents, v_total_income_cents,
         v_collected_cents, v_other_income_cents, v_outstanding_cents,
         v_expense_cents, v_net_cents
    FROM jsonb_array_elements(v_report->'months') AS month(item);

    IF v_expected_cents <> 17500
       OR v_adjustment_cents <> 2500
       OR v_total_income_cents <> 10500
       OR v_collected_cents <> 7000
       OR v_other_income_cents <> 3500
       OR v_outstanding_cents <> 10500
       OR v_expense_cents <> 2500
       OR v_net_cents <> 8000 THEN
        RAISE EXCEPTION 'period report totals do not reconcile: %', v_report->'months';
    END IF;

    SELECT COALESCE(SUM((method.item->>'cents')::bigint), 0)
      INTO v_cents
      FROM jsonb_array_elements(v_report->'methods') AS method(item);
    IF v_cents <> v_total_income_cents THEN
        RAISE EXCEPTION 'payment method breakdown does not equal total income';
    END IF;

    SELECT COALESCE(SUM((purpose.item->>'cents')::bigint), 0)
      INTO v_cents
      FROM jsonb_array_elements(v_report->'purposes') AS purpose(item);
    IF v_cents <> v_total_income_cents THEN
        RAISE EXCEPTION 'purpose breakdown does not equal total income';
    END IF;

    v_filtered := public.get_period_report(
        v_building, '2024-01-01', '2024-02-01', 'subscription', NULL, v_resident
    );
    SELECT COALESCE(SUM((month.item->>'totalIncomeCents')::bigint), 0)
      INTO v_cents
      FROM jsonb_array_elements(v_filtered->'months') AS month(item);
    IF v_cents <> 7000
       OR (v_filtered #>> '{months,0,expectedCents}')::bigint
          + (v_filtered #>> '{months,1,expectedCents}')::bigint <> 17500 THEN
        RAISE EXCEPTION 'purpose/resident filters changed subscription dues incorrectly: %', v_filtered->'months';
    END IF;

    v_filtered := public.get_period_report(
        v_building, '2024-01-01', '2024-02-01', NULL, 'development', NULL
    );
    IF (v_filtered #>> '{months,1,totalIncomeCents}')::bigint <> 2500
       OR (v_filtered #>> '{months,1,expenseCents}')::bigint <> 500
       OR (v_filtered #>> '{months,1,movementCount}')::integer <> 1 THEN
        RAISE EXCEPTION 'cash account filter returned unexpected movements: %', v_filtered->'months';
    END IF;

    BEGIN
        PERFORM public.get_period_report(v_building, '2020-01-01', '2025-01-01');
        RAISE EXCEPTION 'period report accepted a range longer than 60 months';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;

    BEGIN
        PERFORM public.get_period_report(v_building, '2024-01-02', '2024-02-01');
        RAISE EXCEPTION 'period report accepted a non-month-start date';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;

    BEGIN
        PERFORM public.get_period_report(v_building, '2024-01-01', '2024-02-01', 'not-a-purpose');
        RAISE EXCEPTION 'period report accepted an unsupported purpose';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;

    BEGIN
        PERFORM public.get_period_report(
            v_building, '2024-01-01', '2024-02-01', NULL, NULL,
            '30000000-0000-4000-8000-000000000098'
        );
        RAISE EXCEPTION 'period report accepted a resident from another building';
    EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL;
    END;

    BEGIN
        PERFORM public.get_period_report(
            '20000000-0000-4000-8000-000000000002', '2024-01-01', '2024-02-01'
        );
        RAISE EXCEPTION 'manager read a period report for another building';
    EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
    END;
END;
$period_report_manager$;

DO $period_report_owner$
BEGIN
    PERFORM set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
    BEGIN
        PERFORM public.get_period_report(
            '20000000-0000-4000-8000-000000000001', '2024-01-01', '2024-02-01'
        );
        RAISE EXCEPTION 'owner read a building-wide period report';
    EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
    END;
END;
$period_report_owner$;
RESET ROLE;

SET ROLE anon;
DO $period_report_anon$
BEGIN
    PERFORM set_config('request.jwt.claim.sub', '', true);
    BEGIN
        PERFORM public.get_period_report(
            '20000000-0000-4000-8000-000000000001', '2024-01-01', '2024-02-01'
        );
        RAISE EXCEPTION 'anonymous caller executed the period report RPC';
    EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
    END;
END;
$period_report_anon$;
RESET ROLE;

ROLLBACK;
SELECT 'period report RPC accounting, filters, validation, and access tests passed' AS result;
