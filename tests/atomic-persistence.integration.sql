\set ON_ERROR_STOP on
\ir atomic-persistence.fixture.sql
\ir ../supabase/migrations/20261102234716_effective_dated_subscription_rates.sql
\ir ../supabase/migrations/20261102234718_seed_subscription_rate_baselines.sql
\ir ../supabase/migrations/20261103000000_atomic_building_snapshot.sql
\ir ../supabase/migrations/20261103025013_atomic_subscription_rate_snapshot.sql
\ir ../supabase/migrations/20261103025143_optimize_subscription_rate_rls.sql
\ir ../supabase/migrations/20261103030212_drop_legacy_subscription_rate_rpc.sql
\ir ../supabase/migrations/20261103031121_restrict_subscription_rate_visibility.sql
\ir ../supabase/migrations/20261103050000_allow_all_five_themes.sql
\ir ../supabase/migrations/20261103062659_manager_only_resident_notes.sql
\ir ../supabase/migrations/20261103063455_owner_login_rate_limit.sql
\ir ../supabase/migrations/20261103064001_subscription_rate_change_history.sql
\ir ../supabase/migrations/20261103070519_owner_payment_notifications.sql
\ir ../supabase/migrations/20261103105856_restrict_notification_update_columns.sql
\ir ../supabase/migrations/20261103105902_key_owner_login_rate_limit_hashes.sql
\ir ../supabase/migrations/20261103105908_cashbox_funds_and_transfers.sql
\ir ../supabase/migrations/20261103110732_fix_owner_payment_notification_generated_scope.sql
\ir ../supabase/migrations/20261103113213_monthly_cashbox_close.sql

\ir ../supabase/migrations/20261103143759_allow_owner_notification_read_state_updates.sql
\ir ../supabase/migrations/20261103153941_cash_transfer_idempotency_payload.sql
\ir ../supabase/migrations/20261103172000_revoke_direct_financial_table_writes.sql
\ir ../supabase/migrations/20261103180000_sync_owner_payment_notifications.sql
\ir ../supabase/migrations/20261103180000_sync_owner_payment_notifications.sql

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
      "residents":[{"id":"30000000-0000-4000-8000-000000000001","user_id":"10000000-0000-4000-8000-000000000002","name":"Owner A","apartment_number":"A1","monthly_amount":100,"notes":"manager-only secret","created_at":"2026-11-02T10:00:00Z"}],
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

    IF (SELECT notes FROM public.residents
        WHERE id = '30000000-0000-4000-8000-000000000001') IS NOT NULL
       OR NOT EXISTS (
          SELECT 1 FROM public.resident_internal_notes
          WHERE resident_id = '30000000-0000-4000-8000-000000000001'
            AND building_id = v_building AND notes = 'manager-only secret'
       ) THEN
        RAISE EXCEPTION 'resident internal note was not isolated from the residents row';
    END IF;
    IF NOT has_table_privilege('authenticated', 'public.resident_internal_notes', 'SELECT')
       OR has_table_privilege('authenticated', 'public.resident_internal_notes', 'INSERT')
       OR has_table_privilege('authenticated', 'public.resident_internal_notes', 'UPDATE') THEN
        RAISE EXCEPTION 'resident internal notes table grants are too broad';
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
    v_payload := jsonb_set(v_payload, '{subscription_rates,0,monthly_amount}', '130'::jsonb);
    v_payload := jsonb_set(v_payload, '{subscription_rates}',
      (v_payload->'subscription_rates') || '[{"resident_id":"30000000-0000-4000-8000-000000000002","effective_month":"2026-11-01","monthly_amount":100}]'::jsonb);
    v_payload := jsonb_set(v_payload, '{income}',
      (v_payload->'income') || '[
        {"id":"40000000-0000-4000-8000-000000000008","resident_id":"30000000-0000-4000-8000-000000000001","amount":50,"month":"2026-12","notes":"دفعة موزعة ABCDEF123456 (1/2)","paid_at":"2026-11-03T06:00:00Z"},
        {"id":"40000000-0000-4000-8000-000000000009","resident_id":"30000000-0000-4000-8000-000000000001","amount":50,"month":"2027-01","notes":"دفعة موزعة ABCDEF123456 (2/2)","paid_at":"2026-11-03T06:00:00Z"}
      ]'::jsonb);
    v_result := public.persist_building_snapshot(v_building, 2,
        '40000000-0000-4000-8000-000000000006', v_payload);
    IF v_result->>'ok' <> 'true' OR (v_result->>'version')::bigint <> 3 THEN
        RAISE EXCEPTION 'second snapshot failed: %', v_result;
    END IF;

    IF (SELECT count(*) FROM public.resident_subscription_rates WHERE building_id = v_building) <> 2 THEN
        RAISE EXCEPTION 'manager cannot read all subscription rates';
    END IF;

    IF (SELECT count(*) FROM public.notifications WHERE building_id = v_building AND kind = 'payment') <> 2
       OR NOT EXISTS (
          SELECT 1 FROM public.notifications
          WHERE target_user_id = '10000000-0000-4000-8000-000000000002'
            AND target_resident_id = '30000000-0000-4000-8000-000000000001'
            AND title = 'تم تسجيل دفعة مقدمة'
            AND body LIKE '%100%'
            AND body LIKE '%2026-12%'
            AND body LIKE '%2027-01%'
       ) THEN
        RAISE EXCEPTION 'owner payment notification was not grouped or aggregated';
    END IF;

    IF (SELECT count(*) FROM public.resident_subscription_rate_changes WHERE building_id = v_building) <> 3
       OR NOT EXISTS (
          SELECT 1 FROM public.resident_subscription_rate_changes
          WHERE resident_id = '30000000-0000-4000-8000-000000000001'
            AND previous_monthly_amount = 125 AND new_monthly_amount = 130
            AND change_type = 'change'
       ) THEN
        RAISE EXCEPTION 'subscription rate change history did not preserve old and new values';
    END IF;
    IF has_table_privilege('authenticated', 'public.resident_subscription_rate_changes', 'INSERT')
       OR has_table_privilege('authenticated', 'public.resident_subscription_rate_changes', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.resident_subscription_rate_changes', 'DELETE') THEN
        RAISE EXCEPTION 'subscription rate history is directly mutable by clients';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
    IF (SELECT count(*) FROM public.resident_internal_notes WHERE building_id = v_building) <> 0
       OR (SELECT notes FROM public.residents
           WHERE id = '30000000-0000-4000-8000-000000000001') IS NOT NULL THEN
        RAISE EXCEPTION 'owner can read manager-only resident notes';
    END IF;
    IF (SELECT count(*) FROM public.notifications WHERE building_id = v_building) <> 2
       OR NOT EXISTS (
          SELECT 1 FROM public.notifications
          WHERE target_user_id = '10000000-0000-4000-8000-000000000002'
            AND kind = 'payment'
       ) THEN
        RAISE EXCEPTION 'owner A cannot read only their own payment notification';
    END IF;
    IF has_table_privilege('authenticated', 'public.notifications', 'UPDATE')
       OR NOT has_column_privilege('authenticated', 'public.notifications', 'read_at', 'UPDATE')
       OR has_column_privilege('authenticated', 'public.notifications', 'title', 'UPDATE')
       OR has_column_privilege('authenticated', 'public.notifications', 'body', 'UPDATE')
       OR has_column_privilege('authenticated', 'public.notifications', 'target_user_id', 'UPDATE') THEN
        RAISE EXCEPTION 'authenticated notification update grants are not restricted to read_at';
    END IF;
    UPDATE public.notifications SET read_at = now()
    WHERE target_user_id = '10000000-0000-4000-8000-000000000002';
    IF NOT EXISTS (
        SELECT 1 FROM public.notifications
        WHERE target_user_id = '10000000-0000-4000-8000-000000000002' AND read_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'owner cannot mark their notification as read';
    END IF;
    BEGIN
        UPDATE public.notifications SET body = 'tampered'
        WHERE target_user_id = '10000000-0000-4000-8000-000000000002';
        RAISE EXCEPTION 'owner unexpectedly modified notification content';
    EXCEPTION WHEN SQLSTATE '42501' THEN
        NULL;
    END;

    IF (SELECT count(*) FROM public.resident_subscription_rate_changes WHERE building_id = v_building) <> 0 THEN
        RAISE EXCEPTION 'owner can read manager-only subscription rate history';
    END IF;
    IF (SELECT count(*) FROM public.resident_subscription_rates WHERE building_id = v_building) <> 1
       OR EXISTS (SELECT 1 FROM public.resident_subscription_rates
                  WHERE building_id = v_building AND resident_id <> '30000000-0000-4000-8000-000000000001') THEN
        RAISE EXCEPTION 'owner A can read another resident subscription rate';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
    IF (SELECT count(*) FROM public.resident_subscription_rates WHERE building_id = v_building) <> 1
       OR EXISTS (SELECT 1 FROM public.resident_subscription_rates
                  WHERE building_id = v_building AND resident_id <> '30000000-0000-4000-8000-000000000002') THEN
        RAISE EXCEPTION 'owner B can read another resident subscription rate';
    END IF;

    IF (SELECT count(*) FROM public.notifications WHERE building_id = v_building) <> 0 THEN
        RAISE EXCEPTION 'owner B can read another apartment payment notification';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
    IF (SELECT count(*) FROM public.resident_subscription_rates WHERE building_id = v_building) <> 2 THEN
        RAISE EXCEPTION 'manager subscription rate visibility was restricted';
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

-- The owner PIN login limiter is atomic, service-role-only, and time-windowed.
SET ROLE service_role;
DO $rate_limit$
DECLARE
    v_result jsonb;
    v_hash text := repeat('a', 64);
    v_attempt integer;
BEGIN
    IF has_function_privilege('authenticated', 'public.owner_login_rate_limit(text,text)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.owner_login_rate_limit(text,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'owner login limiter grants are too broad or missing';
    END IF;

    FOR v_attempt IN 1..5 LOOP
        v_result := public.owner_login_rate_limit(v_hash, 'attempt');
        IF v_result->>'allowed' <> 'true' THEN
            RAISE EXCEPTION 'owner login attempt % was blocked too early: %', v_attempt, v_result;
        END IF;
    END LOOP;

    v_result := public.owner_login_rate_limit(v_hash, 'attempt');
    IF v_result->>'allowed' <> 'false'
       OR COALESCE((v_result->>'retry_after_seconds')::integer, 0) < 1 THEN
        RAISE EXCEPTION 'sixth owner login attempt was not rate limited: %', v_result;
    END IF;

    v_result := public.owner_login_rate_limit(v_hash, 'attempt');
    IF v_result->>'allowed' <> 'false' THEN
        RAISE EXCEPTION 'locked owner login attempts were not blocked: %', v_result;
    END IF;

    v_result := public.owner_login_rate_limit(v_hash, 'success');
    IF v_result->>'allowed' <> 'true' THEN
        RAISE EXCEPTION 'successful owner login did not clear rate-limit state: %', v_result;
    END IF;

    v_result := public.owner_login_rate_limit(v_hash, 'attempt');
    IF v_result->>'allowed' <> 'true' THEN
        RAISE EXCEPTION 'owner login limiter did not reset after success: %', v_result;
    END IF;
END;
$rate_limit$;
RESET ROLE;
SELECT 'atomic persistence and owner login rate-limit integration tests passed' AS result;


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

-- Internal cashboxes: transfers are atomic, idempotent, and never create income.
SET request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
DO $cashbox$
DECLARE
    v_building uuid := '20000000-0000-4000-8000-000000000001';
    v_resident uuid := '30000000-0000-4000-8000-000000000001';
    v_manager uuid := '10000000-0000-4000-8000-000000000001';
    v_owner uuid := '10000000-0000-4000-8000-000000000002';
    v_version bigint;
    v_summary jsonb;
    v_transfer jsonb;
    v_result jsonb;
    v_payload jsonb;
    v_expected_main numeric;
BEGIN
    IF has_table_privilege('authenticated', 'public.cash_transfers', 'INSERT')
       OR has_table_privilege('authenticated', 'public.cash_transfers', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.cash_transfers', 'DELETE')
       OR NOT has_table_privilege('authenticated', 'public.cash_transfers', 'SELECT') THEN
        RAISE EXCEPTION 'cash transfer table grants are too broad or missing';
    END IF;

    SELECT state_version INTO v_version
    FROM public.buildings WHERE id = v_building;

    SELECT COALESCE(building.starting_balance, 0)
        + COALESCE((SELECT SUM(payment.amount) FROM public.income payment
                    WHERE payment.building_id = v_building), 0)
        - COALESCE((SELECT SUM(expense.amount) FROM public.expenses expense
                    WHERE expense.building_id = v_building
                      AND COALESCE(expense.cash_account_code, 'main') = 'main'), 0)
    INTO v_expected_main
    FROM public.buildings building
    WHERE building.id = v_building;

    v_summary := public.get_cashbox_summary(v_building);
    IF (v_summary#>>'{balances,main}')::numeric <> v_expected_main
       OR (v_summary#>>'{balances,development}')::numeric <> 0
       OR (v_summary#>>'{balances,emergency}')::numeric <> 0 THEN
        RAISE EXCEPTION 'initial cashbox balances do not match the financial ledger: % (expected main %)', v_summary, v_expected_main;
    END IF;

    v_transfer := public.transfer_cash_between_accounts(
        v_building,
        '40000000-0000-4000-8000-000000000010',
        v_version,
        'main',
        'development',
        30,
        'تمويل صندوق التطوير'
    );
    IF v_transfer->>'ok' <> 'true'
       OR v_transfer->>'duplicate' <> 'false'
       OR (v_transfer->>'version')::bigint <> v_version + 1 THEN
        RAISE EXCEPTION 'cash transfer failed: %', v_transfer;
    END IF;

    v_result := public.transfer_cash_between_accounts(
        v_building,
        '40000000-0000-4000-8000-000000000010',
        v_version,
        'main',
        'development',
        30,
        'تمويل صندوق التطوير'
    );
    IF v_result->>'ok' <> 'true'
       OR v_result->>'duplicate' <> 'true'
       OR (SELECT count(*) FROM public.cash_transfers
           WHERE building_id = v_building) <> 1 THEN
        RAISE EXCEPTION 'cash transfer retry was not idempotent: %', v_result;
    END IF;

    BEGIN
        PERFORM public.transfer_cash_between_accounts(
            v_building,
            '40000000-0000-4000-8000-000000000010',
            v_version,
            'main',
            'emergency',
            30,
            'تمويل صندوق التطوير'
        );
        RAISE EXCEPTION 'changed cash transfer payload reused an existing request id';
    EXCEPTION
        WHEN SQLSTATE '22023' THEN
            IF SQLERRM <> 'cash_transfer_idempotency_key_reused' THEN
                RAISE;
            END IF;
    END;

    IF (SELECT count(*) FROM public.cash_transfers WHERE building_id = v_building) <> 1
       OR NOT EXISTS (
           SELECT 1 FROM public.cash_transfers
           WHERE building_id = v_building
             AND request_id = '40000000-0000-4000-8000-000000000010'
             AND from_account_code = 'main'
             AND to_account_code = 'development'
             AND amount = 30
       ) THEN
        RAISE EXCEPTION 'mismatched idempotency retry changed the stored cash transfer';
    END IF;

    v_result := public.transfer_cash_between_accounts(
        v_building,
        '40000000-0000-4000-8000-000000000014',
        v_version,
        'main',
        'development',
        10,
        'اختبار تعارض الإصدار'
    );
    IF v_result->>'conflict' <> 'true'
       OR (v_result->>'version')::bigint <> v_version + 1
       OR (SELECT count(*) FROM public.cash_transfers
           WHERE building_id = v_building) <> 1 THEN
        RAISE EXCEPTION 'stale cash transfer was not rejected: %', v_result;
    END IF;

    v_payload := '{
      "building":{"name":"Cashbox test","manager_name":"Manager","manager_phone":null,"default_subscription":100,"starting_balance":0,"current_theme":"dark"},
      "residents":[{"id":"30000000-0000-4000-8000-000000000001","user_id":"10000000-0000-4000-8000-000000000002","name":"Owner A","apartment_number":"A1","monthly_amount":100,"notes":null,"created_at":"2026-11-02T10:00:00Z"}],
      "income":[{"id":"50000000-0000-4000-8000-000000000001","resident_id":"30000000-0000-4000-8000-000000000001","amount":100,"month":"2026-11","paid_at":"2026-11-02T10:00:00Z"}],
      "expenses":[{"id":"60000000-0000-4000-8000-000000000010","title":"Development expense","amount":20,"category":"تطوير","month":"2026-11","cash_account_code":"development"}],
      "notices":[],"audit_logs":[],
      "subscription_rates":[{"resident_id":"30000000-0000-4000-8000-000000000001","effective_month":"2026-11-01","monthly_amount":125}]
    }'::jsonb;

    v_result := public.persist_building_snapshot(
        v_building,
        v_version + 1,
        '40000000-0000-4000-8000-000000000011',
        v_payload
    );
    IF v_result->>'ok' <> 'true'
       OR (SELECT cash_account_code FROM public.expenses
           WHERE id = '60000000-0000-4000-8000-000000000010') <> 'development' THEN
        RAISE EXCEPTION 'cash account expense persistence failed: %', v_result;
    END IF;

    v_summary := public.get_cashbox_summary(v_building);
    IF (v_summary#>>'{balances,main}')::numeric <> 70
       OR (v_summary#>>'{balances,development}')::numeric <> 10
       OR (v_summary#>>'{balances,emergency}')::numeric <> 0
       OR (
          (v_summary#>>'{balances,main}')::numeric
          + (v_summary#>>'{balances,development}')::numeric
          + (v_summary#>>'{balances,emergency}')::numeric
       ) <> (
          SELECT building.starting_balance
              + COALESCE((SELECT SUM(payment.amount) FROM public.income payment
                          WHERE payment.building_id = v_building), 0)
              - COALESCE((SELECT SUM(expense.amount) FROM public.expenses expense
                          WHERE expense.building_id = v_building), 0)
          FROM public.buildings building
          WHERE building.id = v_building
       ) THEN
        RAISE EXCEPTION 'cashbox balances do not reconcile to the total financial ledger: %', v_summary;
    END IF;

    BEGIN
        PERFORM public.persist_building_snapshot(
            v_building,
            (v_result->>'version')::bigint,
            '40000000-0000-4000-8000-000000000012',
            jsonb_set(v_payload, '{expenses,0,amount}', '31'::jsonb)
        );
        RAISE EXCEPTION 'fund overdraft unexpectedly committed';
    EXCEPTION WHEN SQLSTATE '22023' THEN
        NULL;
    END;

    v_transfer := public.transfer_cash_between_accounts(
        v_building,
        '40000000-0000-4000-8000-000000000013',
        (v_result->>'version')::bigint,
        'development',
        'emergency',
        11,
        'يجب رفض التحويل الزائد'
    );
    IF v_transfer->>'ok' <> 'false'
       OR v_transfer->>'insufficient_balance' <> 'true'
       OR (v_transfer->>'available_balance')::numeric <> 10
       OR (SELECT count(*) FROM public.cash_transfers
           WHERE building_id = v_building) <> 1 THEN
        RAISE EXCEPTION 'insufficient fund transfer was not rejected: %', v_transfer;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.audit_logs
        WHERE building_id = v_building AND action = 'تحويل بين الصناديق'
          AND actor_id = v_manager
    ) THEN
        RAISE EXCEPTION 'cash transfer audit record is missing';
    END IF;
END;
$cashbox$;

SET request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
DO $cashbox_owner$
BEGIN
    BEGIN
        PERFORM public.get_cashbox_summary('20000000-0000-4000-8000-000000000001');
        RAISE EXCEPTION 'owner unexpectedly accessed cashbox summary';
    EXCEPTION WHEN SQLSTATE '42501' THEN
        NULL;
    END;
    IF (SELECT count(*) FROM public.cash_transfers) <> 0 THEN
        RAISE EXCEPTION 'owner can read manager-only cash transfers';
    END IF;
END;
$cashbox_owner$;
RESET ROLE;

\ir monthly-cashbox-close.integration.sql


\ir ../supabase/migrations/20261103152547_index_cashbox_rate_history_fks.sql

DO $foreign_key_indexes$
DECLARE
    v_index text;
BEGIN
    FOREACH v_index IN ARRAY ARRAY[
        'cash_transfers_audit_log_id_idx',
        'cash_transfers_created_by_idx',
        'resident_subscription_rate_changes_changed_by_idx',
        'resident_subscription_rate_changes_resident_id_idx'
    ] LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM pg_class index_class
            JOIN pg_namespace index_schema ON index_schema.oid = index_class.relnamespace
            JOIN pg_index index_meta ON index_meta.indexrelid = index_class.oid
            WHERE index_schema.nspname = 'public'
              AND index_class.relname = v_index
              AND index_meta.indisvalid
              AND index_meta.indisready
        ) THEN
            RAISE EXCEPTION 'Required foreign-key index is missing or invalid: %', v_index;
        END IF;
    END LOOP;
END;
$foreign_key_indexes$;


-- Deleting or changing an allocation must keep the owner's grouped notification accurate.
SET request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
DO $income_notification_sync$
DECLARE
    v_notification public.notifications%ROWTYPE;
BEGIN
    INSERT INTO public.income
        (id, building_id, resident_id, amount, month, notes, paid_at, created_by)
    VALUES
        ('50000000-0000-4000-8000-000000000010',
         '20000000-0000-4000-8000-000000000001',
         '30000000-0000-4000-8000-000000000001',
         50, '2027-01', 'دفعة موزعة ABCDEF123456 (1/2)',
         now(), '10000000-0000-4000-8000-000000000001'),
        ('50000000-0000-4000-8000-000000000011',
         '20000000-0000-4000-8000-000000000001',
         '30000000-0000-4000-8000-000000000001',
         50, '2027-02', 'دفعة موزعة ABCDEF123456 (2/2)',
         now(), '10000000-0000-4000-8000-000000000001');

    SELECT * INTO v_notification
    FROM public.notifications
    WHERE building_id = '20000000-0000-4000-8000-000000000001'
      AND target_resident_id = '30000000-0000-4000-8000-000000000001'
      AND dedupe_key = 'income-batch:ABCDEF123456';
    IF NOT FOUND OR v_notification.body NOT LIKE '%100%' THEN
        RAISE EXCEPTION 'initial grouped payment notification is missing: %', v_notification;
    END IF;

    UPDATE public.income
    SET amount = 40
    WHERE id = '50000000-0000-4000-8000-000000000010';

    SELECT * INTO v_notification
    FROM public.notifications
    WHERE building_id = '20000000-0000-4000-8000-000000000001'
      AND target_resident_id = '30000000-0000-4000-8000-000000000001'
      AND dedupe_key = 'income-batch:ABCDEF123456';
    IF v_notification.body NOT LIKE '%90%' THEN
        RAISE EXCEPTION 'grouped notification was not updated after allocation amount changed: %', v_notification.body;
    END IF;

    IF (
        SELECT count(*) FROM public.notifications
        WHERE building_id = '20000000-0000-4000-8000-000000000001'
          AND target_resident_id = '30000000-0000-4000-8000-000000000001'
          AND dedupe_key = 'income-batch:ABCDEF123456'
    ) <> 1 THEN
        RAISE EXCEPTION 'grouped payment update created duplicate notifications';
    END IF;

    DELETE FROM public.income WHERE id = '50000000-0000-4000-8000-000000000010';
    SELECT * INTO v_notification
    FROM public.notifications
    WHERE building_id = '20000000-0000-4000-8000-000000000001'
      AND target_resident_id = '30000000-0000-4000-8000-000000000001'
      AND dedupe_key = 'income-batch:ABCDEF123456';
    IF NOT FOUND OR v_notification.body NOT LIKE '%50%' OR v_notification.body NOT LIKE '%2027-02%' THEN
        RAISE EXCEPTION 'grouped notification was not reduced after one allocation was deleted: %', v_notification.body;
    END IF;

    DELETE FROM public.income WHERE id = '50000000-0000-4000-8000-000000000011';
    IF EXISTS (
        SELECT 1 FROM public.notifications
        WHERE building_id = '20000000-0000-4000-8000-000000000001'
          AND target_resident_id = '30000000-0000-4000-8000-000000000001'
          AND dedupe_key = 'income-batch:ABCDEF123456'
    ) THEN
        RAISE EXCEPTION 'grouped notification remained after the final allocation was deleted';
    END IF;

    INSERT INTO public.income
        (id, building_id, resident_id, amount, month, notes, paid_at, created_by)
    VALUES (
        '50000000-0000-4000-8000-000000000012',
        '20000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001',
        25, '2027-03', 'تحصيل عادي',
        now(), '10000000-0000-4000-8000-000000000001'
    );

    SELECT * INTO v_notification
    FROM public.notifications
    WHERE building_id = '20000000-0000-4000-8000-000000000001'
      AND target_resident_id = '30000000-0000-4000-8000-000000000001'
      AND dedupe_key = 'income:50000000-0000-4000-8000-000000000012';
    IF NOT FOUND OR v_notification.body NOT LIKE '%25%' THEN
        RAISE EXCEPTION 'single payment notification was not created';
    END IF;

    UPDATE public.notifications
    SET read_at = now()
    WHERE id = v_notification.id;

    UPDATE public.income
    SET amount = 35, month = '2027-04'
    WHERE id = '50000000-0000-4000-8000-000000000012';

    SELECT * INTO v_notification
    FROM public.notifications
    WHERE building_id = '20000000-0000-4000-8000-000000000001'
      AND target_resident_id = '30000000-0000-4000-8000-000000000001'
      AND dedupe_key = 'income:50000000-0000-4000-8000-000000000012';
    IF v_notification.body NOT LIKE '%35%' OR v_notification.body NOT LIKE '%2027-04%'
       OR v_notification.read_at IS NULL THEN
        RAISE EXCEPTION 'single payment notification did not update or preserve read state';
    END IF;

    DELETE FROM public.income
    WHERE id = '50000000-0000-4000-8000-000000000012';
    IF EXISTS (
        SELECT 1 FROM public.notifications
        WHERE building_id = '20000000-0000-4000-8000-000000000001'
          AND target_resident_id = '30000000-0000-4000-8000-000000000001'
          AND dedupe_key = 'income:50000000-0000-4000-8000-000000000012'
    ) THEN
        RAISE EXCEPTION 'single payment notification remained after income deletion';
    END IF;

END;
$income_notification_sync$;
