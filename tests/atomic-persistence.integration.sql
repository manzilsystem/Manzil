\set ON_ERROR_STOP on
\ir atomic-persistence.fixture.sql
\ir ../supabase/migrations/20261103000000_atomic_building_snapshot.sql
\ir ../supabase/migrations/20261103050000_allow_all_five_themes.sql
\ir ../supabase/migrations/20261103060000_effective_dated_subscription_rates.sql
\ir ../supabase/migrations/20261103070000_atomic_subscription_rate_snapshot.sql

INSERT INTO public.profiles (id) VALUES
('10000000-0000-4000-8000-000000000001'),
('10000000-0000-4000-8000-000000000002'),
('10000000-0000-4000-8000-000000000003');

INSERT INTO auth.users (id) VALUES
('10000000-0000-4000-8000-000000000001'),
('10000000-0000-4000-8000-000000000002'),
('10000000-0000-4000-8000-000000000003');

INSERT INTO public.buildings (id, name) VALUES
('20000000-0000-4000-8000-000000000001', 'Before'),
('20000000-0000-4000-8000-000000000002', 'Other building');

INSERT INTO public.building_members (building_id, user_id, role)
VALUES ('20000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001', 'manager');

INSERT INTO public.residents (id, building_id, name, apartment_number, monthly_amount)
VALUES ('30000000-0000-4000-8000-000000000099',
        '20000000-0000-4000-8000-000000000002', 'Foreign resident', 'X1', 50);

SET request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
SET ROLE authenticated;

DO $test$
DECLARE
    v_result jsonb;
    v_payload jsonb;
    v_building uuid := '20000000-0000-4000-8000-000000000001';
    v_request uuid := '40000000-0000-4000-8000-000000000001';
BEGIN
    v_payload := '{
      "building":{"name":"Atomic success","manager_name":"Manager","manager_phone":null,"default_subscription":100,"starting_balance":0,"current_theme":"dark"},
      "residents":[{"id":"30000000-0000-4000-8000-000000000001","user_id":"10000000-0000-4000-8000-000000000002","name":"Owner A","apartment_number":"A1","monthly_amount":100,"created_at":"2026-11-02T10:00:00Z"}],
      "income":[{"id":"50000000-0000-4000-8000-000000000001","resident_id":"30000000-0000-4000-8000-000000000001","amount":100,"month":"2026-11","paid_at":"2026-11-02T10:00:00Z"}],
      "expenses":[],"notices":[],"audit_logs":[],
      "subscription_rates":[{"resident_id":"30000000-0000-4000-8000-000000000001","effective_month":"2026-11-01","monthly_amount":125}]
    }'::jsonb;

    v_result := public.persist_building_snapshot(v_building, 1, v_request, v_payload);
    IF v_result->>'ok' <> 'true' OR (v_result->>'version')::bigint <> 2 THEN
        RAISE EXCEPTION 'initial atomic snapshot failed: %', v_result;
    END IF;
    IF (SELECT count(*) FROM public.residents WHERE id = '30000000-0000-4000-8000-000000000001') <> 1
       OR (SELECT count(*) FROM public.income WHERE id = '50000000-0000-4000-8000-000000000001') <> 1
       OR NOT EXISTS (SELECT 1 FROM public.building_members
          WHERE building_id = v_building AND user_id = '10000000-0000-4000-8000-000000000002' AND role = 'owner') THEN
        RAISE EXCEPTION 'snapshot rows or owner membership were not persisted';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.resident_subscription_rates
        WHERE resident_id = '30000000-0000-4000-8000-000000000001'
          AND effective_month = DATE '2026-11-01' AND monthly_amount = 125
          AND building_id = v_building
    ) THEN
        RAISE EXCEPTION 'subscription rate was not persisted atomically';
    END IF;

    BEGIN
        v_result := public.persist_building_snapshot(v_building, 2,
            '40000000-0000-4000-8000-000000000009',
            jsonb_set(jsonb_set(v_payload, '{building,name}', '"Cross-building rate must roll back"'),
              '{subscription_rates,0,resident_id}', '"30000000-0000-4000-8000-000000000099"'));
        RAISE EXCEPTION 'cross-building subscription rate unexpectedly committed';
    EXCEPTION WHEN SQLSTATE '22023' THEN
        NULL;
    END;
    IF (SELECT state_version FROM public.buildings WHERE id = v_building) <> 2
       OR (SELECT name FROM public.buildings WHERE id = v_building) <> 'Atomic success'
       OR (SELECT count(*) FROM public.resident_subscription_rates WHERE building_id = v_building) <> 1 THEN
        RAISE EXCEPTION 'cross-building subscription rate did not roll back the snapshot';
    END IF;

    v_result := public.persist_building_snapshot(v_building, 1, v_request, v_payload);
    IF v_result->>'ok' <> 'true' OR v_result->>'duplicate' <> 'true' THEN
        RAISE EXCEPTION 'idempotent retry failed: %', v_result;
    END IF;

    v_result := public.persist_building_snapshot(v_building, 1,
        '40000000-0000-4000-8000-000000000002',
        jsonb_set(v_payload, '{building,name}', '"Stale write"'));
    IF v_result->>'conflict' <> 'true' OR (v_result->>'current_version')::bigint <> 2 THEN
        RAISE EXCEPTION 'optimistic version conflict failed: %', v_result;
    END IF;

    BEGIN
        v_result := public.persist_building_snapshot(v_building, 2,
            '40000000-0000-4000-8000-000000000003',
            jsonb_set(jsonb_set(v_payload, '{residents}', '[]'::jsonb), '{income}', '[]'::jsonb));
        RAISE EXCEPTION 'resident with financial history was deleted';
    EXCEPTION WHEN SQLSTATE '23503' THEN
        NULL;
    END;
    IF (SELECT state_version FROM public.buildings WHERE id = v_building) <> 2
       OR (SELECT count(*) FROM public.income WHERE building_id = v_building) <> 1 THEN
        RAISE EXCEPTION 'financial history guard did not roll back the transaction';
    END IF;

    BEGIN
        v_result := public.persist_building_snapshot(v_building, 2,
            '40000000-0000-4000-8000-000000000004',
            jsonb_set(jsonb_set(v_payload, '{building,name}', '"Must roll back"'),
              '{expenses}', '[{"id":"60000000-0000-4000-8000-000000000001","title":"Invalid","amount":0,"month":"2026-11"}]'::jsonb));
        RAISE EXCEPTION 'invalid expense unexpectedly committed';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;
    IF (SELECT state_version FROM public.buildings WHERE id = v_building) <> 2
       OR (SELECT name FROM public.buildings WHERE id = v_building) <> 'Atomic success'
       OR EXISTS (SELECT 1 FROM public.expenses WHERE building_id = v_building) THEN
        RAISE EXCEPTION 'failed snapshot did not roll back all writes';
    END IF;

    BEGIN
        v_result := public.persist_building_snapshot(v_building, 2,
            '40000000-0000-4000-8000-000000000008',
            jsonb_set(jsonb_set(v_payload, '{building,name}', '"Invalid rate must roll back"'),
              '{subscription_rates,0,effective_month}', '"2026-11-15"'));
        RAISE EXCEPTION 'invalid subscription rate unexpectedly committed';
    EXCEPTION WHEN SQLSTATE '22023' THEN
        NULL;
    END;
    IF (SELECT state_version FROM public.buildings WHERE id = v_building) <> 2
       OR (SELECT name FROM public.buildings WHERE id = v_building) <> 'Atomic success'
       OR (SELECT monthly_amount FROM public.resident_subscription_rates
           WHERE resident_id = '30000000-0000-4000-8000-000000000001'
             AND effective_month = DATE '2026-11-01') <> 125 THEN
        RAISE EXCEPTION 'invalid subscription rate did not roll back the entire snapshot';
    END IF;

    BEGIN
        v_result := public.persist_building_snapshot(v_building, 2,
            '40000000-0000-4000-8000-000000000005',
            jsonb_set(jsonb_set(v_payload, '{residents,0,id}', '"30000000-0000-4000-8000-000000000099"'),
              '{income}', '[]'::jsonb));
        RAISE EXCEPTION 'cross-building resident ID unexpectedly accepted';
    EXCEPTION WHEN SQLSTATE '42501' THEN
        NULL;
    END;

    v_payload := jsonb_set(v_payload, '{residents}',
      (v_payload->'residents') || '[{"id":"30000000-0000-4000-8000-000000000002","user_id":"10000000-0000-4000-8000-000000000003","name":"Owner B","apartment_number":"B1","monthly_amount":100}]'::jsonb);
    v_result := public.persist_building_snapshot(v_building, 2,
        '40000000-0000-4000-8000-000000000006', v_payload);
    IF v_result->>'ok' <> 'true' OR (v_result->>'version')::bigint <> 3 THEN
        RAISE EXCEPTION 'second snapshot failed: %', v_result;
    END IF;

    v_payload := jsonb_set(v_payload, '{residents}',
      '[{"id":"30000000-0000-4000-8000-000000000001","user_id":"10000000-0000-4000-8000-000000000002","name":"Owner A","apartment_number":"A1","monthly_amount":100}]'::jsonb);
    v_result := public.persist_building_snapshot(v_building, 3,
        '40000000-0000-4000-8000-000000000007', v_payload);
    IF v_result->>'ok' <> 'true' OR (v_result->>'version')::bigint <> 4 THEN
        RAISE EXCEPTION 'resident cleanup snapshot failed: %', v_result;
    END IF;
    IF EXISTS (SELECT 1 FROM public.building_members
       WHERE building_id = v_building AND user_id = '10000000-0000-4000-8000-000000000003') THEN
        RAISE EXCEPTION 'orphaned owner membership remains after resident deletion';
    END IF;
END;
$test$;

RESET ROLE;
SELECT 'atomic persistence integration tests passed' AS result;


-- Every theme supported by the UI must satisfy the database constraint.
DO $$
DECLARE
    v_theme text;
BEGIN
    FOREACH v_theme IN ARRAY ARRAY['dark', 'light', 'emerald', 'ocean', 'sand'] LOOP
        UPDATE public.buildings
        SET current_theme = v_theme
        WHERE id = '20000000-0000-4000-8000-000000000001';
        IF NOT FOUND THEN
            RAISE EXCEPTION 'theme persistence test building missing';
        END IF;
        IF (SELECT current_theme FROM public.buildings
            WHERE id = '20000000-0000-4000-8000-000000000001') <> v_theme THEN
            RAISE EXCEPTION 'theme persistence failed for %', v_theme;
        END IF;
    END LOOP;
END;
$$;

