-- A request identifier must always represent the exact same transfer payload.
-- Reject changed payloads instead of silently accepting them as successful retries.

CREATE OR REPLACE FUNCTION private.transfer_cash_between_accounts(
    p_building_id uuid,
    p_request_id uuid,
    p_expected_version bigint,
    p_from_account_code text,
    p_to_account_code text,
    p_amount numeric,
    p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_actor uuid := auth.uid();
    v_version bigint;
    v_next_version bigint;
    v_transfer_id uuid;
    v_audit_log_id uuid;
    v_existing_from_account_code text;
    v_existing_to_account_code text;
    v_existing_amount numeric;
    v_existing_notes text;
    v_available numeric;
    v_summary jsonb;
BEGIN
    IF v_actor IS NULL OR p_building_id IS NULL OR p_request_id IS NULL
       OR p_expected_version IS NULL OR p_expected_version < 1
       OR p_amount IS NULL OR p_amount <= 0
       OR p_from_account_code IS NULL OR p_to_account_code IS NULL
       OR p_from_account_code NOT IN ('main', 'development', 'emergency')
       OR p_to_account_code NOT IN ('main', 'development', 'emergency')
       OR p_from_account_code = p_to_account_code
       OR length(COALESCE(p_notes, '')) > 500 THEN
        RAISE EXCEPTION 'invalid_cash_transfer' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.building_members member
        WHERE member.building_id = p_building_id
          AND member.user_id = v_actor
          AND member.role = 'manager'
    ) THEN
        RAISE EXCEPTION 'manager_only' USING ERRCODE = '42501';
    END IF;

    -- Serialize transfers against snapshot writes for this building.
    SELECT building.state_version
    INTO v_version
    FROM public.buildings building
    WHERE building.id = p_building_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'building_not_found' USING ERRCODE = 'P0002';
    END IF;

    SELECT transfer.id, transfer.audit_log_id,
           transfer.from_account_code, transfer.to_account_code,
           transfer.amount, transfer.notes
    INTO v_transfer_id, v_audit_log_id,
         v_existing_from_account_code, v_existing_to_account_code,
         v_existing_amount, v_existing_notes
    FROM public.cash_transfers transfer
    WHERE transfer.building_id = p_building_id
      AND transfer.request_id = p_request_id;

    IF FOUND THEN
        IF v_existing_from_account_code IS DISTINCT FROM p_from_account_code
           OR v_existing_to_account_code IS DISTINCT FROM p_to_account_code
           OR v_existing_amount IS DISTINCT FROM p_amount
           OR v_existing_notes IS DISTINCT FROM NULLIF(btrim(p_notes), '') THEN
            RAISE EXCEPTION 'cash_transfer_idempotency_key_reused' USING ERRCODE = '22023';
        END IF;

        v_summary := private.get_cashbox_summary(p_building_id);
        RETURN jsonb_build_object(
            'ok', true,
            'duplicate', true,
            'version', v_version,
            'transfer_id', v_transfer_id,
            'audit_log_id', v_audit_log_id,
            'balances', v_summary->'balances'
        );
    END IF;

    IF v_version <> p_expected_version THEN
        RETURN jsonb_build_object(
            'ok', false,
            'conflict', true,
            'version', v_version
        );
    END IF;

    v_summary := private.get_cashbox_summary(p_building_id);
    v_available := COALESCE((v_summary #>> ARRAY['balances', p_from_account_code])::numeric, 0);

    IF p_amount > v_available THEN
        RETURN jsonb_build_object(
            'ok', false,
            'insufficient_balance', true,
            'available_balance', v_available,
            'version', v_version
        );
    END IF;

    INSERT INTO public.cash_transfers (
        building_id, request_id, from_account_code, to_account_code,
        amount, notes, created_by
    )
    VALUES (
        p_building_id, p_request_id, p_from_account_code, p_to_account_code,
        p_amount, NULLIF(btrim(p_notes), ''), v_actor
    )
    RETURNING id INTO v_transfer_id;

    UPDATE public.buildings
    SET state_version = state_version + 1,
        updated_at = now()
    WHERE id = p_building_id
    RETURNING state_version INTO v_next_version;

    INSERT INTO public.audit_logs (id, building_id, action, details, actor_id)
    VALUES (
        gen_random_uuid(),
        p_building_id,
        'تحويل بين الصناديق',
        p_from_account_code || ' → ' || p_to_account_code || ' · ' || p_amount::text || ' ج.م',
        v_actor
    ) RETURNING id INTO v_audit_log_id;

    UPDATE public.cash_transfers
    SET audit_log_id = v_audit_log_id
    WHERE id = v_transfer_id;

    v_summary := private.get_cashbox_summary(p_building_id);
    RETURN jsonb_build_object(
        'ok', true,
        'duplicate', false,
        'version', v_next_version,
        'transfer_id', v_transfer_id,
        'audit_log_id', v_audit_log_id,
        'balances', v_summary->'balances'
    );
END;
$$;
REVOKE ALL ON FUNCTION private.transfer_cash_between_accounts(uuid, uuid, bigint, text, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.transfer_cash_between_accounts(uuid, uuid, bigint, text, text, numeric, text) TO authenticated;

