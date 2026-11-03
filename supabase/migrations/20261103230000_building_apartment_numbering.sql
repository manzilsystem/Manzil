-- Per-building sequential apartment numbering settings.
ALTER TABLE public.buildings
    ADD COLUMN IF NOT EXISTS floor_count integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS apartments_per_floor integer NOT NULL DEFAULT 0;

DO $constraints$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.buildings'::regclass
          AND conname = 'buildings_floor_layout_check'
    ) THEN
        ALTER TABLE public.buildings
            ADD CONSTRAINT buildings_floor_layout_check
            CHECK (
                (floor_count = 0 AND apartments_per_floor = 0)
                OR (floor_count BETWEEN 1 AND 100 AND apartments_per_floor BETWEEN 1 AND 100)
            );
    END IF;
END;
$constraints$;

CREATE OR REPLACE FUNCTION private.set_building_apartment_layout(
    p_building_id uuid,
    p_floor_count integer,
    p_apartments_per_floor integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_actor uuid := auth.uid();
BEGIN
    IF v_actor IS NULL OR p_building_id IS NULL
       OR NOT (
           (p_floor_count = 0 AND p_apartments_per_floor = 0)
           OR (p_floor_count BETWEEN 1 AND 100 AND p_apartments_per_floor BETWEEN 1 AND 100)
       ) THEN
        RAISE EXCEPTION 'invalid_building_apartment_layout' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.building_members bm
        WHERE bm.building_id = p_building_id
          AND bm.user_id = v_actor
          AND bm.role = 'manager'
    ) THEN
        RAISE EXCEPTION 'manager_only' USING ERRCODE = '42501';
    END IF;

    PERFORM 1 FROM public.buildings
    WHERE id = p_building_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'building_not_found' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.buildings
    SET floor_count = p_floor_count,
        apartments_per_floor = p_apartments_per_floor,
        updated_at = now()
    WHERE id = p_building_id;

    RETURN jsonb_build_object(
        'ok', true,
        'floor_count', p_floor_count,
        'apartments_per_floor', p_apartments_per_floor
    );
END;
$$;

REVOKE ALL ON FUNCTION private.set_building_apartment_layout(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.set_building_apartment_layout(uuid, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_building_apartment_layout(
    p_building_id uuid,
    p_floor_count integer,
    p_apartments_per_floor integer
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
    SELECT private.set_building_apartment_layout(p_building_id, p_floor_count, p_apartments_per_floor);
$fn$;

REVOKE ALL ON FUNCTION public.set_building_apartment_layout(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_building_apartment_layout(uuid, integer, integer) TO authenticated;
