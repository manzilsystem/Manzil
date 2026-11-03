-- Financial writes must go through the manager-checked atomic snapshot RPC.
-- Keep SELECT grants and RLS policies; remove direct table mutation paths.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.residents, public.income, public.expenses
FROM PUBLIC, anon, authenticated;
