-- Settlement months count earlier subscription payments toward the agreement.
--
-- Owner-approved product rule (2026-11-26): when a settlement is agreed for a
-- month that already has subscription payments, those payments count against
-- the settled amount so the resident is never charged twice. This migration:
--   1. drops the settlement_conflicts_with_subscription_income ban from
--      private.persist_building_snapshot;
--   2. redefines settlement_payment_exceeds_agreement so the cap is
--      settlement-linked payments + that month's subscription payments
--      <= settlement.amount;
--   3. aligns private.get_period_report so a settled month's outstanding
--      subtracts both payment kinds, matching the client.
-- Bodies are rewritten with pg_get_functiondef plus narrowly scoped,
-- fail-closed replacements, mirroring 20261120090000_period_report_method_share_fix.

DO $migration$
DECLARE
    v_snapshot regprocedure := 'private.persist_building_snapshot(uuid,bigint,uuid,jsonb)'::regprocedure;
    v_report regprocedure := 'private.get_period_report(uuid,date,date,text,text,uuid)'::regprocedure;
    v_definition text;
    v_conflict text := $pattern$    IF EXISTS (
        SELECT 1
        FROM public.resident_adjustments settlement
        JOIN public.income payment
          ON payment.building_id = settlement.building_id
         AND payment.resident_id = settlement.resident_id
         AND payment.purpose_code = 'subscription'
         AND CASE split_part(btrim(payment.month), ' ', 1)
             WHEN 'يناير' THEN 1 WHEN 'فبراير' THEN 2 WHEN 'مارس' THEN 3
             WHEN 'أبريل' THEN 4 WHEN 'مايو' THEN 5 WHEN 'يونيو' THEN 6
             WHEN 'يوليو' THEN 7 WHEN 'أغسطس' THEN 8 WHEN 'سبتمبر' THEN 9
             WHEN 'أكتوبر' THEN 10 WHEN 'نوفمبر' THEN 11 WHEN 'ديسمبر' THEN 12
             ELSE NULL END = EXTRACT(MONTH FROM settlement.effective_month)
         AND split_part(btrim(payment.month), ' ', 2) = EXTRACT(YEAR FROM settlement.effective_month)::text
        WHERE settlement.building_id = p_building_id
          AND settlement.kind = 'settlement'
    ) THEN
        RAISE EXCEPTION 'settlement_conflicts_with_subscription_income' USING ERRCODE = '22023';
    END IF;$pattern$;
    v_conflict_fix text := $pattern$    -- Product rule (owner-approved 2026-11-26): subscription payments recorded for a
    -- settled month count toward the agreement instead of conflicting with it. The
    -- combined cap below (settlement payments + earlier subscription payments
    -- <= settlement.amount) is what now prevents double charging.$pattern$;
    v_cap text := $pattern$        GROUP BY settlement.id, settlement.amount
        HAVING SUM(payment.amount) > settlement.amount$pattern$;
    v_cap_fix text := $pattern$        GROUP BY settlement.id, settlement.amount, settlement.resident_id, settlement.effective_month
        HAVING SUM(payment.amount) + COALESCE((
            SELECT SUM(sub_payment.amount)
            FROM public.income sub_payment
            WHERE sub_payment.building_id = p_building_id
              AND sub_payment.resident_id = settlement.resident_id
              AND sub_payment.purpose_code = 'subscription'
              AND CASE split_part(btrim(sub_payment.month), ' ', 1)
                  WHEN 'يناير' THEN 1 WHEN 'فبراير' THEN 2 WHEN 'مارس' THEN 3
                  WHEN 'أبريل' THEN 4 WHEN 'مايو' THEN 5 WHEN 'يونيو' THEN 6
                  WHEN 'يوليو' THEN 7 WHEN 'أغسطس' THEN 8 WHEN 'سبتمبر' THEN 9
                  WHEN 'أكتوبر' THEN 10 WHEN 'نوفمبر' THEN 11 WHEN 'ديسمبر' THEN 12
                  ELSE NULL END = EXTRACT(MONTH FROM settlement.effective_month)
              AND split_part(btrim(sub_payment.month), ' ', 2) = EXTRACT(YEAR FROM settlement.effective_month)::text
        ), 0) > settlement.amount$pattern$;
    v_outstanding text := $pattern$                  AND (
                      (scoped_resident_months.settlement_id IS NOT NULL
                       AND income_rows.settlement_adjustment_id = scoped_resident_months.settlement_id)
                      OR (scoped_resident_months.settlement_id IS NULL
                          AND income_rows.purpose_code = 'subscription')
                  )$pattern$;
    v_outstanding_fix text := $pattern$                  AND (
                      income_rows.purpose_code = 'subscription'
                      OR (scoped_resident_months.settlement_id IS NOT NULL
                          AND income_rows.settlement_adjustment_id = scoped_resident_months.settlement_id)
                  )$pattern$;
BEGIN
    -- Idempotent: each replacement applies only when its old block is present,
    -- passes when the new block is already there, and fails closed otherwise.
    SELECT pg_get_functiondef(v_snapshot) INTO v_definition;
    IF v_definition IS NULL THEN
        RAISE EXCEPTION 'private.persist_building_snapshot not found; refusing an unsafe rewrite';
    END IF;
    IF position(v_conflict IN v_definition) > 0 THEN
        v_definition := replace(v_definition, v_conflict, v_conflict_fix);
    ELSIF position(v_conflict_fix IN v_definition) = 0 THEN
        RAISE EXCEPTION 'unexpected definition for private.persist_building_snapshot; refusing an unsafe rewrite';
    END IF;
    IF position(v_cap IN v_definition) > 0 THEN
        v_definition := replace(v_definition, v_cap, v_cap_fix);
    ELSIF position(v_cap_fix IN v_definition) = 0 THEN
        RAISE EXCEPTION 'unexpected definition for private.persist_building_snapshot; refusing an unsafe rewrite';
    END IF;
    EXECUTE v_definition;

    SELECT pg_get_functiondef(v_report) INTO v_definition;
    IF v_definition IS NULL THEN
        RAISE EXCEPTION 'private.get_period_report not found; refusing an unsafe rewrite';
    END IF;
    IF position(v_outstanding IN v_definition) > 0 THEN
        v_definition := replace(v_definition, v_outstanding, v_outstanding_fix);
    ELSIF position(v_outstanding_fix IN v_definition) = 0 THEN
        RAISE EXCEPTION 'unexpected definition for private.get_period_report; refusing an unsafe rewrite';
    END IF;
    EXECUTE v_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION private.persist_building_snapshot(uuid, bigint, uuid, jsonb)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.persist_building_snapshot(uuid, bigint, uuid, jsonb)
    TO authenticated;

REVOKE ALL ON FUNCTION private.get_period_report(uuid, date, date, text, text, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.get_period_report(uuid, date, date, text, text, uuid)
    TO authenticated;
