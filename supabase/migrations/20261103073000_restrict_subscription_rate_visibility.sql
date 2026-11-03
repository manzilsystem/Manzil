DROP POLICY IF EXISTS resident_subscription_rates_member_read
ON public.resident_subscription_rates;

CREATE POLICY resident_subscription_rates_member_read
ON public.resident_subscription_rates
FOR SELECT TO authenticated
USING (
    private.is_building_manager(building_id)
    OR (
        private.owns_resident(resident_id)
        AND (SELECT private.owner_pin_change_complete())
    )
);
