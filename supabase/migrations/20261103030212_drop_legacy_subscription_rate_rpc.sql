-- The browser now persists subscription history inside persist_building_snapshot.
-- Remove the former SECURITY DEFINER RPC so it cannot remain an alternate write path.
DROP FUNCTION IF EXISTS public.set_resident_subscription_rate(uuid, uuid, date, numeric);
