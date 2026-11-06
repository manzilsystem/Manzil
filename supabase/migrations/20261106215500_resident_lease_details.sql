-- Keep lease and tenant contact details separate from owner-readable resident rows.
-- The table is manager-only; snapshots write through the security-definer wrapper below.
CREATE TABLE public.resident_lease_details (
    resident_id uuid PRIMARY KEY REFERENCES public.residents(id) ON DELETE CASCADE,
    building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
    is_rented boolean NOT NULL DEFAULT false,
    tenant_name text,
    tenant_phone text,
    lease_start date,
    lease_end date,
    rent_amount numeric(12,2),
    deposit_amount numeric(12,2),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT resident_lease_details_tenant_name_check
        CHECK (NOT is_rented OR NULLIF(btrim(tenant_name), '') IS NOT NULL),
    CONSTRAINT resident_lease_details_tenant_name_length_check
        CHECK (tenant_name IS NULL OR length(tenant_name) <= 200),
    CONSTRAINT resident_lease_details_tenant_phone_length_check
        CHECK (tenant_phone IS NULL OR length(tenant_phone) <= 60),
    CONSTRAINT resident_lease_details_lease_dates_check
        CHECK (lease_start IS NULL OR lease_end IS NULL OR lease_end >= lease_start),
    CONSTRAINT resident_lease_details_rent_amount_check
        CHECK (rent_amount IS NULL OR rent_amount >= 0),
    CONSTRAINT resident_lease_details_deposit_amount_check
        CHECK (deposit_amount IS NULL OR deposit_amount >= 0)
);

CREATE INDEX resident_lease_details_building_idx
    ON public.resident_lease_details (building_id);

ALTER TABLE public.resident_lease_details ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.resident_lease_details FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.resident_lease_details TO authenticated;

CREATE POLICY resident_lease_details_manager_select
ON public.resident_lease_details
FOR SELECT
TO authenticated
USING (private.is_building_manager(building_id));

-- Keep the existing atomic snapshot as the single write boundary. The private
-- function validates manager access, versions, ownership and the full snapshot.
-- Tenant details are applied in the same transaction, only for clients that send
-- the new key; older clients therefore cannot erase these fields during rollout.
CREATE OR REPLACE FUNCTION public.persist_building_snapshot(
    p_building_id uuid,
    p_expected_version bigint,
    p_request_id uuid,
    p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_result jsonb;
BEGIN
    v_result := private.persist_building_snapshot(
        p_building_id,
        p_expected_version,
        p_request_id,
        p_payload
    );

    IF COALESCE((v_result->>'ok')::boolean, false)
       AND NOT COALESCE((v_result->>'duplicate')::boolean, false) THEN
        INSERT INTO public.resident_lease_details AS current_detail (
            building_id,
            resident_id,
            is_rented,
            tenant_name,
            tenant_phone,
            lease_start,
            lease_end,
            rent_amount,
            deposit_amount,
            updated_at
        )
        SELECT
            p_building_id,
            (resident_payload.value->>'id')::uuid,
            (resident_payload.value->>'is_rented')::boolean,
            NULLIF(btrim(resident_payload.value->>'tenant_name'), ''),
            NULLIF(btrim(resident_payload.value->>'tenant_phone'), ''),
            NULLIF(resident_payload.value->>'lease_start', '')::date,
            NULLIF(resident_payload.value->>'lease_end', '')::date,
            NULLIF(resident_payload.value->>'rent_amount', '')::numeric,
            NULLIF(resident_payload.value->>'deposit_amount', '')::numeric,
            now()
        FROM jsonb_array_elements(p_payload->'residents') AS resident_payload(value)
        WHERE resident_payload.value ? 'is_rented'
        ON CONFLICT (resident_id) DO UPDATE SET
            building_id = EXCLUDED.building_id,
            is_rented = EXCLUDED.is_rented,
            tenant_name = EXCLUDED.tenant_name,
            tenant_phone = EXCLUDED.tenant_phone,
            lease_start = EXCLUDED.lease_start,
            lease_end = EXCLUDED.lease_end,
            rent_amount = EXCLUDED.rent_amount,
            deposit_amount = EXCLUDED.deposit_amount,
            updated_at = now()
        WHERE current_detail.building_id = EXCLUDED.building_id;
    END IF;

    RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.persist_building_snapshot(uuid, bigint, uuid, jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_building_snapshot(uuid, bigint, uuid, jsonb)
    TO authenticated, service_role;
