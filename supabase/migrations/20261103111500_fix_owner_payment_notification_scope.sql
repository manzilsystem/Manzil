-- Fix owner payment notifications: target_scope is a generated column.
-- It is derived from target_user_id and must never be included in INSERT values.
CREATE OR REPLACE FUNCTION private.notify_owner_on_income_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
DECLARE
    v_user_id uuid;
    v_payment_reference text;
    v_dedupe_key text;
    v_title text;
    v_body text;
    v_total_amount numeric(12,2);
    v_months text;
    v_allocation_count integer;
BEGIN
    IF auth.uid() IS NULL OR NOT private.is_building_manager(NEW.building_id) THEN
        RETURN NEW;
    END IF;

    SELECT resident.user_id
    INTO v_user_id
    FROM public.residents resident
    WHERE resident.id = NEW.resident_id
      AND resident.building_id = NEW.building_id;

    IF v_user_id IS NULL THEN
        RETURN NEW;
    END IF;

    v_payment_reference := substring(
        COALESCE(NEW.notes, '')
        FROM '^دفعة موزعة ([A-F0-9]{12}) [(][0-9]+/[0-9]+[)]'
    );

    IF v_payment_reference IS NOT NULL THEN
        SELECT
            COALESCE(sum(payment.amount), 0),
            string_agg(DISTINCT payment.month, '، ' ORDER BY payment.month),
            count(*)::integer
        INTO v_total_amount, v_months, v_allocation_count
        FROM public.income payment
        WHERE payment.resident_id = NEW.resident_id
          AND payment.notes LIKE 'دفعة موزعة ' || v_payment_reference || ' (%';

        v_dedupe_key := 'income-batch:' || v_payment_reference;
        v_title := CASE WHEN v_allocation_count > 1 THEN 'تم تسجيل دفعة مقدمة' ELSE 'تم تسجيل تحصيل' END;
        v_body := CASE
            WHEN v_allocation_count > 1
                THEN format('تم تسجيل دفعة بقيمة %s ج.م وتوزيعها على الفترات: %s.', v_total_amount, v_months)
            ELSE format('تم تسجيل تحصيل بقيمة %s ج.م عن شهر %s.', v_total_amount, v_months)
        END;
    ELSE
        v_dedupe_key := 'income:' || NEW.id::text;
        v_title := 'تم تسجيل تحصيل';
        v_total_amount := NEW.amount;
        v_months := NEW.month;
        v_body := format('تم تسجيل تحصيل بقيمة %s ج.م عن شهر %s.', v_total_amount, v_months);
    END IF;

    INSERT INTO public.notifications (
        building_id, target_user_id, target_resident_id,
        kind, dedupe_key, title, body, severity, action_path, created_by
    )
    VALUES (
        NEW.building_id, v_user_id, NEW.resident_id,
        'payment', v_dedupe_key, v_title, v_body, 'success',
        '#ownerPaymentHistoryTitle', auth.uid()
    )
    ON CONFLICT (building_id, target_scope, dedupe_key)
    DO UPDATE SET
        title = EXCLUDED.title,
        body = EXCLUDED.body,
        severity = EXCLUDED.severity,
        read_at = NULL,
        updated_at = now();

    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.notify_owner_on_income_insert()
FROM PUBLIC, anon, authenticated, service_role;
