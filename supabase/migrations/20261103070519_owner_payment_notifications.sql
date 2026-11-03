-- Notify the linked apartment owner when a manager records a collection.
-- Keep notification content immutable for owners; only read_at is owner-editable.
CREATE OR REPLACE FUNCTION public.protect_notification_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
BEGIN
    IF NOT private.is_building_manager(OLD.building_id) THEN
        IF NEW.id IS DISTINCT FROM OLD.id
           OR NEW.building_id IS DISTINCT FROM OLD.building_id
           OR NEW.target_user_id IS DISTINCT FROM OLD.target_user_id
           OR NEW.target_resident_id IS DISTINCT FROM OLD.target_resident_id
           OR NEW.target_scope IS DISTINCT FROM OLD.target_scope
           OR NEW.kind IS DISTINCT FROM OLD.kind
           OR NEW.dedupe_key IS DISTINCT FROM OLD.dedupe_key
           OR NEW.title IS DISTINCT FROM OLD.title
           OR NEW.body IS DISTINCT FROM OLD.body
           OR NEW.severity IS DISTINCT FROM OLD.severity
           OR NEW.action_path IS DISTINCT FROM OLD.action_path
           OR NEW.created_by IS DISTINCT FROM OLD.created_by
           OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
            RAISE EXCEPTION 'notification content is immutable for non-managers'
                USING ERRCODE = '42501';
        END IF;
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.protect_notification_fields() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS protect_notification_fields ON public.notifications;
CREATE TRIGGER protect_notification_fields
BEFORE UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.protect_notification_fields();

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
        building_id, target_user_id, target_resident_id, target_scope,
        kind, dedupe_key, title, body, severity, action_path, created_by
    )
    VALUES (
        NEW.building_id, v_user_id, NEW.resident_id, NEW.resident_id,
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

REVOKE ALL ON FUNCTION private.notify_owner_on_income_insert() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS notify_owner_on_income_insert ON public.income;
CREATE TRIGGER notify_owner_on_income_insert
AFTER INSERT ON public.income
FOR EACH ROW EXECUTE FUNCTION private.notify_owner_on_income_insert();

ALTER TABLE public.notifications REPLICA IDENTITY FULL;

DO $publication$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (
           SELECT 1 FROM pg_publication_tables
           WHERE pubname = 'supabase_realtime'
             AND schemaname = 'public'
             AND tablename = 'notifications'
       ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
END;
$publication$;
