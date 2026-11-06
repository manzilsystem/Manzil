-- Settlements that reduce a month's subscription demand without moving cash.
-- Cash collections remain in income; this ledger only records waivers, discounts
-- and agreed settlements so outstanding balances can be explained month by month.
CREATE TABLE IF NOT EXISTS public.resident_adjustments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
    resident_id uuid NOT NULL REFERENCES public.residents(id) ON DELETE CASCADE,
    effective_month date NOT NULL,
    kind text NOT NULL,
    amount numeric(12,2) NOT NULL,
    reason text NOT NULL,
    created_by uuid NOT NULL REFERENCES auth.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT resident_adjustments_kind_check
        CHECK (kind IN ('waiver', 'discount', 'settlement')),
    CONSTRAINT resident_adjustments_amount_check CHECK (amount > 0),
    CONSTRAINT resident_adjustments_month_start_check
        CHECK (EXTRACT(DAY FROM effective_month) = 1),
    CONSTRAINT resident_adjustments_reason_check CHECK (btrim(reason) <> '')
);

CREATE INDEX IF NOT EXISTS resident_adjustments_building_month_idx
    ON public.resident_adjustments (building_id, effective_month);

CREATE INDEX IF NOT EXISTS resident_adjustments_resident_month_idx
    ON public.resident_adjustments (resident_id, effective_month);

ALTER TABLE public.resident_adjustments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.resident_adjustments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.resident_adjustments TO authenticated;

-- Managers see every settlement in their building; an owner sees only their unit.
-- All writes go through the manager snapshot RPC, never through direct table writes.
CREATE POLICY resident_adjustments_manager_or_owner_select
    ON public.resident_adjustments
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.building_members member
            WHERE member.building_id = resident_adjustments.building_id
              AND member.user_id = (SELECT auth.uid())
              AND member.role = 'manager'
        )
        OR EXISTS (
            SELECT 1
            FROM public.residents resident
            WHERE resident.id = resident_adjustments.resident_id
              AND resident.user_id = (SELECT auth.uid())
        )
    );

COMMENT ON TABLE public.resident_adjustments IS
    'Waivers, discounts and settlements that reduce a month subscription demand without cash movement.';
