DO $$
DECLARE
    v_building_id uuid := '20000000-0000-4000-8000-000000000001';
    v_manager_id uuid := '10000000-0000-4000-8000-000000000001';
    v_summary jsonb;
    v_monthly jsonb;
BEGIN
    IF (SELECT count(*) FROM auth.users) <> 3
       OR (SELECT count(*) FROM auth.identities) <> 3
       OR (SELECT count(*) FROM public.profiles) <> 3
       OR (SELECT count(*) FROM public.building_members) <> 3
       OR (SELECT count(*) FROM public.residents) <> 4
       OR (SELECT count(*) FROM public.income) <> 4
       OR (SELECT count(*) FROM public.expenses) <> 3
       OR (SELECT count(*) FROM public.cash_transfers) <> 2
       OR (SELECT count(*) FROM public.resident_subscription_rates) <> 5
       OR (SELECT count(*) FROM public.resident_subscription_rate_changes) <> 5 THEN
        RAISE EXCEPTION 'local_seed_fixture_count_mismatch';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM auth.users
        WHERE id = v_manager_id AND email = 'manager@manzil.invalid'
          AND encrypted_password = extensions.crypt('Manzil-Local-Only-2026!', encrypted_password)
    ) THEN RAISE EXCEPTION 'local_manager_password_hash_invalid'; END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.building_members
        WHERE building_id = v_building_id AND user_id = v_manager_id AND role = 'manager'
    ) THEN RAISE EXCEPTION 'local_manager_membership_missing'; END IF;

    PERFORM set_config('request.jwt.claim.sub', v_manager_id::text, false);
    v_summary := public.get_cashbox_summary(v_building_id);
    v_monthly := public.get_monthly_cashbox_close(v_building_id, DATE '2026-11-01');

    IF (v_summary #>> '{balances,main}')::numeric <> 1120
       OR (v_summary #>> '{balances,development}')::numeric <> 150
       OR (v_summary #>> '{balances,emergency}')::numeric <> 175 THEN
        RAISE EXCEPTION 'local_cashbox_summary_unexpected: %', v_summary;
    END IF;
    IF (v_monthly #>> '{totals,closing_balance}')::numeric <> 1445
       OR (v_monthly #>> '{accounts,main,closing_balance}')::numeric <> 1120
       OR (v_monthly #>> '{accounts,development,closing_balance}')::numeric <> 150
       OR (v_monthly #>> '{accounts,emergency,closing_balance}')::numeric <> 175
       OR COALESCE((v_monthly->>'reconciled')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'local_monthly_close_unexpected: %', v_monthly;
    END IF;
END;
$$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
DO $$
BEGIN
    IF (SELECT count(*) FROM public.residents) <> 1 THEN RAISE EXCEPTION 'owner_rls_resident_scope_failed'; END IF;
    IF (SELECT count(*) FROM public.income) <> 1 THEN RAISE EXCEPTION 'owner_rls_income_scope_failed'; END IF;
    IF (SELECT count(*) FROM public.notifications) <> 1 THEN RAISE EXCEPTION 'owner_rls_notification_scope_failed'; END IF;
    IF (SELECT count(*) FROM public.resident_internal_notes) <> 0 THEN RAISE EXCEPTION 'owner_rls_internal_notes_leak'; END IF;
    IF (SELECT count(*) FROM public.resident_subscription_rate_changes) <> 0 THEN RAISE EXCEPTION 'owner_rls_rate_history_leak'; END IF;
END;
$$;
ROLLBACK;
