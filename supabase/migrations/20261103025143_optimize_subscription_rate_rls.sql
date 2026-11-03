DROP POLICY IF EXISTS resident_subscription_rates_member_read
ON public.resident_subscription_rates;

CREATE POLICY resident_subscription_rates_member_read
ON public.resident_subscription_rates
FOR SELECT TO authenticated
USING (EXISTS (
    SELECT 1
    FROM public.building_members bm
    WHERE bm.building_id = resident_subscription_rates.building_id
      AND bm.user_id = (SELECT auth.uid())
));

CREATE INDEX IF NOT EXISTS resident_subscription_rates_created_by_idx
ON public.resident_subscription_rates (created_by);
