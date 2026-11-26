# Push notifications (app closed)

Status: code is in the repo, nothing is applied to the hosted project. The app shows no
"تفعيل الإشعارات" button until `PUSH_VAPID_PUBLIC_KEY` in `js/push.js` is filled in.

## Parts
- `js/push.js`, `js/push-sw.js`: permission, subscription, service worker `push` and `notificationclick`.
- `supabase/migrations/20261126003000_push_subscriptions.sql`: table + RLS (own rows only). Apply by hand.
- `supabase/functions/send-push`: sends the Web Push (VAPID + aes128gcm, WebCrypto only, no npm). Deploy by hand:
  `npx supabase functions deploy send-push --project-ref musvcrkljccubwbcrtjs --no-verify-jwt`
  (it checks the `x-push-secret` header itself; it is not in `config.toml` because Branching deploys are capped).

## Rollout order (needs the owner's go-ahead, none of this is done yet)
1. Create a VAPID key pair on a trusted machine, not in chat:
   `npx web-push generate-vapid-keys --json`. Keep the private key out of git, logs and messages.
2. Set Edge Function secrets (dashboard or CLI): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
   `VAPID_SUBJECT` (`mailto:` address), `PUSH_WEBHOOK_SECRET` (long random string).
3. Apply the migration.
4. Deploy `send-push`.
5. Dashboard > Database > Webhooks: new webhook on table `public.notifications`, event INSERT,
   type HTTP request, POST to `https://musvcrkljccubwbcrtjs.supabase.co/functions/v1/send-push`,
   header `x-push-secret: <PUSH_WEBHOOK_SECRET>`.
6. Put the PUBLIC key into `PUSH_VAPID_PUBLIC_KEY` in `js/push.js`, rebuild (`node scripts/build-index.mjs`), release.
7. Test on a real phone: enable the button, close the app, record an expense. iPhone needs iOS 16.4+ with the app added to the home screen.

## Behaviour
- Manager notifications (no target user) go to every manager of the building; owner notifications go to that owner.
- The same notification never shows twice: the payload id is the notification `tag`, and the service worker skips showing it when the app is open and visible.
- Sign-out removes this device's row; signing in again re-registers silently if permission is still granted.
- Dead endpoints (404/410) are deleted by the function.


## Trigger (replaces the dashboard webhook)

Migration `20261126053000_notifications_push_trigger.sql` adds `private.notify_push()` and an AFTER INSERT trigger on `public.notifications`. It posts to send-push through pg_net with `x-push-secret` read from `vault` (secret name `push_webhook_secret`, same value as the function secret `PUSH_WEBHOOK_SECRET`). Missing secret or any error: it does nothing and the insert succeeds. To rotate, update both the function secret and the vault entry. Rollback: `drop trigger notifications_notify_push on public.notifications; drop function private.notify_push();`.
