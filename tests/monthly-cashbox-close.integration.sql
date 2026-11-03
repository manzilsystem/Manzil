\set ON_ERROR_STOP on

-- Isolated monthly cashbox close test. All test records are rolled back.
BEGIN;

INSERT INTO public.buildings (
    id, name, manager_name, default_subscription, starting_balance, current_theme
) VALUES (
    '20000000-0000-4000-8000-000000000004',
    'Monthly close test', 'Manager', 0, 100, 'dark'
);

INSERT INTO public.building_members (building_id, user_id, role)
VALUES (
    '20000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000001',
    'manager'
);

INSERT INTO public.residents (id, building_id, name, apartment_number, monthly_amount)
VALUES (
    '30000000-0000-4000-8000-000000000004',
    '20000000-0000-4000-8000-000000000004',
    'Monthly close resident', 'MC1', 100
);

-- Prior to November in Cairo local time: opening balance is 100 + 50 - 10 - 40 = 100.
INSERT INTO public.income (
    id, building_id, resident_id, amount, month, paid_at, created_by
) VALUES
(
    '50000000-0000-4000-8000-000000000041',
    '20000000-0000-4000-8000-000000000004',
    '30000000-0000-4000-8000-000000000004',
    50, '2026-10', '2026-10-31T21:59:59Z',
    '10000000-0000-4000-8000-000000000001'
),
-- Cairo November starts at 2026-10-31 22:00:00Z (UTC+2 after DST ends).
(
    '50000000-0000-4000-8000-000000000042',
    '20000000-0000-4000-8000-000000000004',
    '30000000-0000-4000-8000-000000000004',
    100, '2026-10', '2026-10-31T22:30:00Z',
    '10000000-0000-4000-8000-000000000001'
),
(
    '50000000-0000-4000-8000-000000000043',
    '20000000-0000-4000-8000-000000000004',
    '30000000-0000-4000-8000-000000000004',
    50, '2026-11', '2026-11-15T10:00:00Z',
    '10000000-0000-4000-8000-000000000001'
),
-- At the December local boundary, so this must not enter November.
(
    '50000000-0000-4000-8000-000000000044',
    '20000000-0000-4000-8000-000000000004',
    '30000000-0000-4000-8000-000000000004',
    30, '2026-12', '2026-11-30T22:00:00Z',
    '10000000-0000-4000-8000-000000000001'
);

INSERT INTO public.expenses (
    id, building_id, title, amount, category, month, spent_at, created_by, cash_account_code
) VALUES
(
    '60000000-0000-4000-8000-000000000041',
    '20000000-0000-4000-8000-000000000004',
    'Prior main expense', 10, 'Test', '2026-10',
    '2026-10-31T21:59:59Z',
    '10000000-0000-4000-8000-000000000001', 'main'
),
(
    '60000000-0000-4000-8000-000000000042',
    '20000000-0000-4000-8000-000000000004',
    'November main expense', 20, 'Test', '2026-11',
    '2026-11-30T21:59:59Z',
    '10000000-0000-4000-8000-000000000001', 'main'
),
(
    '60000000-0000-4000-8000-000000000043',
    '20000000-0000-4000-8000-000000000004',
    'November development expense', 5, 'Test', '2026-11',
    '2026-11-10T10:00:00Z',
    '10000000-0000-4000-8000-000000000001', 'development'
),
-- At the December local boundary, excluded from November.
(
    '60000000-0000-4000-8000-000000000044',
    '20000000-0000-4000-8000-000000000004',
    'December emergency expense', 2, 'Test', '2026-12',
    '2026-11-30T22:00:00Z',
    '10000000-0000-4000-8000-000000000001', 'emergency'
);

INSERT INTO public.cash_transfers (
    id, building_id, request_id, from_account_code, to_account_code,
    amount, transferred_at, created_by
) VALUES
(
    '70000000-0000-4000-8000-000000000041',
    '20000000-0000-4000-8000-000000000004',
    '71000000-0000-4000-8000-000000000041',
    'main', 'development', 40, '2026-10-30T12:00:00Z',
    '10000000-0000-4000-8000-000000000001'
),
(
    '70000000-0000-4000-8000-000000000042',
    '20000000-0000-4000-8000-000000000004',
    '71000000-0000-4000-8000-000000000042',
    'development', 'emergency', 10, '2026-11-10T12:00:00Z',
    '10000000-0000-4000-8000-000000000001'
),
(
    '70000000-0000-4000-8000-000000000043',
    '20000000-0000-4000-8000-000000000004',
    '71000000-0000-4000-8000-000000000043',
    'main', 'emergency', 5, '2026-11-25T12:00:00Z',
    '10000000-0000-4000-8000-000000000001'
),
-- December local boundary, excluded from November.
(
    '70000000-0000-4000-8000-000000000044',
    '20000000-0000-4000-8000-000000000004',
    '71000000-0000-4000-8000-000000000044',
    'emergency', 'main', 2, '2026-11-30T22:00:00Z',
    '10000000-0000-4000-8000-000000000001'
);

SET request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
SET ROLE authenticated;

DO $monthly_close$
DECLARE
    v_report jsonb;
BEGIN
    v_report := public.get_monthly_cashbox_close(
        '20000000-0000-4000-8000-000000000004',
        DATE '2026-11-01'
    );

    IF v_report->>'month' <> '2026-11'
       OR v_report->>'time_zone' <> 'Africa/Cairo'
       OR v_report->>'reconciled' <> 'true' THEN
        RAISE EXCEPTION 'monthly close metadata or reconciliation failed: %', v_report;
    END IF;

    IF (v_report#>>'{accounts,main,opening_balance}')::numeric <> 100
       OR (v_report#>>'{accounts,main,income}')::numeric <> 150
       OR (v_report#>>'{accounts,main,expenses}')::numeric <> 20
       OR (v_report#>>'{accounts,main,transfers_out}')::numeric <> 5
       OR (v_report#>>'{accounts,main,closing_balance}')::numeric <> 225 THEN
        RAISE EXCEPTION 'main cashbox close mismatch: %', v_report;
    END IF;

    IF (v_report#>>'{accounts,development,opening_balance}')::numeric <> 40
       OR (v_report#>>'{accounts,development,expenses}')::numeric <> 5
       OR (v_report#>>'{accounts,development,transfers_out}')::numeric <> 10
       OR (v_report#>>'{accounts,development,closing_balance}')::numeric <> 25 THEN
        RAISE EXCEPTION 'development fund close mismatch: %', v_report;
    END IF;

    IF (v_report#>>'{accounts,emergency,opening_balance}')::numeric <> 0
       OR (v_report#>>'{accounts,emergency,transfers_in}')::numeric <> 15
       OR (v_report#>>'{accounts,emergency,closing_balance}')::numeric <> 15 THEN
        RAISE EXCEPTION 'emergency fund close mismatch: %', v_report;
    END IF;

    IF (v_report#>>'{totals,opening_balance}')::numeric <> 140
       OR (v_report#>>'{totals,income}')::numeric <> 150
       OR (v_report#>>'{totals,expenses}')::numeric <> 25
       OR (v_report#>>'{totals,transfers_in}')::numeric <> 15
       OR (v_report#>>'{totals,transfers_out}')::numeric <> 15
       OR (v_report#>>'{totals,net_movement}')::numeric <> 125
       OR (v_report#>>'{totals,closing_balance}')::numeric <> 265 THEN
        RAISE EXCEPTION 'monthly total close mismatch: %', v_report;
    END IF;

    BEGIN
        PERFORM public.get_monthly_cashbox_close(
            '20000000-0000-4000-8000-000000000004',
            DATE '2026-11-15'
        );
        RAISE EXCEPTION 'monthly close accepted a non-first-day date';
    EXCEPTION WHEN SQLSTATE '22023' THEN
        NULL;
    END;
END;
$monthly_close$;

RESET ROLE;

SET request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
SET ROLE authenticated;

DO $monthly_close_owner$
BEGIN
    BEGIN
        PERFORM public.get_monthly_cashbox_close(
            '20000000-0000-4000-8000-000000000004',
            DATE '2026-11-01'
        );
        RAISE EXCEPTION 'non-manager user accessed monthly cashbox close';
    EXCEPTION WHEN SQLSTATE '42501' THEN
        NULL;
    END;
END;
$monthly_close_owner$;

RESET ROLE;
ROLLBACK;

SELECT 'monthly cashbox close integration tests passed' AS result;
