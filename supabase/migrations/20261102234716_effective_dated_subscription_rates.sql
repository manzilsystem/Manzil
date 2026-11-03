CREATE TABLE IF NOT EXISTS public.resident_subscription_rates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
    resident_id uuid NOT NULL REFERENCES public.residents(id) ON DELETE CASCADE,
    effective_month date NOT NULL CHECK (date_trunc('month', effective_month)::date = effective_month),
    monthly_amount numeric(12,2) NOT NULL CHECK (monthly_amount >= 0),
    created_by uuid NOT NULL REFERENCES auth.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (resident_id, effective_month)
);

ALTER TABLE public.resident_subscription_rates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.resident_subscription_rates FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.resident_subscription_rates TO authenticated;

CREATE POLICY resident_subscription_rates_member_read
ON public.resident_subscription_rates FOR SELECT TO authenticated
USING (EXISTS (
    SELECT 1 FROM public.building_members bm
    WHERE bm.building_id = resident_subscription_rates.building_id
      AND bm.user_id = auth.uid()
));

CREATE OR REPLACE FUNCTION public.set_resident_subscription_rate(
    p_building_id uuid,
    p_resident_id uuid,
    p_effective_month date,
    p_monthly_amount numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_actor uuid := auth.uid();
BEGIN
    IF v_actor IS NULL OR p_building_id IS NULL OR p_resident_id IS NULL
       OR p_effective_month IS NULL
       OR date_trunc('month', p_effective_month)::date <> p_effective_month
       OR p_monthly_amount IS NULL OR p_monthly_amount < 0 THEN
        RAISE EXCEPTION 'invalid_subscription_rate' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.building_members
        WHERE building_id = p_building_id AND user_id = v_actor AND role = 'manager'
    ) THEN
        RAISE EXCEPTION 'manager_only' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.residents
        WHERE id = p_resident_id AND building_id = p_building_id
    ) THEN
        RAISE EXCEPTION 'resident_not_found' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.resident_subscription_rates
        (building_id, resident_id, effective_month, monthly_amount, created_by)
    VALUES
        (p_building_id, p_resident_id, p_effective_month, p_monthly_amount, v_actor)
    ON CONFLICT (resident_id, effective_month)
    DO UPDATE SET monthly_amount = EXCLUDED.monthly_amount,
                  created_by = EXCLUDED.created_by,
                  created_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.set_resident_subscription_rate(uuid, uuid, date, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_resident_subscription_rate(uuid, uuid, date, numeric) TO authenticated;

CREATE INDEX IF NOT EXISTS resident_subscription_rates_lookup_idx
ON public.resident_subscription_rates (building_id, resident_id, effective_month DESC);
