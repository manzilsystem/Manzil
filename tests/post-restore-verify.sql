-- Post-restore verification script
-- Run this after a restore to verify database integrity
-- Usage: psql "$DB_URL" -v ON_ERROR_STOP=1 -f tests/post-restore-verify.sql

-- Expected output should show:
-- - All core tables exist
-- - RLS is enabled on user-facing tables
-- - At least one building/resident/subscription rate exists (for seeded data)
-- - Indexes on foreign keys are present

BEGIN;

-- Verify core tables exist
DO $$
DECLARE
    table_count integer;
BEGIN
    SELECT count(*) INTO table_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'buildings', 'residents', 'income', 'expenses', 'notices',
        'audit_logs', 'client_errors', 'building_mutations',
        'cash_transfers', 'notifications', 'profiles',
        'resident_subscription_rates', 'resident_subscription_rate_changes',
        'resident_adjustments'
      );
    
    IF table_count < 14 THEN
        RAISE EXCEPTION 'Missing core tables: found %, expected at least 14', table_count;
    END IF;
    
    RAISE NOTICE 'Core tables verified: % found', table_count;
END $$;

-- Verify RLS is enabled on user-facing tables
DO $$
DECLARE
    rls_disabled text[];
BEGIN
    SELECT array_agg(tablename) INTO rls_disabled
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (
        'buildings', 'residents', 'income', 'expenses', 'notices',
        'audit_logs', 'client_errors', 'building_mutations',
        'cash_transfers', 'notifications', 'profiles',
        'resident_subscription_rates', 'resident_subscription_rate_changes',
        'resident_adjustments'
      )
      AND rowsecurity = false;
    
    IF array_length(rls_disabled, 1) > 0 THEN
        RAISE EXCEPTION 'RLS disabled on tables: %', rls_disabled;
    END IF;
    
    RAISE NOTICE 'RLS verified: enabled on all user-facing tables';
END $$;

-- Verify building_mutations table exists (atomic persistence)
DO $$
DECLARE
    mutations_exist boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'building_mutations'
    ) INTO mutations_exist;
    
    IF NOT mutations_exist THEN
        RAISE EXCEPTION 'building_mutations table missing (atomic persistence)';
    END IF;
    
    RAISE NOTICE 'Atomic persistence table verified';
END $$;

-- Verify resident_subscription_rates table exists (effective-dated rates)
DO $$
DECLARE
    rates_exist boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'resident_subscription_rates'
    ) INTO rates_exist;

    IF NOT rates_exist THEN
        RAISE EXCEPTION 'resident_subscription_rates table missing (effective-dated rates)';
    END IF;

    RAISE NOTICE 'Subscription rates table verified';
END $$;

-- Verify cash transfer ledger table exists
DO $$
DECLARE
    cash_transfers_exist boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'cash_transfers'
    ) INTO cash_transfers_exist;

    IF NOT cash_transfers_exist THEN
        RAISE EXCEPTION 'cash_transfers table missing';
    END IF;

    RAISE NOTICE 'Cash transfer ledger verified';
END $$;

-- Verify income purpose column and constraint (purpose-aware collections)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'income' AND column_name = 'purpose_code'
    ) THEN
        RAISE EXCEPTION 'income.purpose_code column missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.income'::regclass AND conname = 'income_purpose_code_check'
    ) THEN
        RAISE EXCEPTION 'income_purpose_code_check constraint missing';
    END IF;

    RAISE NOTICE 'Income purpose mapping verified';
END $$;

-- Verify the settlement ledger table, its guards and its read policy
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'resident_adjustments'
    ) THEN
        RAISE EXCEPTION 'resident_adjustments table missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.resident_adjustments'::regclass
          AND conname = 'resident_adjustments_kind_check'
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.resident_adjustments'::regclass
          AND conname = 'resident_adjustments_amount_check'
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.resident_adjustments'::regclass
          AND conname = 'resident_adjustments_month_start_check'
    ) THEN
        RAISE EXCEPTION 'resident_adjustments constraints missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'resident_adjustments'
          AND policyname = 'resident_adjustments_manager_or_owner_select'
    ) THEN
        RAISE EXCEPTION 'resident_adjustments select policy missing';
    END IF;

    RAISE NOTICE 'Resident adjustments ledger verified';
END $$;

-- Verify the editable billing start month and its month-start guard
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'residents'
          AND column_name = 'billing_start_month'
    ) THEN
        RAISE EXCEPTION 'residents.billing_start_month column missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.residents'::regclass
          AND conname = 'residents_billing_start_month_check'
    ) THEN
        RAISE EXCEPTION 'residents_billing_start_month_check constraint missing';
    END IF;

    RAISE NOTICE 'Resident billing start month verified';
END $$;

-- Verify notifications table exists
DO $$
DECLARE
    notifications_exist boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'notifications'
    ) INTO notifications_exist;

    IF NOT notifications_exist THEN
        RAISE EXCEPTION 'notifications table missing';
    END IF;

    RAISE NOTICE 'Notifications table verified';
END $$;

-- Verify at least one building exists (for seeded data)
DO $$
DECLARE
    building_count bigint;
BEGIN
    SELECT count(*) INTO building_count FROM public.buildings;
    
    IF building_count = 0 THEN
        RAISE NOTICE 'WARNING: No buildings found (database may be empty)';
    ELSE
        RAISE NOTICE 'Buildings verified: % found', building_count;
END IF;
END $$;

-- Verify foreign key indexes exist (from migrations)
DO $$
DECLARE
    expected_indexes text[] := ARRAY[
        'building_mutations_request_unique',
        'resident_subscription_rates_lookup_idx',
        'resident_subscription_rates_resident_id_effective_month_key',
        'resident_subscription_rate_changes_lookup_idx',
        'cash_transfers_building_transferred_idx',
        'cash_transfers_request_unique',
        'income_building_purpose_idx',
        'resident_adjustments_building_month_idx',
        'resident_adjustments_resident_month_idx',
        'notifications_dedupe_scope_unique',
        'notifications_target_user_id_idx'
    ];
    missing_indexes text[];
BEGIN
    SELECT array_agg(expected.name) INTO missing_indexes
    FROM unnest(expected_indexes) AS expected(name)
    WHERE NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = expected.name
    );

    IF array_length(missing_indexes, 1) > 0 THEN
        RAISE EXCEPTION 'Missing expected indexes: %', missing_indexes;
    END IF;

    RAISE NOTICE 'Foreign key indexes verified';
END $$;

-- Verify no orphaned data (foreign key violations)
DO $$
DECLARE
    orphan_count integer;
BEGIN
    -- Check income without resident
    SELECT count(*) INTO orphan_count
    FROM public.income i
    LEFT JOIN public.residents r ON i.resident_id = r.id
    WHERE r.id IS NULL;
    
    IF orphan_count > 0 THEN
        RAISE EXCEPTION 'Orphaned income records found: %', orphan_count;
    END IF;
    
    -- Check expenses without building
    SELECT count(*) INTO orphan_count
    FROM public.expenses e
    LEFT JOIN public.buildings b ON e.building_id = b.id
    WHERE b.id IS NULL;
    
    IF orphan_count > 0 THEN
        RAISE EXCEPTION 'Orphaned expense records found: %', orphan_count;
    END IF;

    -- Check residents without building
    SELECT count(*) INTO orphan_count
    FROM public.residents r
    LEFT JOIN public.buildings b ON b.id = r.building_id
    WHERE b.id IS NULL;

    IF orphan_count > 0 THEN
        RAISE EXCEPTION 'Orphaned resident records found: %', orphan_count;
    END IF;

    -- Check cash transfers without building
    SELECT count(*) INTO orphan_count
    FROM public.cash_transfers c
    LEFT JOIN public.buildings b ON b.id = c.building_id
    WHERE b.id IS NULL;

    IF orphan_count > 0 THEN
        RAISE EXCEPTION 'Orphaned cash transfer records found: %', orphan_count;
    END IF;
    
    RAISE NOTICE 'Referential integrity verified';
END $$;

COMMIT;

-- Summary
SELECT 'Post-restore verification completed successfully' AS status;
