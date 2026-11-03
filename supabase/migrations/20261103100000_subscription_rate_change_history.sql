-- Preserve every effective subscription-rate insert/update as an append-only audit record.
CREATE TABLE public.resident_subscription_rate_changes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
    resident_id uuid NOT NULL REFERENCES public.residents(id) ON DELETE CASCADE,
    effective_month date NOT NULL CHECK (date_trunc('month', effective_month)::date = effective_month),
    previous_monthly_amount numeric(12,2) CHECK (previous_monthly_amount IS NULL OR previous_monthly_amount >= 0),
    new_monthly_amount numeric(12,2) NOT NULL CHECK (new_monthly_amount >= 0),
    change_type text NOT NULL CHECK (change_type IN ('baseline', 'change')),
    changed_at timestamptz NOT NULL DEFAULT now(),
    changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.resident_subscription_rate_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.resident_subscription_rate_changes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.resident_subscription_rate_changes TO authenticated;

CREATE POLICY resident_subscription_rate_changes_manager_read
ON public.resident_subscription_rate_changes
FOR SELECT
TO authenticated
USING (private.is_building_manager(building_id));

-- Backfill the current effective-rate timeline. Earlier overwritten values cannot be reconstructed.
WITH ordered_rates AS (
    SELECT
        rate.*,
        LAG(rate.monthly_amount) OVER (
            PARTITION BY rate.resident_id ORDER BY rate.effective_month
        ) AS previous_amount,
        ROW_NUMBER() OVER (
            PARTITION BY rate.resident_id ORDER BY rate.effective_month
        ) AS sequence_number
    FROM public.resident_subscription_rates rate
)
INSERT INTO public.resident_subscription_rate_changes (
    building_id, resident_id, effective_month, previous_monthly_amount,
    new_monthly_amount, change_type, changed_at, changed_by
)
SELECT
    building_id, resident_id, effective_month, previous_amount, monthly_amount,
    CASE WHEN sequence_number = 1 THEN 'baseline' ELSE 'change' END,
    created_at, created_by
FROM ordered_rates;

CREATE OR REPLACE FUNCTION private.record_resident_subscription_rate_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_previous_amount numeric(12,2);
    v_change_type text;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT monthly_amount
        INTO v_previous_amount
        FROM public.resident_subscription_rates
        WHERE resident_id = NEW.resident_id
          AND effective_month < NEW.effective_month
        ORDER BY effective_month DESC
        LIMIT 1;

        IF EXISTS (
            SELECT 1 FROM public.resident_subscription_rate_changes
            WHERE resident_id = NEW.resident_id
        ) THEN
            v_change_type := 'change';
        ELSE
            v_change_type := 'baseline';
        END IF;

        INSERT INTO public.resident_subscription_rate_changes (
            building_id, resident_id, effective_month, previous_monthly_amount,
            new_monthly_amount, change_type, changed_by
        )
        VALUES (
            NEW.building_id, NEW.resident_id, NEW.effective_month, v_previous_amount,
            NEW.monthly_amount, v_change_type, auth.uid()
        );
    ELSIF OLD.monthly_amount IS DISTINCT FROM NEW.monthly_amount THEN
        INSERT INTO public.resident_subscription_rate_changes (
            building_id, resident_id, effective_month, previous_monthly_amount,
            new_monthly_amount, change_type, changed_by
        )
        VALUES (
            NEW.building_id, NEW.resident_id, NEW.effective_month, OLD.monthly_amount,
            NEW.monthly_amount, 'change', auth.uid()
        );
    END IF;

    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.record_resident_subscription_rate_change() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS resident_subscription_rate_change_audit ON public.resident_subscription_rates;
CREATE TRIGGER resident_subscription_rate_change_audit
AFTER INSERT OR UPDATE OF monthly_amount ON public.resident_subscription_rates
FOR EACH ROW
EXECUTE FUNCTION private.record_resident_subscription_rate_change();

CREATE INDEX resident_subscription_rate_changes_lookup_idx
ON public.resident_subscription_rate_changes (building_id, resident_id, changed_at DESC);
