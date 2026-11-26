-- Web Push delivery: every new row in public.notifications asks the send-push Edge Function to deliver it.
-- The shared secret lives in supabase_vault (name push_webhook_secret), never in this file or in function text.
-- If the secret is missing, or pg_net / vault are unavailable, or the call fails for any reason,
-- the trigger does nothing and the notification insert still succeeds.
-- Rollback: drop trigger notifications_notify_push on public.notifications; drop function private.notify_push();

create or replace function private.notify_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  begin
    select decrypted_secret into v_secret
    from vault.decrypted_secrets
    where name = 'push_webhook_secret'
    limit 1;

    if v_secret is null or v_secret = '' then
      return new;
    end if;

    perform net.http_post(
      url := 'https://musvcrkljccubwbcrtjs.supabase.co/functions/v1/send-push',
      body := jsonb_build_object(
        'type', 'INSERT',
        'table', 'notifications',
        'record', jsonb_build_object(
          'id', new.id,
          'building_id', new.building_id,
          'target_user_id', new.target_user_id,
          'title', new.title,
          'body', new.body,
          'action_path', new.action_path
        )
      ),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
      timeout_milliseconds := 3000
    );
  exception when others then
    null;
  end;
  return new;
end;
$$;

revoke all on function private.notify_push() from public, anon, authenticated;

drop trigger if exists notifications_notify_push on public.notifications;
create trigger notifications_notify_push
  after insert on public.notifications
  for each row execute function private.notify_push();
