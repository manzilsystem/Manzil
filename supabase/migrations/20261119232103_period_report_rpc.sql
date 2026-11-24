-- Read-only, manager-scoped period report aggregation.
-- The browser keeps a local fallback for offline/read failures, but a successful
-- preview is anchored to the same database rows and accounting rules used by
-- the authoritative financial tables.

CREATE OR REPLACE FUNCTION private.get_period_report(
    p_building_id uuid,
    p_from_month date,
    p_to_month date,
    p_purpose_code text DEFAULT NULL,
    p_cash_account_code text DEFAULT NULL,
    p_resident_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_actor uuid := auth.uid();
    v_purpose text := NULLIF(btrim(COALESCE(p_purpose_code, '')), '');
    v_cash_account text := NULLIF(btrim(COALESCE(p_cash_account_code, '')), '');
    v_report jsonb;
BEGIN
    IF v_actor IS NULL OR p_building_id IS NULL
       OR NOT private.is_building_manager(p_building_id) THEN
        RAISE EXCEPTION 'manager_only' USING ERRCODE = '42501';
    END IF;

    IF p_from_month IS NULL OR p_to_month IS NULL
       OR EXTRACT(DAY FROM p_from_month) <> 1
       OR EXTRACT(DAY FROM p_to_month) <> 1
       OR p_from_month > p_to_month
       OR (
           (EXTRACT(YEAR FROM p_to_month)::integer - EXTRACT(YEAR FROM p_from_month)::integer) * 12
           + EXTRACT(MONTH FROM p_to_month)::integer - EXTRACT(MONTH FROM p_from_month)::integer + 1
       ) > 60 THEN
        RAISE EXCEPTION 'invalid_period_range' USING ERRCODE = '22023';
    END IF;

    IF v_purpose IS NOT NULL AND v_purpose NOT IN (
        'subscription', 'services', 'development', 'emergency',
        'penalty', 'donation', 'other', 'settlement'
    ) THEN
        RAISE EXCEPTION 'invalid_report_purpose' USING ERRCODE = '22023';
    END IF;

    IF v_cash_account IS NOT NULL
       AND v_cash_account NOT IN ('main', 'development', 'emergency') THEN
        RAISE EXCEPTION 'invalid_report_cash_account' USING ERRCODE = '22023';
    END IF;

    IF p_resident_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM public.residents resident
        WHERE resident.id = p_resident_id
          AND resident.building_id = p_building_id
    ) THEN
        RAISE EXCEPTION 'resident_not_found' USING ERRCODE = 'P0002';
    END IF;

    WITH month_list AS (
        SELECT generate_series(p_from_month, p_to_month, interval '1 month')::date AS month_key
    ),
    income_rows AS (
        SELECT
            income.id,
            income.resident_id,
            income.amount,
            income.payment_method,
            income.settlement_adjustment_id,
            COALESCE(NULLIF(btrim(income.purpose_code), ''), 'subscription') AS purpose_code,
            COALESCE(NULLIF(btrim(income.cash_account_code), ''), 'main') AS cash_account_code,
            CASE
                WHEN btrim(income.month) ~ '^\d{4}-(0[1-9]|1[0-2])(?:-01)?$'
                    THEN to_date(left(btrim(income.month), 7) || '-01', 'YYYY-MM-DD')
                ELSE CASE
                    WHEN split_part(btrim(income.month), ' ', 2) ~ '^\d{4}$'
                     AND CASE split_part(btrim(income.month), ' ', 1)
                        WHEN 'يناير' THEN 1
                        WHEN 'فبراير' THEN 2
                        WHEN 'مارس' THEN 3
                        WHEN 'أبريل' THEN 4
                        WHEN 'مايو' THEN 5
                        WHEN 'يونيو' THEN 6
                        WHEN 'يوليو' THEN 7
                        WHEN 'أغسطس' THEN 8
                        WHEN 'سبتمبر' THEN 9
                        WHEN 'أكتوبر' THEN 10
                        WHEN 'نوفمبر' THEN 11
                        WHEN 'ديسمبر' THEN 12
                        ELSE NULL
                    END IS NOT NULL
                    THEN make_date(
                        split_part(btrim(income.month), ' ', 2)::integer,
                        CASE split_part(btrim(income.month), ' ', 1)
                            WHEN 'يناير' THEN 1
                            WHEN 'فبراير' THEN 2
                            WHEN 'مارس' THEN 3
                            WHEN 'أبريل' THEN 4
                            WHEN 'مايو' THEN 5
                            WHEN 'يونيو' THEN 6
                            WHEN 'يوليو' THEN 7
                            WHEN 'أغسطس' THEN 8
                            WHEN 'سبتمبر' THEN 9
                            WHEN 'أكتوبر' THEN 10
                            WHEN 'نوفمبر' THEN 11
                            WHEN 'ديسمبر' THEN 12
                            ELSE NULL
                        END,
                        1
                    )
                    ELSE NULL
                END
            END AS month_key
        FROM public.income income
        WHERE income.building_id = p_building_id
    ),
    expense_rows AS (
        SELECT
            expense.amount,
            COALESCE(NULLIF(btrim(expense.cash_account_code), ''), 'main') AS cash_account_code,
            CASE
                WHEN btrim(expense.month) ~ '^\d{4}-(0[1-9]|1[0-2])(?:-01)?$'
                    THEN to_date(left(btrim(expense.month), 7) || '-01', 'YYYY-MM-DD')
                ELSE CASE
                    WHEN split_part(btrim(expense.month), ' ', 2) ~ '^\d{4}$'
                     AND CASE split_part(btrim(expense.month), ' ', 1)
                        WHEN 'يناير' THEN 1
                        WHEN 'فبراير' THEN 2
                        WHEN 'مارس' THEN 3
                        WHEN 'أبريل' THEN 4
                        WHEN 'مايو' THEN 5
                        WHEN 'يونيو' THEN 6
                        WHEN 'يوليو' THEN 7
                        WHEN 'أغسطس' THEN 8
                        WHEN 'سبتمبر' THEN 9
                        WHEN 'أكتوبر' THEN 10
                        WHEN 'نوفمبر' THEN 11
                        WHEN 'ديسمبر' THEN 12
                        ELSE NULL
                    END IS NOT NULL
                    THEN make_date(
                        split_part(btrim(expense.month), ' ', 2)::integer,
                        CASE split_part(btrim(expense.month), ' ', 1)
                            WHEN 'يناير' THEN 1
                            WHEN 'فبراير' THEN 2
                            WHEN 'مارس' THEN 3
                            WHEN 'أبريل' THEN 4
                            WHEN 'مايو' THEN 5
                            WHEN 'يونيو' THEN 6
                            WHEN 'يوليو' THEN 7
                            WHEN 'أغسطس' THEN 8
                            WHEN 'سبتمبر' THEN 9
                            WHEN 'أكتوبر' THEN 10
                            WHEN 'نوفمبر' THEN 11
                            WHEN 'ديسمبر' THEN 12
                            ELSE NULL
                        END,
                        1
                    )
                    ELSE NULL
                END
            END AS month_key
        FROM public.expenses expense
        WHERE expense.building_id = p_building_id
    ),
    filtered_income AS (
        SELECT income_rows.*
        FROM income_rows
        WHERE income_rows.month_key BETWEEN p_from_month AND p_to_month
          AND (v_purpose IS NULL OR income_rows.purpose_code = v_purpose)
          AND (v_cash_account IS NULL OR income_rows.cash_account_code = v_cash_account)
          AND (p_resident_id IS NULL OR income_rows.resident_id = p_resident_id)
    ),
    scoped_resident_months AS (
        SELECT
            month_list.month_key,
            resident.id AS resident_id,
            round((
                CASE
                    WHEN EXISTS (
                        SELECT 1
                        FROM public.resident_subscription_rates rate_exists
                        WHERE rate_exists.resident_id = resident.id
                    ) THEN COALESCE(rate.monthly_amount, 0)
                    ELSE COALESCE(resident.monthly_amount, building.default_subscription, 0)
                END
            ) * 100)::bigint AS gross_cents,
            settlement.id AS settlement_id,
            round(COALESCE(settlement.amount, 0) * 100)::bigint AS settlement_cents,
            round(COALESCE(adjustments.amount, 0) * 100)::bigint AS adjustment_cents
        FROM month_list
        CROSS JOIN public.buildings building
        JOIN public.residents resident
          ON resident.building_id = building.id
         AND resident.building_id = p_building_id
         AND (p_resident_id IS NULL OR resident.id = p_resident_id)
         AND month_list.month_key >= COALESCE(
             resident.billing_start_month,
             date_trunc('month', resident.created_at)::date
         )
        LEFT JOIN LATERAL (
            SELECT rate.monthly_amount
            FROM public.resident_subscription_rates rate
            WHERE rate.building_id = p_building_id
              AND rate.resident_id = resident.id
              AND rate.effective_month <= month_list.month_key
            ORDER BY rate.effective_month DESC
            LIMIT 1
        ) rate ON true
        LEFT JOIN LATERAL (
            SELECT adjustment.id, adjustment.amount
            FROM public.resident_adjustments adjustment
            WHERE adjustment.building_id = p_building_id
              AND adjustment.resident_id = resident.id
              AND adjustment.effective_month = month_list.month_key
              AND adjustment.kind = 'settlement'
            LIMIT 1
        ) settlement ON true
        LEFT JOIN LATERAL (
            SELECT SUM(adjustment.amount) AS amount
            FROM public.resident_adjustments adjustment
            WHERE adjustment.building_id = p_building_id
              AND adjustment.resident_id = resident.id
              AND adjustment.effective_month = month_list.month_key
              AND adjustment.kind IN ('waiver', 'discount')
        ) adjustments ON true
        WHERE building.id = p_building_id
    ),
    dues AS (
        SELECT
            scoped_resident_months.month_key,
            CASE
                WHEN scoped_resident_months.settlement_id IS NOT NULL
                    THEN GREATEST(0, scoped_resident_months.gross_cents - scoped_resident_months.settlement_cents)
                ELSE GREATEST(0, scoped_resident_months.adjustment_cents)
            END AS adjustment_cents,
            CASE
                WHEN scoped_resident_months.settlement_id IS NOT NULL
                    THEN GREATEST(0, scoped_resident_months.settlement_cents)
                ELSE GREATEST(0, scoped_resident_months.gross_cents - scoped_resident_months.adjustment_cents)
            END AS expected_cents,
            GREATEST(0, (
                CASE
                    WHEN scoped_resident_months.settlement_id IS NOT NULL
                        THEN scoped_resident_months.settlement_cents
                    ELSE scoped_resident_months.gross_cents - scoped_resident_months.adjustment_cents
                END
            ) - COALESCE((
                SELECT SUM(income_rows.amount * 100)::bigint
                FROM income_rows
                WHERE income_rows.resident_id = scoped_resident_months.resident_id
                  AND income_rows.month_key = scoped_resident_months.month_key
                  AND (
                      (scoped_resident_months.settlement_id IS NOT NULL
                       AND income_rows.settlement_adjustment_id = scoped_resident_months.settlement_id)
                      OR (scoped_resident_months.settlement_id IS NULL
                          AND income_rows.purpose_code = 'subscription')
                  )
            ), 0)) AS outstanding_cents
        FROM scoped_resident_months
    ),
    month_rows AS (
        SELECT
            month_list.month_key,
            COALESCE((SELECT SUM(filtered.amount * 100)::bigint FROM filtered_income filtered WHERE filtered.month_key = month_list.month_key), 0) AS total_income_cents,
            COALESCE((SELECT COUNT(*) FROM filtered_income filtered WHERE filtered.month_key = month_list.month_key), 0)::integer AS movement_count,
            COALESCE((SELECT SUM(filtered.amount * 100)::bigint FROM filtered_income filtered WHERE filtered.month_key = month_list.month_key AND filtered.purpose_code IN ('subscription', 'settlement')), 0) AS collected_cents,
            COALESCE((SELECT SUM(expense.amount * 100)::bigint FROM expense_rows expense WHERE expense.month_key = month_list.month_key AND (v_cash_account IS NULL OR expense.cash_account_code = v_cash_account)), 0) AS expense_cents,
            CASE WHEN v_purpose IS NULL OR v_purpose = 'subscription' THEN COALESCE((SELECT SUM(dues.expected_cents) FROM dues WHERE dues.month_key = month_list.month_key), 0) ELSE 0 END AS expected_cents,
            CASE WHEN v_purpose IS NULL OR v_purpose = 'subscription' THEN COALESCE((SELECT SUM(dues.adjustment_cents) FROM dues WHERE dues.month_key = month_list.month_key), 0) ELSE 0 END AS adjustment_cents,
            CASE WHEN v_purpose IS NULL OR v_purpose = 'subscription' THEN COALESCE((SELECT SUM(dues.outstanding_cents) FROM dues WHERE dues.month_key = month_list.month_key), 0) ELSE 0 END AS outstanding_cents
        FROM month_list
    ),
    month_json AS (
        SELECT jsonb_agg(jsonb_build_object(
            'key', month_rows.month_key,
            'expectedCents', month_rows.expected_cents,
            'adjustmentCents', month_rows.adjustment_cents,
            'totalIncomeCents', month_rows.total_income_cents,
            'movementCount', month_rows.movement_count,
            'collectedCents', month_rows.collected_cents,
            'otherIncomeCents', month_rows.total_income_cents - month_rows.collected_cents,
            'outstandingCents', month_rows.outstanding_cents,
            'expenseCents', month_rows.expense_cents,
            'netCents', month_rows.total_income_cents - month_rows.expense_cents,
            'rate', CASE
                WHEN (v_purpose IS NULL OR v_purpose = 'subscription') AND month_rows.expected_cents > 0
                    THEN round((month_rows.collected_cents::numeric / month_rows.expected_cents::numeric) * 100)
                ELSE NULL
            END
        ) ORDER BY month_rows.month_key) AS value
        FROM month_rows
    ),
    method_groups AS (
        SELECT
            COALESCE(NULLIF(btrim(filtered_income.payment_method), ''), 'unknown') AS code,
            COUNT(*)::integer AS movement_count,
            round(SUM(filtered_income.amount) * 100)::bigint AS cents
        FROM filtered_income
        GROUP BY COALESCE(NULLIF(btrim(filtered_income.payment_method), ''), 'unknown')
    ),
    method_rows AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'code', method_groups.code,
            'count', method_groups.movement_count,
            'cents', method_groups.cents,
            'share', CASE
                WHEN (SELECT SUM(total.cents) FROM method_groups total) > 0
                    THEN round((method_groups.cents::numeric / (SELECT SUM(total.cents) FROM method_groups)) * 100)
                ELSE NULL
            END
        ) ORDER BY method_groups.cents DESC), '[]'::jsonb) AS value
        FROM method_groups
    ),
    purpose_groups AS (
        SELECT
            filtered_income.purpose_code AS code,
            COUNT(*)::integer AS movement_count,
            round(SUM(filtered_income.amount) * 100)::bigint AS cents
        FROM filtered_income
        GROUP BY filtered_income.purpose_code
    ),
    purpose_rows AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'code', purpose_groups.code,
            'count', purpose_groups.movement_count,
            'cents', purpose_groups.cents
        ) ORDER BY purpose_groups.cents DESC), '[]'::jsonb) AS value
        FROM purpose_groups
    )
    SELECT jsonb_build_object(
        'months', COALESCE((SELECT value FROM month_json), '[]'::jsonb),
        'methods', COALESCE((SELECT value FROM method_rows), '[]'::jsonb),
        'purposes', COALESCE((SELECT value FROM purpose_rows), '[]'::jsonb),
        'generatedAt', now()
    )
    INTO v_report;

    RETURN v_report;
END;
$$;

REVOKE ALL ON FUNCTION private.get_period_report(uuid, date, date, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.get_period_report(uuid, date, date, text, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_period_report(
    p_building_id uuid,
    p_from_month date,
    p_to_month date,
    p_purpose_code text DEFAULT NULL,
    p_cash_account_code text DEFAULT NULL,
    p_resident_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
    SELECT private.get_period_report(
        p_building_id,
        p_from_month,
        p_to_month,
        p_purpose_code,
        p_cash_account_code,
        p_resident_id
    );
$fn$;

REVOKE ALL ON FUNCTION public.get_period_report(uuid, date, date, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_period_report(uuid, date, date, text, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.get_period_report(uuid, date, date, text, text, uuid)
IS 'Manager-only read model for the period report; validates building scope and returns no write capability.';
