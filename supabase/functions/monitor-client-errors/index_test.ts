import { assertEquals } from 'jsr:@std/assert@1'
import { handleRequest } from './index.ts'

const appOrigin = Deno.env.get('APP_ORIGIN') || 'https://manzilsystem.github.io'

function post(body: unknown, secret?: string): Request {
  return new Request('https://example.test/monitor-client-errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(secret ? { 'x-cron-secret': secret } : {}) },
    body: JSON.stringify(body),
  })
}

async function withCronSecret(value: string | undefined, fn: () => Promise<void>) {
  const previous = Deno.env.get('CRON_SECRET')
  if (value === undefined) Deno.env.delete('CRON_SECRET')
  else Deno.env.set('CRON_SECRET', value)
  try {
    await fn()
  } finally {
    if (previous === undefined) Deno.env.delete('CRON_SECRET')
    else Deno.env.set('CRON_SECRET', previous)
  }
}

Deno.test('OPTIONS returns ok with CORS headers', async () => {
  const response = await handleRequest(
    new Request('https://example.test/monitor-client-errors', { method: 'OPTIONS' }),
  )

  assertEquals(response.status, 200)
  assertEquals(await response.text(), 'ok')
  assertEquals(response.headers.get('Access-Control-Allow-Origin'), appOrigin)
  assertEquals(response.headers.get('Access-Control-Allow-Methods'), 'POST, OPTIONS')
})

Deno.test('non-POST method is rejected with 405', async () => {
  const response = await handleRequest(
    new Request('https://example.test/monitor-client-errors', { method: 'GET' }),
  )

  assertEquals(response.status, 405)
  assertEquals(await response.json(), { error: 'method_not_allowed' })
})

Deno.test('missing CRON_SECRET rejects every request with 401', async () => {
  await withCronSecret(undefined, async () => {
    const response = await handleRequest(post({ cron: 'daily_error_check', secret: 'anything' }))
    assertEquals(response.status, 401)
    assertEquals(await response.json(), { error: 'unauthorized' })
  })
})

Deno.test('wrong secret is rejected with 401', async () => {
  await withCronSecret('expected-secret', async () => {
    const response = await handleRequest(post({ cron: 'daily_error_check', secret: 'wrong' }))
    assertEquals(response.status, 401)
    assertEquals(await response.json(), { error: 'unauthorized' })
  })
})

Deno.test('correct secret with unknown cron job returns 400', async () => {
  await withCronSecret('expected-secret', async () => {
    const response = await handleRequest(post({ cron: 'unknown_job', secret: 'expected-secret' }))
    assertEquals(response.status, 400)
    assertEquals(await response.json(), { error: 'unknown_cron_job' })
  })
})

Deno.test('invalid JSON body returns 500 without leaking details', async () => {
  const response = await handleRequest(
    new Request('https://example.test/monitor-client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not-json',
    }),
  )

  assertEquals(response.status, 500)
  assertEquals(await response.json(), { error: 'internal_server_error' })
})
