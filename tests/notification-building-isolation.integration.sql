\\set ON_ERROR_STOP on
\\ir atomic-persistence.integration.sql

-- Apply the candidate migration after the baseline fixture is fully built.
\\ir ../supabase/migrations/20261103161000_notification_recipient_building_isolation.sql

-- Owner B is linked only to a resident in the second building.
INSERT INTO public.residents (
    id, building_id, user_id, name, apartment_number, monthly_amount
) VALUES (
    '30000000-0000-4000-8000-000000000098',
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000003',
    'Owner B second building', 'B2', 100
);

SET ROLE authenticated;
DO $notification_isolation$
DECLARE
    v_building_one uuid := '20000000-0000-4000-8000-000000000001';
    v_building_two uuid := '20000000-0000-4000-8000-000000000002';
    v_owner_a uuid := '10000000-0000-4000-8000-000000000002';
    v_owner_b uuid := '10000000-0000-4000-8000-000000000003';
    v_manager uuid := '10000000-0000-4000-8000-000000000001';
    v_resident_a uuid := '30000000-0000-4000-8000-000000000001';
    v_resident_b uuid := '30000000-0000-4000-8000-000000000098';
BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);

    IF private.can_read_notification(v_building_two, v_owner_a, NULL) IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'owner A read a notification in a building where they have no resident';
    END IF;
    IF private.can_read_notification(v_building_one, v_owner_a, v_resident_a) IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'owner A cannot read their own notification in their building';
    END IF;
    IF private.can_read_notification(v_building_one, v_owner_a, v_resident_b) IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'owner A read a notification targeting another building resident';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_owner_b::text, true);
    IF private.can_read_notification(v_building_two, v_owner_b, v_resident_b) IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'owner B cannot read their own notification in the second building';
    END IF;
    IF private.can_read_notification(v_building_one, v_owner_b, v_resident_b) IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'owner B read a notification through a mismatched building id';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_manager::text, true);
    IF private.can_read_notification(v_building_one, NULL, NULL) IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'manager lost access to their own building notifications';
    END IF;
    IF private.can_read_notification(v_building_two, NULL, NULL) IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'manager accessed notifications in another building';
    END IF;
END;
$notification_isolation$;
RESET ROLE;

SELECT 'notification building isolation integration tests passed' AS result;
