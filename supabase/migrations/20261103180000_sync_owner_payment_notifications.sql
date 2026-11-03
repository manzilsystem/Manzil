-- Keep owner payment notifications consistent when an income row changes or is removed.
CREATE OR REPLACE FUNCTION private.sync_owner_income_notification(
    p_building_id uuid,
    p_resident_id uuid,
    p_income_id uuid,
    p_notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
DECLARE
    v_reference text;
    v_dedupe_key text;
    v_user_id uuid;
    v_total_amount numeric(12,2);
    v_months text;
    v_allocation_count integer;
    v_title text;
    v_body text;
BEGIN
    v_reference := substring(
        COALESCE(p_notes, '')
        FROM '^دفعة موزعة ([A-F0-9]{12}) [(][0-9]+/[0-9]+[)]'
    );

    IF v_reference IS NOT NULL THEN
        v_dedupe_key := 'income-batch:' || v_reference;
        SELECT COALESCE(sum(payment.amount), 0),
               string_agg(DISTINCT payment.month, '، ' ORDER BY payment.month),
               count(*)::integer
        INTO v_total_amount, v_months, v_allocation_count
        FROM public.income payment
        WHERE payment.building_id = p_building_id
          AND payment.resident_id = p_resident_id
          AND payment.notes LIKE 'دفعة موزعة ' || v_reference || ' (%';
    ELSE
        v_dedupe_key := 'income:' || p_income_id::text;
        SELECT payment.amount, payment.month, 1
        INTO v_total_amount, v_months, v_allocation_count
        FROM public.income payment
        WHERE payment.id = p_income_id
          AND payment.building_id = p_building_id
          AND payment.resident_id = p_resident_id;
    END IF;

    IF COALESCE(v_allocation_count, 0) = 0 THEN
        DELETE FROM public.notifications
        WHERE building_id = p_building_id
          AND target_resident_id = p_resident_id
          AND dedupe_key = v_dedupe_key;
        RETURN;
    END IF;

    SELECT resident.user_id INTO v_user_id
    FROM public.residents resident
    WHERE resident.id = p_resident_id
      AND resident.building_id = p_building_id;

    IF v_user_id IS NULL THEN
        DELETE FROM public.notifications
        WHERE building_id = p_building_id
          AND target_resident_id = p_resident_id
          AND dedupe_key = v_dedupe_key;
        RETURN;
    END IF;

    v_title := CASE WHEN v_allocation_count > 1
        THEN 'تم تسجيل دفعة مقدمة' ELSE 'تم تسجيل تحصيل' END;
    v_body := CASE
        WHEN v_allocation_count > 1
            THEN format('تم تسجيل دفعة بقيمة %s ج.م وتوزيعها على الفترات: %s.', v_total_amount, v_months)
        ELSE format('تم تسجيل تحصيل بقيمة %s ج.م عن شهر %s.', v_total_amount, v_months)
    END;

    INSERT INTO public.notifications (
        building_id, target_user_id, target_resident_id, kind, dedupe_key,
        title, body, severity, action_path, created_by
    )
    VALUES (
        p_building_id, v_user_id, p_resident_id, 'payment', v_dedupe_key,
        v_title, v_body, 'success', '#ownerPaymentHistoryTitle', auth.uid()
    )
    ON CONFLICT (building_id, target_scope, dedupe_key)
    DO UPDATE SET
        title = EXCLUDED.title,
        body = EXCLUDED.body,
        severity = EXCLUDED.severity,
        updated_at = now();
END;
$function$;

CREATE OR REPLACE FUNCTION private.sync_owner_income_notification_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
DECLARE
    v_old_reference text;
    v_new_reference text;
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM private.sync_owner_income_notification(
            OLD.building_id, OLD.resident_id, OLD.id, OLD.notes
        );
        RETURN OLD;
    END IF;

    v_old_reference := substring(
        COALESCE(OLD.notes, '')
        FROM '^دفعة موزعة ([A-F0-9]{12}) [(][0-9]+/[0-9]+[)]'
    );
    v_new_reference := substring(
        COALESCE(NEW.notes, '')
        FROM '^دفعة موزعة ([A-F0-9]{12}) [(][0-9]+/[0-9]+[)]'
    );

    IF OLD.building_id IS DISTINCT FROM NEW.building_id
       OR OLD.resident_id IS DISTINCT FROM NEW.resident_id
       OR v_old_reference IS DISTINCT FROM v_new_reference
       OR (v_old_reference IS NULL AND OLD.id IS DISTINCT FROM NEW.id) THEN
        PERFORM private.sync_owner_income_notification(
            OLD.building_id, OLD.resident_id, OLD.id, OLD.notes
        );
    END IF;

    PERFORM private.sync_owner_income_notification(
        NEW.building_id, NEW.resident_id, NEW.id, NEW.notes
    );
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.sync_owner_income_notification(uuid, uuid, uuid, text)
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.sync_owner_income_notification_after_change()
    FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS sync_owner_income_notification_after_delete ON public.income;
CREATE TRIGGER sync_owner_income_notification_after_delete
AFTER DELETE ON public.income
FOR EACH ROW
EXECUTE FUNCTION private.sync_owner_income_notification_after_change();

DROP TRIGGER IF EXISTS sync_owner_income_notification_after_update ON public.income;
CREATE TRIGGER sync_owner_income_notification_after_update
AFTER UPDATE OF building_id, resident_id, amount, month, notes ON public.income
FOR EACH ROW
WHEN (
    OLD.building_id IS DISTINCT FROM NEW.building_id
    OR OLD.resident_id IS DISTINCT FROM NEW.resident_id
    OR OLD.amount IS DISTINCT FROM NEW.amount
    OR OLD.month IS DISTINCT FROM NEW.month
    OR OLD.notes IS DISTINCT FROM NEW.notes
)
EXECUTE FUNCTION private.sync_owner_income_notification_after_change();
