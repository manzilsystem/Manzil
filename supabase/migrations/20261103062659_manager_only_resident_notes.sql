-- Keep manager-only apartment notes out of the owner-readable residents row.
-- Existing values are copied before the legacy column is cleared.
CREATE TABLE public.resident_internal_notes (
    resident_id uuid PRIMARY KEY REFERENCES public.residents(id) ON DELETE CASCADE,
    building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
    notes text NOT NULL DEFAULT '',
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT resident_internal_notes_building_resident_unique UNIQUE (building_id, resident_id)
);

ALTER TABLE public.resident_internal_notes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.resident_internal_notes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.resident_internal_notes TO authenticated;

CREATE POLICY resident_internal_notes_manager_select
ON public.resident_internal_notes
FOR SELECT
TO authenticated
USING (private.is_building_manager(building_id));

INSERT INTO public.resident_internal_notes (resident_id, building_id, notes)
SELECT r.id, r.building_id, r.notes
FROM public.residents r
WHERE NULLIF(btrim(r.notes), '') IS NOT NULL
ON CONFLICT (resident_id) DO UPDATE
SET building_id = EXCLUDED.building_id,
    notes = EXCLUDED.notes,
    updated_at = now();

UPDATE public.residents
SET notes = NULL
WHERE notes IS NOT NULL;

CREATE OR REPLACE FUNCTION private.sync_resident_internal_note()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
    -- The nested update below reaches this trigger once more with NULL.
    IF NEW.notes IS NULL THEN
        RETURN NEW;
    END IF;

    IF NULLIF(btrim(NEW.notes), '') IS NULL THEN
        DELETE FROM public.resident_internal_notes
        WHERE resident_id = NEW.id;
    ELSE
        INSERT INTO public.resident_internal_notes (resident_id, building_id, notes)
        VALUES (NEW.id, NEW.building_id, NEW.notes)
        ON CONFLICT (resident_id) DO UPDATE
        SET building_id = EXCLUDED.building_id,
            notes = EXCLUDED.notes,
            updated_at = now();
    END IF;

    -- Leave no internal text on the owner-readable residents table.
    UPDATE public.residents
    SET notes = NULL
    WHERE id = NEW.id AND notes IS NOT NULL;

    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.sync_resident_internal_note() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS residents_sync_internal_note ON public.residents;
CREATE TRIGGER residents_sync_internal_note
AFTER INSERT OR UPDATE OF notes ON public.residents
FOR EACH ROW
EXECUTE FUNCTION private.sync_resident_internal_note();

CREATE INDEX resident_internal_notes_building_idx
ON public.resident_internal_notes (building_id);
