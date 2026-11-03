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
