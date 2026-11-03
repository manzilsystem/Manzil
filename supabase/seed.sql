-- LOCAL-ONLY FIXTURES.
-- This file is loaded only by the local Supabase CLI after migrations.
-- All accounts, names, phones, and transactions below are fictional.
-- Never run this file against a linked or hosted database.

-- Test credentials (local stack only):
-- Manager: manager@manzil.invalid / Manzil-Local-Only-2026!
-- Owner 101: +201555001101 / PIN 123456
-- Owner 102: +201555001102 / PIN 654321

INSERT INTO auth.users (
    id, aud, role, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
(
    '10000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated',
    extensions.crypt('Manzil-Local-Only-2026!', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"مدير تجريبي"}'::jsonb, now(), now()
),
(
    '10000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated',
    extensions.crypt('123456', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"مالك تجريبي 101","phone":"+201555001101"}'::jsonb, now(), now()
),
(
    '10000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated',
    extensions.crypt('654321', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"مالك تجريبي 102","phone":"+201555001102"}'::jsonb, now(), now()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
    provider_id, user_id, identity_data, provider, email, created_at, updated_at
)
VALUES
(
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '{"sub":"10000000-0000-4000-8000-000000000001","email":"manager@manzil.invalid","email_verified":true}'::jsonb,
    'email', 'manager@manzil.invalid', now(), now()
),
(
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    '{"sub":"10000000-0000-4000-8000-000000000002","email":"201555001101@phone-login.manzil.invalid","email_verified":true}'::jsonb,
    'email', '201555001101@phone-login.manzil.invalid', now(), now()
),
(
    '10000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000003',
    '{"sub":"10000000-0000-4000-8000-000000000003","email":"201555001102@phone-login.manzil.invalid","email_verified":true}'::jsonb,
    'email', '201555001102@phone-login.manzil.invalid', now(), now()
)
ON CONFLICT (provider_id, provider) DO NOTHING;

-- The auth.users trigger creates the matching profile rows.
INSERT INTO public.profiles (id, full_name, phone, must_change_pin)
VALUES
    ('10000000-0000-4000-8000-000000000001', 'مدير تجريبي', NULL, false),
    ('10000000-0000-4000-8000-000000000002', 'مالك تجريبي 101', '+201555001101', false),
    ('10000000-0000-4000-8000-000000000003', 'مالك تجريبي 102', '+201555001102', false)
ON CONFLICT (id) DO UPDATE
SET full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    must_change_pin = EXCLUDED.must_change_pin;

INSERT INTO public.buildings (
    id, name, manager_name, manager_phone, default_subscription,
    starting_balance, current_theme, state_version
)
VALUES (
    '20000000-0000-4000-8000-000000000001',
    'عمارة الاختبار المحلية',
    'مدير تجريبي',
    '+201555001100',
    300,
    1000,
    'dark',
    1
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.building_members (building_id, user_id, role)
VALUES
    ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'manager'),
    ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'owner'),
    ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'owner')
ON CONFLICT (building_id, user_id) DO NOTHING;

INSERT INTO public.residents (
    id, building_id, user_id, name, apartment_number, phone,
    monthly_amount, notes
)
VALUES
(
    '30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    'مالك تجريبي 101', '101', '+201555001101', 250, 'حساب محلي وهمي'
),
(
    '30000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000003',
    'مالك تجريبي 102', '102', '+201555001102', 350, 'حساب محلي وهمي'
),
(
    '30000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000001',
    NULL, 'ساكن تجريبي 103', '103', '+201555001103', 300, 'شقة اختبار بلا حساب دخول'
),
(
    '30000000-0000-4000-8000-000000000004',
    '20000000-0000-4000-8000-000000000001',
    NULL, 'ساكن تجريبي 104', '104', '+201555001104', 400, 'شقة اختبار بلا حساب دخول'
)
ON CONFLICT (id) DO NOTHING;

-- Four baseline rates and one effective change for apartment 102.
INSERT INTO public.resident_subscription_rates (
    id, building_id, resident_id, effective_month, monthly_amount, created_by
)
VALUES
(
    '46000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    DATE '2026-01-01', 250, '10000000-0000-4000-8000-000000000001'
),
(
    '46000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000002',
    DATE '2026-01-01', 300, '10000000-0000-4000-8000-000000000001'
),
(
    '46000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000003',
    DATE '2026-01-01', 300, '10000000-0000-4000-8000-000000000001'
),
(
    '46000000-0000-4000-8000-000000000004',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000004',
    DATE '2026-01-01', 400, '10000000-0000-4000-8000-000000000001'
),
(
    '46000000-0000-4000-8000-000000000005',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000002',
    DATE '2026-10-01', 350, '10000000-0000-4000-8000-000000000001'
);

INSERT INTO public.income (
    id, building_id, resident_id, amount, month, notes, paid_at, created_by
)
VALUES
(
    '40000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    250, '2026-11', 'تحصيل تجريبي — شقة 101',
    TIMESTAMPTZ '2026-11-01 09:00:00+02',
    '10000000-0000-4000-8000-000000000001'
),
(
    '40000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000002',
    150, '2026-11', 'تحصيل تجريبي — شقة 102',
    TIMESTAMPTZ '2026-11-02 10:00:00+02',
    '10000000-0000-4000-8000-000000000001'
),
(
    '40000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000002',
    300, '2026-12', 'دفعة مقدمة تجريبية — ديسمبر',
    TIMESTAMPTZ '2026-11-03 08:00:00+02',
    '10000000-0000-4000-8000-000000000001'
),
(
    '40000000-0000-4000-8000-000000000004',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000002',
    300, '2027-01', 'دفعة مقدمة تجريبية — يناير',
    TIMESTAMPTZ '2026-11-03 08:05:00+02',
    '10000000-0000-4000-8000-000000000001'
);

INSERT INTO public.expenses (
    id, building_id, title, amount, category, month, notes, spent_at, created_by, cash_account_code
)
VALUES
(
    '41000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'صيانة إنارة المدخل', 180, 'صيانة', '2026-11',
    'مصروف محلي وهمي من الصندوق الرئيسي',
    TIMESTAMPTZ '2026-11-03 09:00:00+02',
    '10000000-0000-4000-8000-000000000001', 'main'
),
(
    '41000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    'شراء مستلزمات تطوير', 250, 'تطوير', '2026-11',
    'مصروف محلي وهمي من صندوق التطوير',
    TIMESTAMPTZ '2026-11-03 09:15:00+02',
    '10000000-0000-4000-8000-000000000001', 'development'
),
(
    '41000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000001',
    'إصلاح طارئ', 125, 'طوارئ', '2026-11',
    'مصروف محلي وهمي من صندوق الطوارئ',
    TIMESTAMPTZ '2026-11-03 09:30:00+02',
    '10000000-0000-4000-8000-000000000001', 'emergency'
);

INSERT INTO public.cash_transfers (
    id, building_id, request_id, from_account_code, to_account_code,
    amount, notes, transferred_at, created_by
)
VALUES
(
    '42000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '42000000-0000-4000-8000-000000000101',
    'main', 'development', 400, 'تمويل تجريبي لصندوق التطوير',
    TIMESTAMPTZ '2026-11-03 08:30:00+02',
    '10000000-0000-4000-8000-000000000001'
),
(
    '42000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    '42000000-0000-4000-8000-000000000102',
    'main', 'emergency', 300, 'تمويل تجريبي لصندوق الطوارئ',
    TIMESTAMPTZ '2026-11-03 08:45:00+02',
    '10000000-0000-4000-8000-000000000001'
);

INSERT INTO public.notices (id, building_id, text, created_by, created_at)
VALUES (
    '43000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'إعلان تجريبي: هذا النص محلي للاختبار فقط.',
    '10000000-0000-4000-8000-000000000001',
    TIMESTAMPTZ '2026-11-03 10:00:00+02'
);

INSERT INTO public.notifications (
    id, building_id, target_user_id, target_resident_id, target_scope,
    kind, dedupe_key, title, body, severity, action_path, created_by
)
VALUES
(
    '45000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'payment', 'local-seed-payment-101',
    'إشعار تحصيل تجريبي', 'تم تسجيل تحصيل تجريبي بقيمة 250 ج.م.',
    'success', '#ownerPaymentHistoryTitle',
    '10000000-0000-4000-8000-000000000001'
),
(
    '45000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000003',
    '30000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000002',
    'announcement', 'local-seed-announcement-102',
    'إعلان تجريبي', 'يوجد إعلان تجريبي مخصص لهذه الشقة.',
    'info', '#ownerNotifications',
    '10000000-0000-4000-8000-000000000001'
);

INSERT INTO public.resident_internal_notes (resident_id, building_id, notes)
VALUES (
    '30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'ملاحظة داخلية تجريبية للمدير فقط.'
);

INSERT INTO public.audit_logs (id, building_id, action, details, actor_id, created_at)
VALUES
(
    '44000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'إنشاء بيانات محلية', 'تهيئة أربع شقق تجريبية.',
    '10000000-0000-4000-8000-000000000001',
    TIMESTAMPTZ '2026-11-03 10:10:00+02'
),
(
    '44000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    'تسجيل تحصيلات تجريبية', 'أربع حركات تحصيل محلية.',
    '10000000-0000-4000-8000-000000000001',
    TIMESTAMPTZ '2026-11-03 10:20:00+02'
),
(
    '44000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000001',
    'تمويل الصناديق التجريبية', 'حركتا تحويل بين الصناديق.',
    '10000000-0000-4000-8000-000000000001',
    TIMESTAMPTZ '2026-11-03 10:30:00+02'
);

-- Fail the local reset immediately if fixtures or cashbox calculations drift.
DO $$
DECLARE
    v_building_id uuid := '20000000-0000-4000-8000-000000000001';
    v_manager_id uuid := '10000000-0000-4000-8000-000000000001';
    v_summary jsonb;
    v_monthly jsonb;
BEGIN
    IF (SELECT count(*) FROM auth.users) <> 3
       OR (SELECT count(*) FROM public.profiles) <> 3
       OR (SELECT count(*) FROM public.building_members) <> 3
       OR (SELECT count(*) FROM public.residents) <> 4
       OR (SELECT count(*) FROM public.income) <> 4
       OR (SELECT count(*) FROM public.expenses) <> 3
       OR (SELECT count(*) FROM public.cash_transfers) <> 2
       OR (SELECT count(*) FROM public.resident_subscription_rates) <> 5
       OR (SELECT count(*) FROM public.resident_subscription_rate_changes) <> 5
       OR (SELECT count(*) FROM public.notices) <> 1
       OR (SELECT count(*) FROM public.notifications) <> 2
       OR (SELECT count(*) FROM public.resident_internal_notes) <> 1
       OR (SELECT count(*) FROM public.audit_logs) <> 3 THEN
        RAISE EXCEPTION 'local_seed_count_mismatch';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM auth.identities
        WHERE user_id = v_manager_id
          AND email = 'manager@manzil.invalid'
    ) OR NOT EXISTS (
        SELECT 1 FROM auth.users
        WHERE id = v_manager_id
          AND encrypted_password = extensions.crypt('Manzil-Local-Only-2026!', encrypted_password)
    ) THEN
        RAISE EXCEPTION 'local_manager_auth_fixture_invalid';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_manager_id::text, false);
    v_summary := public.get_cashbox_summary(v_building_id);
    v_monthly := public.get_monthly_cashbox_close(v_building_id, DATE '2026-11-01');

    IF (v_summary #>> '{balances,main}')::numeric <> 1120
       OR (v_summary #>> '{balances,development}')::numeric <> 150
       OR (v_summary #>> '{balances,emergency}')::numeric <> 175 THEN
        RAISE EXCEPTION 'local_cashbox_balance_mismatch: %', v_summary;
    END IF;

    IF (v_monthly #>> '{totals,closing_balance}')::numeric <> 1445
       OR (v_monthly #>> '{accounts,main,closing_balance}')::numeric <> 1120
       OR (v_monthly #>> '{accounts,development,closing_balance}')::numeric <> 150
       OR (v_monthly #>> '{accounts,emergency,closing_balance}')::numeric <> 175
       OR coalesce((v_monthly->>'reconciled')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'local_monthly_close_mismatch: %', v_monthly;
    END IF;
END;
$$;
