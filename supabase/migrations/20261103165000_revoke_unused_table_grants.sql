-- Remove authenticated table privileges that have no matching RLS policy or app use.
-- Managers update building settings through the atomic snapshot RPC; building
-- creation/deletion remains an administrative bootstrap operation.
REVOKE INSERT, DELETE ON TABLE public.buildings FROM authenticated;

-- Audit entries are append-only for authenticated clients.
REVOKE UPDATE, DELETE ON TABLE public.audit_logs FROM authenticated;
