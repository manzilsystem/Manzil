-- Prevent notification recipients from reading rows belonging to another building.
-- A direct target_user_id is valid only when that user is linked to a resident
-- in the same building; a target_resident_id must belong to that same user/building.
CREATE OR REPLACE FUNCTION private.can_read_notification(
    p_building_id uuid,
    p_target_user_id uuid,
    p_target_resident_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
    SELECT private.is_building_manager(p_building_id)
        OR (
            private.owner_pin_change_complete()
            AND (p_target_user_id = auth.uid() OR p_target_resident_id IS NOT NULL)
            AND (p_target_user_id IS NULL OR p_target_user_id = auth.uid())
            AND EXISTS (
                SELECT 1
                FROM public.residents r
                WHERE r.building_id = p_building_id
                  AND r.user_id = auth.uid()
                  AND (
                      p_target_resident_id IS NULL
                      OR r.id = p_target_resident_id
                  )
            )
        );
$function$;
