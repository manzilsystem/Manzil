-- Daily "time to send reminders" nudge for the building manager.
-- NOT in supabase/migrations on purpose: apply by hand, staging first, production only after the owner approves.
--
-- What it does, in plain words:
--   Once a day (09:00 Cairo in winter, 10:00 in summer; cron runs at 07:00 UTC) it looks at every building.
--   If today is past the subscription due day plus grace days of the current month, and at least one
--   apartment has no subscription payment recorded for this month (and no waiver/discount for this month),
--   it inserts ONE building-scoped manager notification for this month. The existing notifications trigger
--   then sends the normal Web Push. Tapping it opens the reminders list in the app, where the app's own
--   arrears engine shows the real numbers. The notification carries no number on purpose.
--   It never messages tenants. The manager still taps "إرسال" for each WhatsApp message.
-- Safe to run twice: the dedupe key (arrears-nudge:YYYY-MM) means one nudge per building per month.
-- No new table, no new secret, no Edge Function change.
-- Known edges (it is a nudge, not the arrears engine):
--   1. Apartments with any waiver/discount/settlement adjustment effective this month are skipped, even if still late.
--   2. It only counts income with purpose_code = 'subscription' as paid; partial settlement income is not treated as paid
--      or partly paid, so an apartment with only a part payment this month still counts as "maybe late".
--   3. It uses the apartment's current monthly_amount (> 0), not the effective-dated rate history.
-- Rollback: select cron.unschedule('manzil-arrears-reminder-nudge');
--           drop function private.queue_arrears_reminder_nudges();
--           delete from public.notifications where dedupe_key like 'arrears-nudge:%';

create or replace function private.queue_arrears_reminder_nudges()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_today date := (now() at time zone 'Africa/Cairo')::date;
  v_month_start date := date_trunc('month', (now() at time zone 'Africa/Cairo'))::date;
  v_month_names text[] := array['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  v_label text;
  v_dedupe_key text := 'arrears-nudge:' || to_char(date_trunc('month', (now() at time zone 'Africa/Cairo'))::date, 'YYYY-MM');
  v_inserted integer := 0;
  v_rows integer;
  v_building record;
begin
  v_label := v_month_names[extract(month from v_month_start)::int] || ' ' || extract(year from v_month_start)::int;

  for v_building in
    select b.id, b.subscription_due_day, b.subscription_grace_days
    from public.buildings b
  loop
    -- Late only after the due day and the grace days have both passed.
    if v_today <= v_month_start + (v_building.subscription_due_day - 1) + v_building.subscription_grace_days then
      continue;
    end if;

    if not exists (
      select 1
      from public.residents r
      where r.building_id = v_building.id
        and r.monthly_amount > 0
        and (r.billing_start_month is null or r.billing_start_month <= v_month_start)
        and not exists (
          select 1 from public.income i
          where i.building_id = v_building.id
            and i.resident_id = r.id
            and i.month = v_label
            and i.purpose_code = 'subscription'
        )
        and not exists (
          select 1 from public.resident_adjustments a
          where a.building_id = v_building.id
            and a.resident_id = r.id
            and a.effective_month = v_month_start
        )
    ) then
      continue;
    end if;

    -- Gate on the dedupe key itself: target_scope can be NULL on some rows, so ON CONFLICT alone is not enough.
    insert into public.notifications (
      building_id, target_user_id, target_resident_id, kind, dedupe_key,
      title, body, severity, action_path, created_by
    )
    select
      v_building.id, null, null, 'collection_due', v_dedupe_key,
      'وقت تذكيرات المتأخرات',
      format('عدّى ميعاد اشتراك %s، وفيه شقق ممكن تكون لسه ما دفعتش. افتح التذكيرات وراجع القايمة قبل ما تبعت.', v_label),
      'warning', '#arrears-reminders', null
    where not exists (
      select 1 from public.notifications n
      where n.building_id = v_building.id
        and n.dedupe_key = v_dedupe_key
    )
    on conflict (building_id, target_scope, dedupe_key) do nothing;
    get diagnostics v_rows = row_count;
    v_inserted := v_inserted + v_rows;
  end loop;

  return v_inserted;
end;
$function$;

revoke all on function private.queue_arrears_reminder_nudges() from public, anon, authenticated, service_role;

do $schedule$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'manzil-arrears-reminder-nudge';
    perform cron.schedule('manzil-arrears-reminder-nudge', '0 7 * * *', 'select private.queue_arrears_reminder_nudges()');
  else
    raise notice 'pg_cron is not enabled: enable it in Database > Extensions, then re-run this file to create the schedule.';
  end if;
end;
$schedule$;
