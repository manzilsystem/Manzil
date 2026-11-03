-- Read-only monthly cashbox close using actual cash movement timestamps.
-- Payment allocation month is intentionally ignored: paid_at is the collection date.
-- Cairo local month boundaries are converted to timestamptz before filtering.
CREATE OR REPLACE FUNCTION private.get_monthly_cashbox_close(
    p_building_id uuid,
    p_month date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_actor uuid := auth.uid();
    v_start timestamptz;
    v_end timestamptz;
    v_starting_balance numeric;
    v_accounts jsonb;
    v_total_opening numeric;
    v_total_income numeric;
    v_total_expenses numeric;
    v_total_transfers_in numeric;
    v_total_transfers_out numeric;
    v_total_closing numeric;
    v_reconciled boolean;
BEGIN
    IF v_actor IS NULL OR p_building_id IS NULL THEN
        RAISE EXCEPTION 'manager_only' USING ERRCODE = '42501';
    END IF;

    IF p_month IS NULL OR EXTRACT(DAY FROM p_month) <> 1 THEN
        RAISE EXCEPTION 'invalid_month_start' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.building_members member
        WHERE member.building_id = p_building_id
          AND member.user_id = v_actor
          AND member.role = 'manager'
    ) THEN
        RAISE EXCEPTION 'manager_only' USING ERRCODE = '42501';
    END IF;

    SELECT building.starting_balance
    INTO v_starting_balance
    FROM public.buildings building
    WHERE building.id = p_building_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'building_not_found' USING ERRCODE = 'P0002';
    END IF;

    -- A month is evaluated in Egypt's local timezone, including DST transitions.
    v_start := p_month::timestamp AT TIME ZONE 'Africa/Cairo';
    v_end := (p_month + INTERVAL '1 month') AT TIME ZONE 'Africa/Cairo';

    WITH account_codes(account_code) AS (
        VALUES ('main'::text), ('development'::text), ('emergency'::text)
    ),
    movements(account_code, flow, amount, occurred_at) AS (
        SELECT 'main'::text, 'income'::text, payment.amount::numeric, payment.paid_at
        FROM public.income payment
        WHERE payment.building_id = p_building_id

        UNION ALL

        SELECT COALESCE(expense.cash_account_code, 'main'), 'expense'::text,
               expense.amount::numeric, expense.spent_at
        FROM public.expenses expense
        WHERE expense.building_id = p_building_id

        UNION ALL

        SELECT transfer.from_account_code, 'transfer_out'::text,
               transfer.amount::numeric, transfer.transferred_at
        FROM public.cash_transfers transfer
        WHERE transfer.building_id = p_building_id

        UNION ALL

        SELECT transfer.to_account_code, 'transfer_in'::text,
               transfer.amount::numeric, transfer.transferred_at
        FROM public.cash_transfers transfer
        WHERE transfer.building_id = p_building_id
    ),
    aggregates AS (
        SELECT
            account.account_code,
            COALESCE(SUM(movement.amount) FILTER (
                WHERE movement.flow = 'income' AND movement.occurred_at < v_start
            ), 0)::numeric AS prior_income,
            COALESCE(SUM(movement.amount) FILTER (
                WHERE movement.flow = 'expense' AND movement.occurred_at < v_start
            ), 0)::numeric AS prior_expenses,
            COALESCE(SUM(movement.amount) FILTER (
                WHERE movement.flow = 'transfer_in' AND movement.occurred_at < v_start
            ), 0)::numeric AS prior_transfers_in,
            COALESCE(SUM(movement.amount) FILTER (
                WHERE movement.flow = 'transfer_out' AND movement.occurred_at < v_start
            ), 0)::numeric AS prior_transfers_out,
            COALESCE(SUM(movement.amount) FILTER (
                WHERE movement.flow = 'income'
                  AND movement.occurred_at >= v_start AND movement.occurred_at < v_end
            ), 0)::numeric AS period_income,
            COALESCE(SUM(movement.amount) FILTER (
                WHERE movement.flow = 'expense'
                  AND movement.occurred_at >= v_start AND movement.occurred_at < v_end
            ), 0)::numeric AS period_expenses,
            COALESCE(SUM(movement.amount) FILTER (
                WHERE movement.flow = 'transfer_in'
                  AND movement.occurred_at >= v_start AND movement.occurred_at < v_end
            ), 0)::numeric AS period_transfers_in,
            COALESCE(SUM(movement.amount) FILTER (
                WHERE movement.flow = 'transfer_out'
                  AND movement.occurred_at >= v_start AND movement.occurred_at < v_end
            ), 0)::numeric AS period_transfers_out
        FROM account_codes account
        LEFT JOIN movements movement
            ON movement.account_code = account.account_code
        GROUP BY account.account_code
    ),
    opening AS (
        SELECT
            account_code,
            ROUND((
                CASE WHEN account_code = 'main' THEN v_starting_balance ELSE 0 END
                + prior_income - prior_expenses
                + prior_transfers_in - prior_transfers_out
            ), 2) AS opening_balance,
            period_income,
            period_expenses,
            period_transfers_in,
            period_transfers_out,
            ROUND((
                period_income - period_expenses
                + period_transfers_in - period_transfers_out
            ), 2) AS net_movement
        FROM aggregates
    ),
    balances AS (
        SELECT
            opening.*,
            ROUND(opening_balance + net_movement, 2) AS closing_balance
        FROM opening
    )
    SELECT
        jsonb_object_agg(
            account_code,
            jsonb_build_object(
                'opening_balance', opening_balance,
                'income', period_income,
                'expenses', period_expenses,
                'transfers_in', period_transfers_in,
                'transfers_out', period_transfers_out,
                'net_movement', net_movement,
                'closing_balance', closing_balance
            )
        ),
        COALESCE(SUM(opening_balance), 0),
        COALESCE(SUM(period_income), 0),
        COALESCE(SUM(period_expenses), 0),
        COALESCE(SUM(period_transfers_in), 0),
        COALESCE(SUM(period_transfers_out), 0),
        COALESCE(SUM(closing_balance), 0)
    INTO
        v_accounts,
        v_total_opening,
        v_total_income,
        v_total_expenses,
        v_total_transfers_in,
        v_total_transfers_out,
        v_total_closing
    FROM balances;

    v_reconciled := ABS(
        v_total_closing - (v_total_opening + v_total_income - v_total_expenses)
    ) < 0.01;

    RETURN jsonb_build_object(
        'month', TO_CHAR(p_month, 'YYYY-MM'),
        'time_zone', 'Africa/Cairo',
        'period_start', v_start,
        'period_end_exclusive', v_end,
        'accounts', v_accounts,
        'totals', jsonb_build_object(
            'opening_balance', ROUND(v_total_opening, 2),
            'income', ROUND(v_total_income, 2),
            'expenses', ROUND(v_total_expenses, 2),
            'transfers_in', ROUND(v_total_transfers_in, 2),
            'transfers_out', ROUND(v_total_transfers_out, 2),
            'net_movement', ROUND(v_total_income - v_total_expenses, 2),
            'closing_balance', ROUND(v_total_closing, 2)
        ),
        'reconciled', v_reconciled
    );
END;
$$;

REVOKE ALL ON FUNCTION private.get_monthly_cashbox_close(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.get_monthly_cashbox_close(uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_monthly_cashbox_close(
    p_building_id uuid,
    p_month date
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
    SELECT private.get_monthly_cashbox_close(p_building_id, p_month);
$fn$;

REVOKE ALL ON FUNCTION public.get_monthly_cashbox_close(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_monthly_cashbox_close(uuid, date) TO authenticated;
