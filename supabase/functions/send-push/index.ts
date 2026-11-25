import { encryptPayload, vapidAuthorization } from './webpush.ts'

const appOrigin = Deno.env.get('APP_ORIGIN') || 'https://manzilsystem.github.io'
const corsHeaders = {
  'Access-Control-Allow-Origin': appOrigin,
  'Vary': 'Origin',
  'Access-Control-Allow-Headers': 'content-type, x-push-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function restConfig() {
  const url = (Deno.env.get('SUPABASE_URL') || '').replace(/\/+$/, '')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!url || !key) throw new Error('missing_supabase_config')
  return { url, headers: { apikey: key, Authorization: `Bearer ${key}` } }
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface NotificationRecord {
  id?: string
  building_id?: string
  target_user_id?: string | null
  title?: string
  body?: string
  action_path?: string | null
}

interface Subscription {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

// Called by a Supabase Database Webhook on INSERT into public.notifications.
// It is authenticated with the shared secret PUSH_WEBHOOK_SECRET (header x-push-secret),
// never with a user JWT, and it only ever sends the notification text that row holds.
export async function handleRequest(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (request.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' })
  }

  const expectedSecret = Deno.env.get('PUSH_WEBHOOK_SECRET') || ''
  const providedSecret = request.headers.get('x-push-secret') || ''
  if (!expectedSecret || !safeEqual(providedSecret, expectedSecret)) {
    return json(401, { error: 'unauthorized' })
  }

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') || ''
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY') || ''
  const subject = Deno.env.get('VAPID_SUBJECT') || ''
  if (!publicKey || !privateKey || !subject) {
    return json(503, { error: 'push_not_configured' })
  }

  let payload: { type?: string; table?: string; record?: NotificationRecord }
  try {
    payload = await request.json()
  } catch {
    return json(400, { error: 'invalid_json' })
  }
  const record = payload.record
  if (payload.type !== 'INSERT' || payload.table !== 'notifications' || !record) {
    return json(200, { sent: 0, skipped: 'not_a_notification_insert' })
  }
  const buildingId = String(record.building_id || '')
  const notificationId = String(record.id || '')
  if (!UUID.test(buildingId) || !UUID.test(notificationId)) {
    return json(400, { error: 'invalid_record' })
  }

  try {
    const { url, headers } = restConfig()

    // Owner notifications target one user; manager notifications (target_user_id null)
    // go to every manager of the building.
    let userIds: string[]
    if (record.target_user_id) {
      if (!UUID.test(record.target_user_id)) return json(400, { error: 'invalid_record' })
      userIds = [record.target_user_id]
    } else {
      const members = await fetch(
        `${url}/rest/v1/building_members?select=user_id&building_id=eq.${buildingId}&role=eq.manager`,
        { headers },
      )
      if (!members.ok) return json(502, { error: 'members_lookup_failed' })
      userIds = ((await members.json()) as { user_id: string }[]).map((row) => row.user_id).filter((id) => UUID.test(id))
    }
    if (!userIds.length) return json(200, { sent: 0 })

    const subsResponse = await fetch(
      `${url}/rest/v1/push_subscriptions?select=id,endpoint,p256dh,auth&building_id=eq.${buildingId}&user_id=in.(${userIds.join(',')})`,
      { headers },
    )
    if (!subsResponse.ok) return json(502, { error: 'subscriptions_lookup_failed' })
    const subscriptions = (await subsResponse.json()) as Subscription[]

    const message = new TextEncoder().encode(JSON.stringify({
      id: notificationId,
      title: String(record.title || 'منزل').slice(0, 120),
      body: String(record.body || '').slice(0, 300),
      path: String(record.action_path || '').slice(0, 120),
      buildingId,
    }))

    let sent = 0
    const gone: string[] = []
    await Promise.all(subscriptions.map(async (subscription) => {
      try {
        const body = await encryptPayload(message, subscription.p256dh, subscription.auth)
        const response = await fetch(subscription.endpoint, {
          method: 'POST',
          headers: {
            Authorization: await vapidAuthorization(subscription.endpoint, subject, publicKey, privateKey),
            'Content-Encoding': 'aes128gcm',
            'Content-Type': 'application/octet-stream',
            TTL: '86400',
            Urgency: 'normal',
            Topic: notificationId.replace(/-/g, '').slice(0, 32),
          },
          body: body.slice().buffer as ArrayBuffer,
        })
        if (response.ok) sent++
        else if (response.status === 404 || response.status === 410) gone.push(subscription.id)
      } catch {
        // One bad endpoint must not stop delivery to the others.
      }
    }))

    if (gone.length) {
      await fetch(`${url}/rest/v1/push_subscriptions?id=in.(${gone.join(',')})`, { method: 'DELETE', headers })
    }
    return json(200, { sent, removed: gone.length })
  } catch (_error) {
    return json(500, { error: 'send_failed' })
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest)
}
