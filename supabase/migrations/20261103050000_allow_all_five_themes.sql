ALTER TABLE public.buildings
    DROP CONSTRAINT IF EXISTS buildings_current_theme_check;

ALTER TABLE public.buildings
    ADD CONSTRAINT buildings_current_theme_check
    CHECK (current_theme IN ('dark', 'light', 'emerald', 'ocean', 'sand'));
