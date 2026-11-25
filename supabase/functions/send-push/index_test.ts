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
