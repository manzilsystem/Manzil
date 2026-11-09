-- Notify the building manager when an expense is recorded, changed, or removed.
-- Manager notifications are building-scoped (no target user), so they reuse the
-- generated zero-uuid target_scope and stay visible only to building managers.

CREATE OR REPLACE FUNCTION private.sync_manager_expense_notification(
    p_building_id uuid,
    p_expense_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
DECLARE
    v_dedupe_key text;
    v_amount numeric(12,2);
    v_expense_title text;
    v_month text;
BEGIN
    v_dedupe_key := 'expense:' || p_expense_id::text;

    SELECT expense.amount, expense.title, expense.month
    INTO v_amount, v_expense_title, v_month
    FROM public.expenses expense
    WHERE expense.id = p_expense_id
      AND expense.building_id = p_building_id;

    IF v_amount IS NULL THEN
        DELETE FROM public.notifications
        WHERE building_id = p_building_id
          AND target_user_id IS NULL
          AND target_resident_id IS NULL
          AND dedupe_key = v_dedupe_key;
        RETURN;
    END IF;

    INSERT INTO public.notifications (
        building_id, target_user_id, target_resident_id, kind, dedupe_key,
        title, body, severity, action_path, created_by
    )
    VALUES (
        p_building_id, NULL, NULL, 'expense', v_dedupe_key,
        'تم تسجيل مصروف',
        format('تم تسجيل مصروف بقيمة %s ج.م — %s لشهر %s.', v_amount, v_expense_title, v_month),
        'info', '#tab-expenses', auth.uid()
    )
    ON CONFLICT (building_id, target_scope, dedupe_key)
    DO UPDATE SET
        title = EXCLUDED.title,
        body = EXCLUDED.body,
        severity = EXCLUDED.severity,
        updated_at = now();
END;
$function$;

CREATE OR REPLACE FUNCTION private.sync_manager_expense_notification_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM private.sync_manager_expense_notification(OLD.building_id, OLD.id);
        RETURN OLD;
    END IF;

    IF auth.uid() IS NULL OR NOT private.is_building_manager(NEW.building_id) THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.building_id IS DISTINCT FROM NEW.building_id THEN
        PERFORM private.sync_manager_expense_notification(OLD.building_id, OLD.id);
    END IF;

    PERFORM private.sync_manager_expense_notification(NEW.building_id, NEW.id);
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.sync_manager_expense_notification(uuid, uuid)
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.sync_manager_expense_notification_after_change()
    FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS sync_manager_expense_notification_after_insert ON public.expenses;
CREATE TRIGGER sync_manager_expense_notification_after_insert
AFTER INSERT ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION private.sync_manager_expense_notification_after_change();

DROP TRIGGER IF EXISTS sync_manager_expense_notification_after_delete ON public.expenses;
CREATE TRIGGER sync_manager_expense_notification_after_delete
AFTER DELETE ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION private.sync_manager_expense_notification_after_change();

DROP TRIGGER IF EXISTS sync_manager_expense_notification_after_update ON public.expenses;
CREATE TRIGGER sync_manager_expense_notification_after_update
AFTER UPDATE OF building_id, title, amount, month ON public.expenses
FOR EACH ROW
WHEN (
    OLD.building_id IS DISTINCT FROM NEW.building_id
    OR OLD.title IS DISTINCT FROM NEW.title
    OR OLD.amount IS DISTINCT FROM NEW.amount
    OR OLD.month IS DISTINCT FROM NEW.month
)
EXECUTE FUNCTION private.sync_manager_expense_notification_after_change();

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
