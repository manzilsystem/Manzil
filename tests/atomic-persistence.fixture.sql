-- Disposable PostgreSQL fixture for atomic snapshot RPC integration tests.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE SCHEMA private;
CREATE TYPE public.app_role AS ENUM ('manager', 'owner');

CREATE TABLE public.profiles (
    id uuid PRIMARY KEY,
    must_change_pin boolean NOT NULL DEFAULT false
);
CREATE TABLE public.buildings (
    id uuid PRIMARY KEY,
    name text NOT NULL DEFAULT 'Manzil',
    manager_name text NOT NULL DEFAULT '',
    manager_phone text,
    default_subscription numeric(12,2) NOT NULL DEFAULT 0 CHECK (default_subscription >= 0),
    starting_balance numeric(12,2) NOT NULL DEFAULT 0,
    current_theme text NOT NULL DEFAULT 'dark' CHECK (current_theme IN ('dark', 'light', 'emerald', 'ocean', 'sand')),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.building_members (
    building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role public.app_role NOT NULL,
    PRIMARY KEY (building_id, user_id)
);
CREATE TABLE public.residents (
    id uuid PRIMARY KEY,
    building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
    user_id uuid UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL,
    name text NOT NULL,
    apartment_number text NOT NULL,
    phone text,
    monthly_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (monthly_amount >= 0),
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (building_id, apartment_number)
);
CREATE TABLE public.income (
    id uuid PRIMARY KEY,
    building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
    resident_id uuid NOT NULL REFERENCES public.residents(id) ON DELETE CASCADE,
    amount numeric(12,2) NOT NULL CHECK (amount > 0),
    month text NOT NULL,
    notes text,
    paid_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES public.profiles(id)
);
CREATE TABLE public.expenses (
    id uuid PRIMARY KEY,
    building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
    title text NOT NULL,
    amount numeric(12,2) NOT NULL CHECK (amount > 0),
    category text NOT NULL DEFAULT 'أخرى',
    month text NOT NULL,
    notes text,
    spent_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES public.profiles(id)
);
CREATE TABLE public.notices (
    id uuid PRIMARY KEY,
    building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
    text text NOT NULL,
    created_by uuid NOT NULL REFERENCES public.profiles(id),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.audit_logs (
    id uuid PRIMARY KEY,
    building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
    action text NOT NULL,
    details text,
    actor_id uuid NOT NULL REFERENCES public.profiles(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $body$
    SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$body$;


CREATE FUNCTION private.is_building_manager(target_building uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $body$
    SELECT EXISTS (
        SELECT 1 FROM public.building_members
        WHERE building_id = target_building
          AND user_id = (SELECT auth.uid())
          AND role = 'manager'
    );
$body$;

CREATE FUNCTION private.owns_resident(target_resident uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $body$
    SELECT EXISTS (
        SELECT 1 FROM public.residents
        WHERE id = target_resident
          AND user_id = (SELECT auth.uid())
    );
$body$;

CREATE FUNCTION private.owner_pin_change_complete()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $body$
    SELECT NOT EXISTS (
        SELECT 1
        FROM public.building_members member
        JOIN public.profiles profile ON profile.id = member.user_id
        WHERE member.user_id = (SELECT auth.uid())
          AND member.role = 'owner'
          AND profile.must_change_pin IS TRUE
    );
$body$;

GRANT EXECUTE ON FUNCTION private.is_building_manager(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.owns_resident(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.owner_pin_change_complete() TO authenticated;

GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
GRANT SELECT ON public.buildings, public.building_members, public.residents, public.income,
    public.expenses, public.notices, public.audit_logs TO authenticated;

CREATE TABLE public.notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
    target_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    target_resident_id uuid REFERENCES public.residents(id) ON DELETE CASCADE,
    target_scope uuid,
    kind text NOT NULL CHECK (kind IN ('unpaid','partial','payment','expense','collection_due','backup_stale','announcement')),
    dedupe_key text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','success','warning','danger')),
    action_path text,
    read_at timestamptz,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT notifications_target_check CHECK (
        (target_user_id IS NULL AND target_resident_id IS NULL) OR target_user_id IS NOT NULL
    ),
    CONSTRAINT notifications_dedupe_scope_unique UNIQUE (building_id, target_scope, dedupe_key)
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
CREATE POLICY notifications_select_scoped ON public.notifications
FOR SELECT TO authenticated
USING (private.is_building_manager(building_id) OR target_user_id = auth.uid());
CREATE POLICY notifications_update_read_state ON public.notifications
FOR UPDATE TO authenticated
USING (private.is_building_manager(building_id) OR target_user_id = auth.uid())
WITH CHECK (private.is_building_manager(building_id) OR target_user_id = auth.uid());
