-- Separate lock-state checks from failed credential attempts.
-- Transient Auth outages must not consume an owner's PIN attempts.
CREATE OR REPLACE FUNCTION public.owner_login_rate_limit(
    p_phone_hash text,
    p_action text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $function$
DECLARE
    v_now timestamptz := clock_timestamp();
    v_window_started_at timestamptz;
    v_failed_attempts integer;
    v_locked_until timestamptz;
    v_retry_after integer;
BEGIN
    IF p_phone_hash IS NULL OR p_phone_hash !~ '^[0-9a-f]{64}$'
       OR p_action IS NULL OR p_action NOT IN ('attempt', 'release', 'success') THEN
        RAISE EXCEPTION 'invalid_owner_login_rate_limit_request'
            USING ERRCODE = '22023';
    END IF;

    IF p_action = 'success' THEN
        DELETE FROM private.owner_login_attempts
        WHERE phone_hash = p_phone_hash;
        RETURN jsonb_build_object('allowed', true, 'reset', true);
    END IF;

    IF p_action = 'release' THEN
        UPDATE private.owner_login_attempts
        SET failed_attempts = GREATEST(0, failed_attempts - 1),
            locked_until = CASE WHEN failed_attempts <= 6 THEN NULL ELSE locked_until END,
            updated_at = v_now
        WHERE phone_hash = p_phone_hash;
        RETURN jsonb_build_object('allowed', true, 'released', true);
    END IF;

    INSERT INTO private.owner_login_attempts (phone_hash, window_started_at, failed_attempts, updated_at)
    VALUES (p_phone_hash, v_now, 0, v_now)
    ON CONFLICT (phone_hash) DO NOTHING;

    SELECT window_started_at, failed_attempts, locked_until
    INTO v_window_started_at, v_failed_attempts, v_locked_until
    FROM private.owner_login_attempts
    WHERE phone_hash = p_phone_hash
    FOR UPDATE;

    IF v_locked_until IS NOT NULL AND v_locked_until > v_now THEN
        v_retry_after := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_locked_until - v_now)))::integer);
        RETURN jsonb_build_object('allowed', false, 'retry_after_seconds', v_retry_after);
    END IF;

    IF v_window_started_at <= v_now - interval '15 minutes' THEN
        v_window_started_at := v_now;
        v_failed_attempts := 0;
        v_locked_until := NULL;
    END IF;

    v_failed_attempts := v_failed_attempts + 1;
    IF v_failed_attempts > 5 THEN
        v_locked_until := v_now + interval '15 minutes';
    ELSE
        v_locked_until := NULL;
    END IF;

    UPDATE private.owner_login_attempts
    SET window_started_at = v_window_started_at,
        failed_attempts = v_failed_attempts,
        locked_until = v_locked_until,
        updated_at = v_now
    WHERE phone_hash = p_phone_hash;

    IF v_locked_until IS NOT NULL THEN
        RETURN jsonb_build_object('allowed', false, 'retry_after_seconds', 900);
    END IF;

    RETURN jsonb_build_object(
        'allowed', true,
        'attempts_remaining', GREATEST(0, 5 - v_failed_attempts)
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.owner_login_rate_limit(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_login_rate_limit(text, text) TO service_role;
