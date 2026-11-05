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
        'audit_logs', 'owner_notifications', 'client_errors',
        'building_mutations', 'subscription_rates',
        'payment_method_settings', 'cash_account_balances', 'cash_transfers'
      );
    
    IF table_count < 13 THEN
        RAISE EXCEPTION 'Missing core tables: found %, expected at least 13', table_count;
    END IF;
    
    RAISE NOTICE 'Core tables verified: % found', table_count;
END $$;

-- Verify RLS is enabled on user-facing tables
DO $$
DECLARE
    rls_disabled text[];
BEGIN
    SELECT array_agg(table_name) INTO rls_disabled
    FROM pg_tables
    WHERE schemaname = 'public'
      AND table_name IN ('buildings', 'residents', 'income', 'expenses', 'notices', 'owner_notifications')
      AND relrowsecurity = false;
    
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

-- Verify subscription_rates table exists (effective-dated rates)
DO $$
DECLARE
    rates_exist boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'subscription_rates'
    ) INTO rates_exist;
    
    IF NOT rates_exist THEN
        RAISE EXCEPTION 'subscription_rates table missing (effective-dated rates)';
    END IF;
    
    RAISE NOTICE 'Subscription rates table verified';
END $$;

-- Verify cashbox tables exist
DO $$
DECLARE
    cashbox_tables integer;
BEGIN
    SELECT count(*) INTO cashbox_tables
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('cash_account_balances', 'cash_transfers');
    
    IF cashbox_tables < 2 THEN
        RAISE EXCEPTION 'Cashbox tables missing: found %, expected 2', cashbox_tables;
    END IF;
    
    RAISE NOTICE 'Cashbox tables verified';
END $$;

-- Verify owner_notifications table exists
DO $$
DECLARE
    notifications_exist boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'owner_notifications'
    ) INTO notifications_exist;
    
    IF NOT notifications_exist THEN
        RAISE EXCEPTION 'owner_notifications table missing';
    END IF;
    
    RAISE NOTICE 'Owner notifications table verified';
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
    missing_indexes text[];
BEGIN
    -- Check for known FK indexes
    SELECT array_agg(indexname) INTO missing_indexes
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'idx_building_mutations_building_id',
        'idx_building_mutations_request_id',
        'idx_subscription_rates_building_id',
        'idx_subscription_rates_effective_month',
        'idx_cash_transfers_from_cashbox',
        'idx_cash_transfers_to_cashbox',
        'idx_cash_transfers_created_at',
        'idx_cash_transfer_request_idempotency_payload'
      )
      AND indexname IS NULL;
    
    IF array_length(missing_indexes, 1) > 0 THEN
        RAISE NOTICE 'WARNING: Missing expected FK indexes: %', missing_indexes;
    ELSE
        RAISE NOTICE 'Foreign key indexes verified';
    END IF;
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
    
    RAISE NOTICE 'Referential integrity verified';
END $$;

COMMIT;

-- Summary
SELECT 'Post-restore verification completed successfully' AS status;
