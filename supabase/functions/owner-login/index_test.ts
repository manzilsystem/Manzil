import { assertEquals } from 'jsr:@std/assert@1'
import { handleRequest } from './index.ts'

const appOrigin = Deno.env.get('APP_ORIGIN') || 'https://manzilsystem.github.io'
const phone = '01012345678'
const pin = '123456'

function login(body: unknown): Request {
  return new Request('https://example.test/owner-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function withEnv(
  values: Record<string, string | undefined>,
  fn: () => Promise<void>,
) {
  const previous = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, Deno.env.get(key))
    if (value === undefined) Deno.env.delete(key)
    else Deno.env.set(key, value)
  }
  try {
    await fn()
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) Deno.env.delete(key)
      else Deno.env.set(key, value)
    }
  }
}

Deno.test('OPTIONS returns ok with CORS headers', async () => {
  const response = await handleRequest(
    new Request('https://example.test/owner-login', { method: 'OPTIONS' }),
  )

  assertEquals(response.status, 200)
  assertEquals(await response.text(), 'ok')
  assertEquals(response.headers.get('Access-Control-Allow-Origin'), appOrigin)
})

Deno.test('non-POST method is rejected with 405', async () => {
  const response = await handleRequest(
    new Request('https://example.test/owner-login', { method: 'PUT' }),
  )

  assertEquals(response.status, 405)
  assertEquals(await response.json(), { error: 'method_not_allowed' })
})

Deno.test('invalid JSON body returns 400', async () => {
  const response = await handleRequest(
    new Request('https://example.test/owner-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{oops',
    }),
  )

  assertEquals(response.status, 400)
  assertEquals(await response.json(), { error: 'invalid_request' })
})

Deno.test('malformed phone or PIN returns 400 before touching the network', async () => {
  const cases = [
    { phone: 'abc', pin },
    { phone, pin: '12' },
    { phone: 12345678901, pin },
    { phone, pin: '١٢٣٤٥' },
  ]

  for (const body of cases) {
    const response = await handleRequest(login(body))
    assertEquals(response.status, 400)
    assertEquals(await response.json(), { error: 'invalid_credentials' })
  }
})

Deno.test('missing server configuration returns 503', async () => {
  await withEnv(
    { SUPABASE_URL: undefined, SUPABASE_ANON_KEY: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined },
    async () => {
      const response = await handleRequest(login({ phone, pin }))
      assertEquals(response.status, 503)
      assertEquals(await response.json(), { error: 'login_unavailable' })
    },
  )
})

type StubOptions = {
  rateLimitAttempt?: Record<string, unknown>
  rateLimitFails?: boolean
  profile?: { id: string } | null
  membership?: { user_id: string } | null
  tokenStatus?: number
  tokenBody?: Record<string, unknown>
}

async function withSupabaseStub(options: StubOptions, fn: () => Promise<void>) {
  const server = Deno.serve(
    { port: 0, hostname: '127.0.0.1', onListen: () => {} },
    (request) => {
      const url = new URL(request.url)
      if (url.pathname === '/rest/v1/rpc/owner_login_rate_limit') {
        if (options.rateLimitFails) {
          return Response.json({ code: 'XX000', message: 'stub rpc failure' }, { status: 500 })
        }
        return Response.json(options.rateLimitAttempt ?? { allowed: true })
      }
      if (url.pathname === '/rest/v1/profiles') {
        return Response.json(options.profile ? [options.profile] : [])
      }
      if (url.pathname === '/rest/v1/building_members') {
        return Response.json(options.membership ? [options.membership] : [])
      }
      if (url.pathname === '/auth/v1/token') {
        return Response.json(
          options.tokenBody ?? { error: 'invalid_grant', error_description: 'stub rejection' },
          { status: options.tokenStatus ?? 400 },
        )
      }
      return Response.json({ error: 'unexpected_stub_route', path: url.pathname }, { status: 404 })
    },
  )

  try {
    await withEnv(
      {
        SUPABASE_URL: `http://127.0.0.1:${server.addr.port}`,
        SUPABASE_ANON_KEY: 'stub-anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key',
      },
      fn,
    )
  } finally {
    await server.shutdown()
  }
}

Deno.test('rate limiter rejection returns 429 with Retry-After', async () => {
  await withSupabaseStub(
    { rateLimitAttempt: { allowed: false, retry_after_seconds: 120 } },
    async () => {
      const response = await handleRequest(login({ phone, pin }))
      assertEquals(response.status, 429)
      assertEquals(await response.json(), { error: 'rate_limited', retry_after_seconds: 120 })
      assertEquals(response.headers.get('Retry-After'), '120')
    },
  )
})

Deno.test('rate limiter failure returns 503', async () => {
  await withSupabaseStub({ rateLimitFails: true }, async () => {
    const response = await handleRequest(login({ phone, pin }))
    assertEquals(response.status, 503)
    assertEquals(await response.json(), { error: 'login_unavailable' })
  })
})

Deno.test('unknown phone returns 401 without revealing registration', async () => {
  await withSupabaseStub({ profile: null }, async () => {
    const response = await handleRequest(login({ phone, pin }))
    assertEquals(response.status, 401)
    assertEquals(await response.json(), { error: 'invalid_credentials' })
  })
})

Deno.test('profile without owner membership returns 401', async () => {
  await withSupabaseStub({ profile: { id: 'user-1' }, membership: null }, async () => {
    const response = await handleRequest(login({ phone, pin }))
    assertEquals(response.status, 401)
    assertEquals(await response.json(), { error: 'invalid_credentials' })
  })
})

Deno.test('Auth rejection returns 401', async () => {
  await withSupabaseStub(
    { profile: { id: 'user-1' }, membership: { user_id: 'user-1' }, tokenStatus: 400 },
    async () => {
      const response = await handleRequest(login({ phone, pin }))
      assertEquals(response.status, 401)
      assertEquals(await response.json(), { error: 'invalid_credentials' })
    },
  )
})

Deno.test('Auth outage returns 503', async () => {
  await withSupabaseStub(
    { profile: { id: 'user-1' }, membership: { user_id: 'user-1' }, tokenStatus: 500 },
    async () => {
      const response = await handleRequest(login({ phone, pin }))
      assertEquals(response.status, 503)
      assertEquals(await response.json(), { error: 'login_unavailable' })
    },
  )
})

Deno.test('successful login returns the session tokens', async () => {
  await withSupabaseStub(
    {
      profile: { id: 'user-1' },
      membership: { user_id: 'user-1' },
      tokenStatus: 200,
      tokenBody: {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
        user: { id: 'user-1', aud: 'authenticated' },
      },
    },
    async () => {
      const response = await handleRequest(login({ phone, pin }))
      assertEquals(response.status, 200)
      assertEquals(await response.json(), {
        session: { access_token: 'access-token', refresh_token: 'refresh-token' },
      })
    },
  )
})
