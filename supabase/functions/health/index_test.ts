import { assertEquals } from 'jsr:@std/assert@1'
import { handleRequest } from './index.ts'

const appOrigin = Deno.env.get('APP_ORIGIN') || 'https://manzilsystem.github.io'
const endpoint = 'https://example.test/health'

async function withRelease(value: string | undefined, fn: () => Promise<void>) {
  const previous = Deno.env.get('APP_RELEASE')
  if (value === undefined) Deno.env.delete('APP_RELEASE')
  else Deno.env.set('APP_RELEASE', value)
  try {
    await fn()
  } finally {
    if (previous === undefined) Deno.env.delete('APP_RELEASE')
    else Deno.env.set('APP_RELEASE', previous)
  }
}

Deno.test('OPTIONS returns ok with CORS headers', async () => {
  const response = await handleRequest(new Request(endpoint, { method: 'OPTIONS' }))

  assertEquals(response.status, 200)
  assertEquals(await response.text(), 'ok')
  assertEquals(response.headers.get('Access-Control-Allow-Origin'), appOrigin)
  assertEquals(response.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS')
  assertEquals(response.headers.get('Cache-Control'), 'no-store')
})

Deno.test('non-GET methods are rejected with 405', async () => {
  const response = await handleRequest(new Request(endpoint, { method: 'POST' }))

  assertEquals(response.status, 405)
  assertEquals(await response.json(), { error: 'method_not_allowed' })
})

Deno.test('GET reports liveness without secrets', async () => {
  await withRelease('manzil-test', async () => {
    const response = await handleRequest(new Request(endpoint, { method: 'GET' }))
    const body = await response.text()

    assertEquals(response.status, 200)
    assertEquals(JSON.parse(body).status, 'ok')
    assertEquals(JSON.parse(body).service, 'manzil')
    assertEquals(JSON.parse(body).release, 'manzil-test')
    assertEquals(Number.isNaN(Date.parse(JSON.parse(body).time)), false)
    assertEquals(/secret|token|key|password/i.test(body), false)
  })
})

Deno.test('GET falls back to unknown release when APP_RELEASE is unset', async () => {
  await withRelease(undefined, async () => {
    const response = await handleRequest(new Request(endpoint, { method: 'GET' }))

    assertEquals(response.status, 200)
    assertEquals((await response.json()).release, 'unknown')
  })
})
