-- Run with `supabase test db` against a local Supabase stack after migrations.
-- The transaction is rolled back, so this test does not retain fixture data.
create extension if not exists pgtap with schema extensions;
begin;
select extensions.plan(8);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
    ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'rls-manager@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'rls-owner-a@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.buildings (id, name) values ('rls-test', 'RLS test building');
insert into public.apartments (id, building_id, data) values
    ('rls-unit-a', 'rls-test', '{"name":"Owner A","apartmentNumber":"A"}'::jsonb),
    ('rls-unit-b', 'rls-test', '{"name":"Owner B","apartmentNumber":"B"}'::jsonb);
insert into public.profiles (id, building_id, role, apartment_id) values
    ('10000000-0000-4000-8000-000000000001', 'rls-test', 'admin', null),
    ('10000000-0000-4000-8000-000000000002', 'rls-test', 'owner', 'rls-unit-a');
insert into public.income_records (id, building_id, apartment_id, data) values
    ('rls-payment-a', 'rls-test', 'rls-unit-a', '{"amount":50}'::jsonb),
    ('rls-payment-b', 'rls-test', 'rls-unit-b', '{"amount":75}'::jsonb);
insert into public.expenses (id, building_id, data) values
    ('rls-expense-a', 'rls-test', '{"amount":25}'::jsonb);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select extensions.is((select count(*) from public.apartments where building_id = 'rls-test'), 1::bigint, 'owner sees only their apartment');
select extensions.is((select count(*) from public.income_records where building_id = 'rls-test'), 1::bigint, 'owner sees only their payment');
select extensions.is((select count(*) from public.expenses where building_id = 'rls-test'), 0::bigint, 'owner cannot see expenses');
update public.apartments set data = '{"name":"tampered"}'::jsonb where id = 'rls-unit-a';
select extensions.is((select data->>'name' from public.apartments where id = 'rls-unit-a'), 'Owner A', 'owner cannot update apartment data');
select extensions.throws_ok(
    $$insert into public.income_records (id, building_id, apartment_id, data) values ('rls-owner-write', 'rls-test', 'rls-unit-a', '{"amount":100}'::jsonb)$$,
    '42501', null, 'owner cannot insert a payment'
);
select extensions.throws_ok(
    $$select public.replace_building_state('{"residents":[],"income":[],"expenses":[],"notices":[],"auditLogs":[]}'::jsonb)$$,
    '42501', null, 'owner cannot call manager state writer'
);

reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select extensions.is((select count(*) from public.apartments where building_id = 'rls-test'), 2::bigint, 'manager sees all apartments');
select extensions.is((select count(*) from public.expenses where building_id = 'rls-test'), 1::bigint, 'manager sees expenses');

select * from extensions.finish();
rollback;
