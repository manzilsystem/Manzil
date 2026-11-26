-- Notification dedupe guard: target_scope must never be NULL.
-- Building-scoped notifications (no target user) used to store NULL in
-- target_scope, and Postgres unique indexes treat NULLs as distinct, so the
-- notifications_dedupe_scope_unique index never deduplicated them.
-- target_scope is now generated from target_user_id (zero-uuid for building
-- scope), matching the shape production already carries. Idempotent: it is a
-- no-op where the generated column already exists.

DO $migration$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'notifications'
          AND column_name = 'target_scope'
          AND is_generated = 'ALWAYS'
    ) THEN
        RAISE NOTICE 'notifications.target_scope is already generated; skipping';
        RETURN;
    END IF;

    -- Dropping the column also drops the dedupe unique index that depends on it.
    ALTER TABLE public.notifications DROP COLUMN target_scope;
    ALTER TABLE public.notifications ADD COLUMN target_scope uuid
        GENERATED ALWAYS AS (
            COALESCE(target_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
        ) STORED;
END
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_scope_unique
    ON public.notifications (building_id, target_scope, dedupe_key);
