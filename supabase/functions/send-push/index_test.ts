import { assertEquals } from 'jsr:@std/assert@1'
import { handleRequest } from './index.ts'
import { b64urlToBytes, bytesToB64url, encryptPayload, vapidAuthorization } from './webpush.ts'

const appOrigin = Deno.env.get('APP_ORIGIN') || 'https://manzilsystem.github.io'

function post(body: unknown, secret?: string): Request {
  return new Request('https://example.test/send-push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(secret ? { 'x-push-secret': secret } : {}) },
    body: JSON.stringify(body),
  })
}

Deno.test('OPTIONS returns ok with CORS headers', async () => {
  const response = await handleRequest(new Request('https://example.test/send-push', { method: 'OPTIONS' }))
  assertEquals(response.status, 200)
  assertEquals(response.headers.get('Access-Control-Allow-Origin'), appOrigin)
  assertEquals(response.headers.get('Access-Control-Allow-Methods'), 'POST, OPTIONS')
})

Deno.test('non-POST method is rejected with 405', async () => {
  const response = await handleRequest(new Request('https://example.test/send-push', { method: 'GET' }))
  assertEquals(response.status, 405)
})

Deno.test('missing or wrong secret is rejected with 401', async () => {
  const previous = Deno.env.get('PUSH_WEBHOOK_SECRET')
  Deno.env.set('PUSH_WEBHOOK_SECRET', 'expected-secret')
  try {
    assertEquals((await handleRequest(post({ type: 'INSERT' }))).status, 401)
    assertEquals((await handleRequest(post({ type: 'INSERT' }, 'wrong-secret'))).status, 401)
  } finally {
    if (previous === undefined) Deno.env.delete('PUSH_WEBHOOK_SECRET')
    else Deno.env.set('PUSH_WEBHOOK_SECRET', previous)
  }
})

Deno.test('an unset secret never authorizes a request', async () => {
  const previous = Deno.env.get('PUSH_WEBHOOK_SECRET')
  Deno.env.delete('PUSH_WEBHOOK_SECRET')
  try {
    assertEquals((await handleRequest(post({ type: 'INSERT' }, ''))).status, 401)
  } finally {
    if (previous !== undefined) Deno.env.set('PUSH_WEBHOOK_SECRET', previous)
  }
})

Deno.test('a correct secret without VAPID keys reports push_not_configured', async () => {
  const keys = ['PUSH_WEBHOOK_SECRET', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']
  const previous = keys.map((key) => Deno.env.get(key))
  Deno.env.set('PUSH_WEBHOOK_SECRET', 'expected-secret')
  for (const key of keys.slice(1)) Deno.env.delete(key)
  try {
    const response = await handleRequest(post({ type: 'INSERT' }, 'expected-secret'))
    assertEquals(response.status, 503)
    assertEquals((await response.json()).error, 'push_not_configured')
  } finally {
    keys.forEach((key, index) => {
      const value = previous[index]
      if (value === undefined) Deno.env.delete(key)
      else Deno.env.set(key, value)
    })
  }
})

Deno.test('encryptPayload builds an aes128gcm body for a P-256 subscription', async () => {
  const receiver = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const p256dh = bytesToB64url(new Uint8Array(await crypto.subtle.exportKey('raw', receiver.publicKey)))
  const auth = bytesToB64url(crypto.getRandomValues(new Uint8Array(16)))
  const message = new TextEncoder().encode('{"title":"t"}')
  const body = await encryptPayload(message, p256dh, auth)
  // salt(16) + record size(4) + key length(1) + sender key(65) + ciphertext(message + delimiter + 16-byte tag)
  assertEquals(body.length, 16 + 4 + 1 + 65 + message.length + 1 + 16)
  assertEquals(Array.from(body.slice(16, 20)), [0, 0, 0x10, 0])
  assertEquals(body[20], 65)
  assertEquals(body[21], 4)
})

Deno.test('vapidAuthorization signs an ES256 JWT for the push service origin', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  const publicKey = bytesToB64url(
    new Uint8Array([4, ...b64urlToBytes(String(jwk.x)), ...b64urlToBytes(String(jwk.y))]),
  )
  const header = await vapidAuthorization('https://push.example.test/send/abc', 'mailto:ops@example.test', publicKey, String(jwk.d), 1000)
  const match = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(header)
  assertEquals(match !== null, true)
  const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(String(match?.[2]))))
  assertEquals(claims.aud, 'https://push.example.test')
  assertEquals(claims.sub, 'mailto:ops@example.test')
  assertEquals(claims.exp, 1000 + 12 * 60 * 60)
  assertEquals(match?.[4], publicKey)
})

const webhookEnv = {
  PUSH_WEBHOOK_SECRET: 'expected-secret',
  VAPID_PUBLIC_KEY: 'test-public-key',
  VAPID_PRIVATE_KEY: 'test-private-key',
  VAPID_SUBJECT: 'mailto:ops@example.test',
}

async function withWebhookEnv<T>(run: () => Promise<T>): Promise<T> {
  const keys = Object.keys(webhookEnv)
  const previous = keys.map((key) => Deno.env.get(key))
  for (const [key, value] of Object.entries(webhookEnv)) Deno.env.set(key, value)
  try {
    return await run()
  } finally {
    keys.forEach((key, index) => {
      const value = previous[index]
      if (value === undefined) Deno.env.delete(key)
      else Deno.env.set(key, value)
    })
  }
}

const validRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  building_id: '22222222-2222-4222-8222-222222222222',
  title: 'تنبيه',
  body: 'نص',
  action_path: '/#arrears',
}

Deno.test('a non-INSERT webhook event is skipped without a send', () =>
  withWebhookEnv(async () => {
    for (const type of ['UPDATE', 'DELETE', 'SELECT']) {
      const response = await handleRequest(post({ type, table: 'notifications', record: validRecord }, 'expected-secret'))
      assertEquals(response.status, 200)
      assertEquals(await response.json(), { sent: 0, skipped: 'not_a_notification_insert' })
    }
  }))

Deno.test('an INSERT on another table is skipped without a send', () =>
  withWebhookEnv(async () => {
    const response = await handleRequest(post({ type: 'INSERT', table: 'notices', record: validRecord }, 'expected-secret'))
    assertEquals(response.status, 200)
    assertEquals(await response.json(), { sent: 0, skipped: 'not_a_notification_insert' })
  }))

Deno.test('an INSERT without a record is skipped without a send', () =>
  withWebhookEnv(async () => {
    const response = await handleRequest(post({ type: 'INSERT', table: 'notifications' }, 'expected-secret'))
    assertEquals(response.status, 200)
    assertEquals(await response.json(), { sent: 0, skipped: 'not_a_notification_insert' })
  }))

Deno.test('a notification insert with non-UUID ids is rejected as an invalid record', () =>
  withWebhookEnv(async () => {
    const badBuilding = await handleRequest(post({ type: 'INSERT', table: 'notifications', record: { ...validRecord, building_id: 'building-1' } }, 'expected-secret'))
    assertEquals(badBuilding.status, 400)
    assertEquals((await badBuilding.json()).error, 'invalid_record')
    const badId = await handleRequest(post({ type: 'INSERT', table: 'notifications', record: { ...validRecord, id: '42' } }, 'expected-secret'))
    assertEquals(badId.status, 400)
    assertEquals((await badId.json()).error, 'invalid_record')
  }))

Deno.test('a non-UUID target_user_id is rejected as an invalid record', async () => {
  const previousUrl = Deno.env.get('SUPABASE_URL')
  const previousKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  Deno.env.set('SUPABASE_URL', 'https://example.supabase.co')
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key')
  try {
    await withWebhookEnv(async () => {
      const response = await handleRequest(post({ type: 'INSERT', table: 'notifications', record: { ...validRecord, target_user_id: 'owner-7' } }, 'expected-secret'))
      assertEquals(response.status, 400)
      assertEquals((await response.json()).error, 'invalid_record')
    })
  } finally {
    if (previousUrl === undefined) Deno.env.delete('SUPABASE_URL')
    else Deno.env.set('SUPABASE_URL', previousUrl)
    if (previousKey === undefined) Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY')
    else Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', previousKey)
  }
})

interface FetchCall { url: string; method: string; headers: Headers; body?: ArrayBuffer }

async function withSendPushEnv<T>(overrides: Record<string, string>, run: () => Promise<T>): Promise<T> {
  const env: Record<string, string> = {
    ...webhookEnv,
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    ...overrides,
  }
  const keys = Object.keys(env)
  const previous = keys.map((key) => Deno.env.get(key))
  for (const [key, value] of Object.entries(env)) Deno.env.set(key, value)
  try {
    return await run()
  } finally {
    keys.forEach((key, index) => {
      const value = previous[index]
      if (value === undefined) Deno.env.delete(key)
      else Deno.env.set(key, value)
    })
  }
}

async function makeSubscription(id: string): Promise<{ id: string; endpoint: string; p256dh: string; auth: string }> {
  const receiver = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  return {
    id,
    endpoint: `https://push.example.test/send/${id}`,
    p256dh: bytesToB64url(new Uint8Array(await crypto.subtle.exportKey('raw', receiver.publicKey))),
    auth: bytesToB64url(crypto.getRandomValues(new Uint8Array(16))),
  }
}

Deno.test('410 and 404 subscriptions are deleted, other failures are kept, and one bad endpoint never stops the rest', async () => {
  const vapidPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const vapidJwk = await crypto.subtle.exportKey('jwk', vapidPair.privateKey)
  const vapidPublicKey = bytesToB64url(
    new Uint8Array([4, ...b64urlToBytes(String(vapidJwk.x)), ...b64urlToBytes(String(vapidJwk.y))]),
  )
  const gone410 = await makeSubscription('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  const gone404 = await makeSubscription('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
  const failing = await makeSubscription('cccccccc-cccc-4ccc-8ccc-cccccccccccc')
  const healthy = await makeSubscription('dddddddd-dddd-4ddd-8ddd-dddddddddddd')
  const managerId = '33333333-3333-4333-8333-333333333333'
  const subscriptions = [gone410, gone404, failing, healthy]

  const calls: FetchCall[] = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    calls.push({ url, method: init?.method || 'GET', headers: new Headers(init?.headers), body: init?.body as ArrayBuffer | undefined })
    if (url.includes('/rest/v1/building_members')) return Promise.resolve(new Response(JSON.stringify([{ user_id: managerId }]), { status: 200 }))
    if (url.includes('/rest/v1/push_subscriptions') && (init?.method || 'GET') === 'GET') {
      return Promise.resolve(new Response(JSON.stringify(subscriptions), { status: 200 }))
    }
    if (url.includes('/rest/v1/push_subscriptions') && init?.method === 'DELETE') return Promise.resolve(new Response('[]', { status: 200 }))
    if (url === gone410.endpoint) return Promise.resolve(new Response('gone', { status: 410 }))
    if (url === gone404.endpoint) return Promise.resolve(new Response('not found', { status: 404 }))
    if (url === failing.endpoint) return Promise.reject(new TypeError('network down'))
    if (url === healthy.endpoint) return Promise.resolve(new Response('sent', { status: 201 }))
    return Promise.resolve(new Response('unexpected', { status: 599 }))
  }

  try {
    await withSendPushEnv({ VAPID_PUBLIC_KEY: vapidPublicKey, VAPID_PRIVATE_KEY: String(vapidJwk.d) }, async () => {
      const response = await handleRequest(post({ type: 'INSERT', table: 'notifications', record: validRecord }, 'expected-secret'))
      assertEquals(response.status, 200)
      assertEquals(await response.json(), { sent: 1, removed: 2 })

      const deletes = calls.filter((call) => call.method === 'DELETE')
      assertEquals(deletes.length, 1, 'exactly one cleanup DELETE must run')
      assertEquals(deletes[0].url.includes(gone410.id), true)
      assertEquals(deletes[0].url.includes(gone404.id), true)
      assertEquals(deletes[0].url.includes(failing.id), false, 'a network failure is not proof the subscription is gone')
      assertEquals(deletes[0].url.includes(healthy.id), false)

      const pushed = calls.filter((call) => call.url.startsWith('https://push.example.test/send/'))
      assertEquals(pushed.length, 4, 'all endpoints are attempted even when some fail')
      const healthyPush = pushed.find((call) => call.url === healthy.endpoint)
      assertEquals(healthyPush?.headers.get('TTL'), '86400')
      assertEquals(healthyPush?.headers.get('Content-Encoding'), 'aes128gcm')
      assertEquals(healthyPush?.headers.get('Topic'), validRecord.id.replace(/-/g, ''))
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})
