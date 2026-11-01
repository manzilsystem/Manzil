-- Add covering indexes for foreign keys flagged by Supabase's performance advisor.
-- These indexes improve joins and parent-row updates/deletes; they do not alter data.
create index if not exists audit_logs_actor_id_idx
  on public.audit_logs (actor_id);

create index if not exists expenses_created_by_idx
  on public.expenses (created_by);

create index if not exists income_created_by_idx
  on public.income (created_by);

create index if not exists notices_created_by_idx
  on public.notices (created_by);
