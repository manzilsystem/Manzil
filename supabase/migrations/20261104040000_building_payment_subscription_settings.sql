ALTER TABLE public.buildings
    ADD COLUMN IF NOT EXISTS payment_settings jsonb NOT NULL DEFAULT
        '{"cash":{"enabled":true},"wallet":{"enabled":true,"provider":"","accountName":"","number":""},"instapay":{"enabled":true,"accountName":"","address":""},"bank_transfer":{"enabled":true,"bankName":"","accountName":"","accountNumber":"","iban":""}}'::jsonb,
    ADD COLUMN IF NOT EXISTS subscription_due_day smallint NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS subscription_grace_days smallint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS payment_allocation_policy text NOT NULL DEFAULT 'oldest_first';

DO $migration$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.buildings'::regclass AND conname = 'buildings_payment_settings_shape_check') THEN
        ALTER TABLE public.buildings ADD CONSTRAINT buildings_payment_settings_shape_check CHECK (
            jsonb_typeof(payment_settings) = 'object'
            AND payment_settings ?& ARRAY['cash','wallet','instapay','bank_transfer']::text[]
            AND jsonb_typeof(payment_settings#>'{cash,enabled}') = 'boolean'
            AND jsonb_typeof(payment_settings#>'{wallet,enabled}') = 'boolean'
            AND jsonb_typeof(payment_settings#>'{instapay,enabled}') = 'boolean'
            AND jsonb_typeof(payment_settings#>'{bank_transfer,enabled}') = 'boolean'
            AND (
                payment_settings#>>'{cash,enabled}' = 'true'
                OR payment_settings#>>'{wallet,enabled}' = 'true'
                OR payment_settings#>>'{instapay,enabled}' = 'true'
                OR payment_settings#>>'{bank_transfer,enabled}' = 'true'
            )
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.buildings'::regclass AND conname = 'buildings_subscription_due_day_check') THEN
        ALTER TABLE public.buildings ADD CONSTRAINT buildings_subscription_due_day_check CHECK (subscription_due_day BETWEEN 1 AND 28);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.buildings'::regclass AND conname = 'buildings_subscription_grace_days_check') THEN
        ALTER TABLE public.buildings ADD CONSTRAINT buildings_subscription_grace_days_check CHECK (subscription_grace_days BETWEEN 0 AND 31);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.buildings'::regclass AND conname = 'buildings_payment_allocation_policy_check') THEN
        ALTER TABLE public.buildings ADD CONSTRAINT buildings_payment_allocation_policy_check CHECK (payment_allocation_policy IN ('oldest_first', 'selected_month_first'));
    END IF;
END;
$migration$;

CREATE OR REPLACE FUNCTION private.persist_building_snapshot(p_building_id uuid, p_expected_version bigint, p_request_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_actor uuid := auth.uid();
    v_version bigint;
    v_next_version bigint;
    v_existing_version bigint;
    v_resident_ids uuid[];
    v_income_ids uuid[];
    v_expense_ids uuid[];
    v_notice_ids uuid[];
BEGIN
    IF v_actor IS NULL OR p_building_id IS NULL OR p_request_id IS NULL
       OR p_expected_version IS NULL OR p_expected_version < 1
       OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
       OR jsonb_typeof(p_payload->'building') IS DISTINCT FROM 'object'
       OR jsonb_typeof(p_payload->'residents') IS DISTINCT FROM 'array'
       OR jsonb_typeof(p_payload->'income') IS DISTINCT FROM 'array'
       OR jsonb_typeof(p_payload->'expenses') IS DISTINCT FROM 'array'
       OR jsonb_typeof(p_payload->'notices') IS DISTINCT FROM 'array'
       OR jsonb_typeof(p_payload->'audit_logs') IS DISTINCT FROM 'array'
       OR (p_payload ? 'subscription_rates'
           AND jsonb_typeof(p_payload->'subscription_rates') IS DISTINCT FROM 'array') THEN
        RAISE EXCEPTION 'invalid_snapshot_payload' USING ERRCODE = '22023';
    END IF;
    IF p_payload->'building' ? 'payment_settings' AND (
        jsonb_typeof(p_payload#>'{building,payment_settings}') IS DISTINCT FROM 'object'
        OR NOT ((p_payload#>'{building,payment_settings}') ?& ARRAY['cash','wallet','instapay','bank_transfer']::text[])
        OR jsonb_typeof(p_payload#>'{building,payment_settings,cash,enabled}') IS DISTINCT FROM 'boolean'
        OR jsonb_typeof(p_payload#>'{building,payment_settings,wallet,enabled}') IS DISTINCT FROM 'boolean'
        OR jsonb_typeof(p_payload#>'{building,payment_settings,instapay,enabled}') IS DISTINCT FROM 'boolean'
        OR jsonb_typeof(p_payload#>'{building,payment_settings,bank_transfer,enabled}') IS DISTINCT FROM 'boolean'
        OR (
            COALESCE(p_payload#>>'{building,payment_settings,cash,enabled}', 'false') <> 'true'
            AND COALESCE(p_payload#>>'{building,payment_settings,wallet,enabled}', 'false') <> 'true'
            AND COALESCE(p_payload#>>'{building,payment_settings,instapay,enabled}', 'false') <> 'true'
            AND COALESCE(p_payload#>>'{building,payment_settings,bank_transfer,enabled}', 'false') <> 'true'
        )
    ) THEN
        RAISE EXCEPTION 'invalid_building_payment_settings' USING ERRCODE = '22023';
    END IF;

    IF p_payload->'building' ? 'subscription_due_day'
       AND (CASE
           WHEN COALESCE(p_payload#>>'{building,subscription_due_day}', '') ~ '^[0-9]+$'
           THEN (p_payload#>>'{building,subscription_due_day}')::integer BETWEEN 1 AND 28
           ELSE false
       END) IS NOT TRUE THEN
        RAISE EXCEPTION 'invalid_subscription_due_day' USING ERRCODE = '22023';
    END IF;

    IF p_payload->'building' ? 'subscription_grace_days'
       AND (CASE
           WHEN COALESCE(p_payload#>>'{building,subscription_grace_days}', '') ~ '^[0-9]+$'
           THEN (p_payload#>>'{building,subscription_grace_days}')::integer BETWEEN 0 AND 31
           ELSE false
       END) IS NOT TRUE THEN
        RAISE EXCEPTION 'invalid_subscription_grace_days' USING ERRCODE = '22023';
    END IF;

    IF p_payload->'building' ? 'payment_allocation_policy'
       AND COALESCE(p_payload#>>'{building,payment_allocation_policy}', '')
           NOT IN ('oldest_first', 'selected_month_first') THEN
        RAISE EXCEPTION 'invalid_payment_allocation_policy' USING ERRCODE = '22023';
    END IF;


    IF NOT EXISTS (
        SELECT 1 FROM public.building_members bm
        WHERE bm.building_id = p_building_id
          AND bm.user_id = v_actor
          AND bm.role = 'manager'
    ) THEN
        RAISE EXCEPTION 'manager_only' USING ERRCODE = '42501';
    END IF;

    SELECT b.state_version INTO v_version
    FROM public.buildings b
    WHERE b.id = p_building_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'building_not_found' USING ERRCODE = 'P0002';
    END IF;

    SELECT m.resulting_version INTO v_existing_version
    FROM public.building_mutations m
    WHERE m.building_id = p_building_id AND m.request_id = p_request_id;

    IF FOUND THEN
        IF v_version > v_existing_version THEN
            RETURN jsonb_build_object('ok', false, 'conflict', true, 'duplicate', true, 'current_version', v_version);
        END IF;
        RETURN jsonb_build_object('ok', true, 'duplicate', true, 'version', v_existing_version);
    END IF;

    IF v_version <> p_expected_version THEN
        RETURN jsonb_build_object('ok', false, 'conflict', true, 'current_version', v_version);
    END IF;

    SELECT COALESCE(array_agg(x.id), ARRAY[]::uuid[]) INTO v_resident_ids
    FROM jsonb_to_recordset(p_payload->'residents') AS x(id uuid);
    SELECT COALESCE(array_agg(x.id), ARRAY[]::uuid[]) INTO v_income_ids
    FROM jsonb_to_recordset(p_payload->'income') AS x(id uuid);
    SELECT COALESCE(array_agg(x.id), ARRAY[]::uuid[]) INTO v_expense_ids
    FROM jsonb_to_recordset(p_payload->'expenses') AS x(id uuid);
    SELECT COALESCE(array_agg(x.id), ARRAY[]::uuid[]) INTO v_notice_ids
    FROM jsonb_to_recordset(p_payload->'notices') AS x(id uuid);

    IF p_payload ? 'subscription_rates' THEN
        IF EXISTS (
            SELECT 1 FROM jsonb_to_recordset(p_payload->'subscription_rates') AS rate(
                resident_id uuid, effective_month date, monthly_amount numeric
            ) WHERE rate.effective_month IS NULL
               OR EXTRACT(DAY FROM rate.effective_month) <> 1
        ) THEN
            RAISE EXCEPTION 'invalid_subscription_rate_month' USING ERRCODE = '22023';
        END IF;
        IF EXISTS (
            SELECT 1 FROM jsonb_to_recordset(p_payload->'subscription_rates') AS rate(
                resident_id uuid, effective_month date, monthly_amount numeric
            ) WHERE rate.monthly_amount IS NULL OR rate.monthly_amount < 0
        ) THEN
            RAISE EXCEPTION 'invalid_subscription_rate_amount' USING ERRCODE = '22023';
        END IF;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_payload->'income') AS payment(payment_method text)
        WHERE payment.payment_method IS NOT NULL
          AND payment.payment_method NOT IN ('cash', 'wallet', 'instapay', 'bank_transfer')
    ) THEN
        RAISE EXCEPTION 'invalid_income_payment_method' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_payload->'expenses') AS expense(
            id uuid, cash_account_code text
        )
        WHERE COALESCE(NULLIF(expense.cash_account_code, ''), 'main')
            NOT IN ('main', 'development', 'emergency')
    ) THEN
        RAISE EXCEPTION 'invalid_cash_account_code' USING ERRCODE = '22023';
    END IF;

    -- Fund accounts may only spend money explicitly transferred into them.
    -- The main account keeps the legacy balance behavior for backwards compatibility.
    IF EXISTS (
        SELECT 1
        FROM (VALUES ('development'), ('emergency')) AS fund(account_code)
        WHERE
            COALESCE((
                SELECT SUM(transfer.amount)
                FROM public.cash_transfers transfer
                WHERE transfer.building_id = p_building_id
                  AND transfer.to_account_code = fund.account_code
            ), 0)
            - COALESCE((
                SELECT SUM(transfer.amount)
                FROM public.cash_transfers transfer
                WHERE transfer.building_id = p_building_id
                  AND transfer.from_account_code = fund.account_code
            ), 0)
            - COALESCE((
                SELECT SUM(expense.amount)
                FROM jsonb_to_recordset(p_payload->'expenses') AS expense(
                    amount numeric, cash_account_code text
                )
                WHERE COALESCE(NULLIF(expense.cash_account_code, ''), 'main') = fund.account_code
            ), 0) < 0
    ) THEN
        RAISE EXCEPTION 'insufficient_fund_balance' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (SELECT 1 FROM public.residents r WHERE r.id = ANY(v_resident_ids) AND r.building_id <> p_building_id)
       OR EXISTS (SELECT 1 FROM public.income i WHERE i.id = ANY(v_income_ids) AND i.building_id <> p_building_id)
       OR EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = ANY(v_expense_ids) AND e.building_id <> p_building_id)
       OR EXISTS (SELECT 1 FROM public.notices n WHERE n.id = ANY(v_notice_ids) AND n.building_id <> p_building_id) THEN
        RAISE EXCEPTION 'cross_building_record_reference' USING ERRCODE = '42501';
    END IF;

    -- SECURITY DEFINER bypasses RLS; every payment must reference a resident
    -- included in this building snapshot.
    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_payload->'income') AS payment(resident_id uuid)
        LEFT JOIN jsonb_to_recordset(p_payload->'residents') AS resident(id uuid)
            ON resident.id = payment.resident_id
        WHERE payment.resident_id IS NULL OR resident.id IS NULL
    ) THEN
        RAISE EXCEPTION 'income_resident_not_in_snapshot' USING ERRCODE = '42501';
    END IF;

    -- Preserve financial history when a resident is removed from the snapshot.
    -- Explicit deletion of a payment remains a separate manager action.
    IF EXISTS (
        SELECT 1
        FROM public.residents r
        WHERE r.building_id = p_building_id
          AND NOT (r.id = ANY(v_resident_ids))
          AND EXISTS (
              SELECT 1 FROM public.income i
              WHERE i.building_id = p_building_id AND i.resident_id = r.id
          )
    ) THEN
        RAISE EXCEPTION 'cannot_delete_resident_with_income_history' USING ERRCODE = '23503';
    END IF;

    UPDATE public.buildings
    SET name = COALESCE(NULLIF(p_payload#>>'{building,name}', ''), 'Manzil'),
        manager_name = COALESCE(p_payload#>>'{building,manager_name}', ''),
        manager_phone = NULLIF(p_payload#>>'{building,manager_phone}', ''),
        default_subscription = COALESCE(NULLIF(p_payload#>>'{building,default_subscription}', '')::numeric, 0),
        starting_balance = COALESCE(NULLIF(p_payload#>>'{building,starting_balance}', '')::numeric, 0),
        current_theme = COALESCE(NULLIF(p_payload#>>'{building,current_theme}', ''), 'dark'),
        payment_settings = CASE
            WHEN p_payload->'building' ? 'payment_settings'
                THEN p_payload#>'{building,payment_settings}'
            ELSE payment_settings
        END,
        subscription_due_day = CASE
            WHEN p_payload->'building' ? 'subscription_due_day'
                THEN (p_payload#>>'{building,subscription_due_day}')::smallint
            ELSE subscription_due_day
        END,
        subscription_grace_days = CASE
            WHEN p_payload->'building' ? 'subscription_grace_days'
                THEN (p_payload#>>'{building,subscription_grace_days}')::smallint
            ELSE subscription_grace_days
        END,
        payment_allocation_policy = CASE
            WHEN p_payload->'building' ? 'payment_allocation_policy'
                THEN p_payload#>>'{building,payment_allocation_policy}'
            ELSE payment_allocation_policy
        END,
        state_version = state_version + 1,
        updated_at = now()
    WHERE id = p_building_id
    RETURNING state_version INTO v_next_version;

    INSERT INTO public.residents AS current_resident
        (id, building_id, user_id, name, apartment_number, floor, phone, monthly_amount, notes, created_at)
    SELECT x.id, p_building_id, x.user_id, x.name, x.apartment_number, x.floor, x.phone,
           COALESCE(x.monthly_amount, 0), x.notes, COALESCE(x.created_at, now())
    FROM jsonb_to_recordset(p_payload->'residents') AS x(
        id uuid, user_id uuid, name text, apartment_number text, floor text, phone text,
        monthly_amount numeric, notes text, created_at timestamptz
    )
    ON CONFLICT (id) DO UPDATE SET
        user_id = EXCLUDED.user_id, name = EXCLUDED.name,
        apartment_number = EXCLUDED.apartment_number,
        floor = CASE
            WHEN EXISTS (
                SELECT 1
                FROM jsonb_array_elements(p_payload->'residents') AS payload_resident
                WHERE payload_resident->>'id' = current_resident.id::text
                  AND payload_resident ? 'floor'
            ) THEN EXCLUDED.floor
            ELSE current_resident.floor
        END,
        phone = EXCLUDED.phone,
        monthly_amount = EXCLUDED.monthly_amount, notes = EXCLUDED.notes
    WHERE current_resident.building_id = p_building_id;

    IF p_payload ? 'subscription_rates' AND EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_payload->'subscription_rates') AS rate(
            resident_id uuid, effective_month date, monthly_amount numeric
        )
        LEFT JOIN public.residents resident
            ON resident.id = rate.resident_id AND resident.building_id = p_building_id
        WHERE resident.id IS NULL
    ) THEN
        RAISE EXCEPTION 'subscription_rate_resident_not_in_building' USING ERRCODE = '22023';
    END IF;

    -- Subscription history is persisted in this same transaction as the snapshot.
    -- Omitted by older clients: preserve existing history during rolling deployments.
    IF p_payload ? 'subscription_rates' THEN
        INSERT INTO public.resident_subscription_rates AS current_rate
            (building_id, resident_id, effective_month, monthly_amount, created_by)
        SELECT p_building_id, x.resident_id, x.effective_month, x.monthly_amount, v_actor
        FROM jsonb_to_recordset(p_payload->'subscription_rates') AS x(
            resident_id uuid, effective_month date, monthly_amount numeric
        )
        ON CONFLICT (resident_id, effective_month) DO UPDATE SET
            monthly_amount = EXCLUDED.monthly_amount,
            created_by = EXCLUDED.created_by,
            created_at = now()
        WHERE current_rate.building_id = p_building_id;
    END IF;

    INSERT INTO public.income AS current_income
        (id, building_id, resident_id, amount, month, notes, payment_method, paid_at, created_by)
    SELECT x.id, p_building_id, x.resident_id, x.amount, x.month, x.notes,
           x.payment_method, COALESCE(x.paid_at, now()), v_actor
    FROM jsonb_to_recordset(p_payload->'income') AS x(
        id uuid, resident_id uuid, amount numeric, month text, notes text,
        payment_method text, paid_at timestamptz
    )
    ON CONFLICT (id) DO UPDATE SET
        resident_id = EXCLUDED.resident_id, amount = EXCLUDED.amount,
        month = EXCLUDED.month, notes = EXCLUDED.notes,
        payment_method = EXCLUDED.payment_method, paid_at = EXCLUDED.paid_at
    WHERE current_income.building_id = p_building_id;

    INSERT INTO public.expenses AS current_expense
        (id, building_id, title, amount, category, month, notes, spent_at, created_by, cash_account_code)
    SELECT x.id, p_building_id, x.title, x.amount, COALESCE(x.category, 'أخرى'),
           x.month, x.notes, COALESCE(x.spent_at, now()), v_actor,
           COALESCE(NULLIF(x.cash_account_code, ''), 'main')
    FROM jsonb_to_recordset(p_payload->'expenses') AS x(
        id uuid, title text, amount numeric, category text, month text, notes text,
        spent_at timestamptz, cash_account_code text
    )
    ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title, amount = EXCLUDED.amount, category = EXCLUDED.category,
        month = EXCLUDED.month, notes = EXCLUDED.notes, spent_at = EXCLUDED.spent_at,
        cash_account_code = EXCLUDED.cash_account_code
    WHERE current_expense.building_id = p_building_id;

    INSERT INTO public.notices AS current_notice (id, building_id, text, created_by, created_at)
    SELECT x.id, p_building_id, x.text, v_actor, COALESCE(x.created_at, now())
    FROM jsonb_to_recordset(p_payload->'notices') AS x(id uuid, text text, created_at timestamptz)
    ON CONFLICT (id) DO UPDATE SET text = EXCLUDED.text
    WHERE current_notice.building_id = p_building_id;

    INSERT INTO public.audit_logs (id, building_id, action, details, actor_id, created_at)
    SELECT x.id, p_building_id, x.action, x.details, v_actor, COALESCE(x.created_at, now())
    FROM jsonb_to_recordset(p_payload->'audit_logs') AS x(
        id uuid, action text, details text, created_at timestamptz
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.building_members (building_id, user_id, role)
    SELECT p_building_id, r.user_id, 'owner'::public.app_role
    FROM public.residents r
    WHERE r.building_id = p_building_id AND r.user_id IS NOT NULL
    ON CONFLICT (building_id, user_id) DO NOTHING;

    DELETE FROM public.income i
    WHERE i.building_id = p_building_id
      AND NOT EXISTS (SELECT 1 FROM unnest(v_income_ids) AS keep(id) WHERE keep.id = i.id);

    DELETE FROM public.expenses e
    WHERE e.building_id = p_building_id
      AND NOT EXISTS (SELECT 1 FROM unnest(v_expense_ids) AS keep(id) WHERE keep.id = e.id);

    DELETE FROM public.notices n
    WHERE n.building_id = p_building_id
      AND NOT EXISTS (SELECT 1 FROM unnest(v_notice_ids) AS keep(id) WHERE keep.id = n.id);

    DELETE FROM public.residents r
    WHERE r.building_id = p_building_id
      AND NOT EXISTS (SELECT 1 FROM unnest(v_resident_ids) AS keep(id) WHERE keep.id = r.id);

    DELETE FROM public.building_members bm
    WHERE bm.building_id = p_building_id AND bm.role = 'owner'
      AND NOT EXISTS (
          SELECT 1 FROM public.residents r
          WHERE r.building_id = p_building_id AND r.user_id = bm.user_id
      );

    INSERT INTO public.building_mutations (building_id, request_id, resulting_version)
    VALUES (p_building_id, p_request_id, v_next_version);

    RETURN jsonb_build_object('ok', true, 'duplicate', false, 'version', v_next_version);
END;
$function$;
