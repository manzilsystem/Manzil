import { assertEquals } from 'jsr:@std/assert@1'
import { handleRequest } from './index.ts'

const appOrigin = Deno.env.get('APP_ORIGIN') || 'https://manzilsystem.github.io'
const userId = '11111111-1111-4111-8111-111111111111'

function changePin(body: unknown, token = 'session-token'): Request {
  return new Request('https://example.test/complete-owner-pin-change', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
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

type StubOptions = {
  callerStatus?: number
  callerId?: string
  profile?: { phone: string; must_change_pin: boolean } | null
  membership?: { user_id: string } | null
  rateLimitAttempt?: Record<string, unknown>
  rateLimitFails?: boolean
  tokenStatus?: number
  tokenUserId?: string
  updateStatus?: number
  profileUpdateMatches?: boolean
}

async function withSupabaseStub(options: StubOptions, fn: () => Promise<void>) {
  const server = Deno.serve(
    { port: 0, hostname: '127.0.0.1', onListen: () => {} },
    (request) => {
      const url = new URL(request.url)
      const callerId = options.callerId ?? userId
      if (url.pathname === '/auth/v1/user') {
        if ((options.callerStatus ?? 200) >= 400) {
          return Response.json({ message: 'stub unauthorized' }, { status: options.callerStatus })
        }
        return Response.json({ id: callerId, aud: 'authenticated', role: 'authenticated' })
      }
      if (url.pathname === `/auth/v1/admin/users/${callerId}`) {
        if ((options.updateStatus ?? 200) >= 400) {
          return Response.json({ message: 'stub update failure' }, { status: options.updateStatus })
        }
        return Response.json({ id: callerId })
      }
      if (url.pathname === '/auth/v1/token') {
        if ((options.tokenStatus ?? 200) >= 400) {
          return Response.json({ error: 'invalid_grant' }, { status: options.tokenStatus })
        }
        return Response.json({
          access_token: 'verified-access',
          refresh_token: 'verified-refresh',
          token_type: 'bearer',
          expires_in: 3600,
          user: { id: options.tokenUserId ?? userId, aud: 'authenticated' },
        })
      }
      if (url.pathname === '/rest/v1/rpc/owner_login_rate_limit') {
        if (options.rateLimitFails) {
          return Response.json({ message: 'stub rpc failure' }, { status: 500 })
        }
        return Response.json(options.rateLimitAttempt ?? { allowed: true })
      }
      if (url.pathname === '/rest/v1/profiles') {
        if (request.method === 'PATCH') {
          const matched = options.profileUpdateMatches ?? true
          return Response.json(matched ? [{ id: callerId }] : [])
        }
        return Response.json(options.profile ? [options.profile] : [])
      }
      if (url.pathname === '/rest/v1/building_members') {
        return Response.json(options.membership ? [options.membership] : [])
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

const validProfile = { phone: '+201012345678', must_change_pin: true }

Deno.test('OPTIONS returns ok with CORS headers', async () => {
  const response = await handleRequest(
    new Request('https://example.test/complete-owner-pin-change', { method: 'OPTIONS' }),
  )

  assertEquals(response.status, 200)
  assertEquals(await response.text(), 'ok')
  assertEquals(response.headers.get('Access-Control-Allow-Origin'), appOrigin)
})

Deno.test('non-POST method is rejected with 405', async () => {
  const response = await handleRequest(
    new Request('https://example.test/complete-owner-pin-change', { method: 'GET' }),
  )

  assertEquals(response.status, 405)
  assertEquals(await response.json(), { error: 'method_not_allowed' })
})

Deno.test('request without bearer token returns 401', async () => {
  const response = await handleRequest(changePin({ current_pin: '123456', new_pin: '654321' }, ''))

  assertEquals(response.status, 401)
  assertEquals(await response.json(), { error: 'unauthorized' })
})

Deno.test('missing server configuration returns 500', async () => {
  await withEnv(
    { SUPABASE_URL: undefined, SUPABASE_ANON_KEY: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined },
    async () => {
      const response = await handleRequest(changePin({ current_pin: '123456', new_pin: '654321' }))
      assertEquals(response.status, 500)
      assertEquals(await response.json(), { error: 'server_configuration_error' })
    },
  )
})

Deno.test('rejected caller session returns 401', async () => {
  await withSupabaseStub({ callerStatus: 401 }, async () => {
    const response = await handleRequest(changePin({ current_pin: '123456', new_pin: '654321' }))
    assertEquals(response.status, 401)
    assertEquals(await response.json(), { error: 'unauthorized' })
  })
})

Deno.test('invalid JSON returns 400', async () => {
  await withSupabaseStub({}, async () => {
    const response = await handleRequest(
      new Request('https://example.test/complete-owner-pin-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer session-token' },
        body: '{nope',
      }),
    )
    assertEquals(response.status, 400)
    assertEquals(await response.json(), { error: 'invalid_request' })
  })
})

Deno.test('invalid or unchanged PIN is rejected with 400', async () => {
  await withSupabaseStub({}, async () => {
    const cases = [
      { current_pin: '12345', new_pin: '654321' },
      { current_pin: '123456', new_pin: '65432' },
      { current_pin: '123456', new_pin: '123456' },
    ]

    for (const body of cases) {
      const response = await handleRequest(changePin(body))
      assertEquals(response.status, 400)
    }

    const unchanged = await handleRequest(changePin({ current_pin: '123456', new_pin: '123456' }))
    assertEquals(await unchanged.json(), { error: 'pin_must_change' })
  })
})

Deno.test('profile without the first-login gate returns 403', async () => {
  const cases: Array<{ profile: StubOptions['profile']; membership?: StubOptions['membership'] }> = [
    { profile: null },
    { profile: { phone: '+201012345678', must_change_pin: false } },
    { profile: { phone: 'not-a-phone', must_change_pin: true } },
  ]

  for (const { profile, membership } of cases) {
    await withSupabaseStub({ profile, membership }, async () => {
      const response = await handleRequest(changePin({ current_pin: '123456', new_pin: '654321' }))
      assertEquals(response.status, 403)
      assertEquals(await response.json(), { error: 'pin_change_not_required' })
    })
  }
})

Deno.test('caller without owner membership returns 403', async () => {
  await withSupabaseStub({ profile: validProfile, membership: null }, async () => {
    const response = await handleRequest(changePin({ current_pin: '123456', new_pin: '654321' }))
    assertEquals(response.status, 403)
    assertEquals(await response.json(), { error: 'owner_only' })
  })
})

Deno.test('rate limiter failure returns 503 and rejection returns 429', async () => {
  await withSupabaseStub(
    { profile: validProfile, membership: { user_id: userId }, rateLimitFails: true },
    async () => {
      const response = await handleRequest(changePin({ current_pin: '123456', new_pin: '654321' }))
      assertEquals(response.status, 503)
      assertEquals(await response.json(), { error: 'login_unavailable' })
    },
  )

  await withSupabaseStub(
    {
      profile: validProfile,
      membership: { user_id: userId },
      rateLimitAttempt: { allowed: false, retry_after_seconds: 60 },
    },
    async () => {
      const response = await handleRequest(changePin({ current_pin: '123456', new_pin: '654321' }))
      assertEquals(response.status, 429)
      assertEquals(response.headers.get('Retry-After'), '60')
      assertEquals(await response.json(), { error: 'rate_limited', retry_after_seconds: 60 })
    },
  )
})

Deno.test('wrong current PIN and mismatched session return 400', async () => {
  await withSupabaseStub(
    { profile: validProfile, membership: { user_id: userId }, tokenStatus: 400 },
    async () => {
      const response = await handleRequest(changePin({ current_pin: '111111', new_pin: '654321' }))
      assertEquals(response.status, 400)
      assertEquals(await response.json(), { error: 'invalid_current_pin' })
    },
  )

  await withSupabaseStub(
    { profile: validProfile, membership: { user_id: userId }, tokenUserId: '22222222-2222-4222-8222-222222222222' },
    async () => {
      const response = await handleRequest(changePin({ current_pin: '123456', new_pin: '654321' }))
      assertEquals(response.status, 400)
      assertEquals(await response.json(), { error: 'invalid_current_pin' })
    },
  )
})

Deno.test('Auth outage during PIN verification returns 503', async () => {
  await withSupabaseStub(
    { profile: validProfile, membership: { user_id: userId }, tokenStatus: 500 },
    async () => {
      const response = await handleRequest(changePin({ current_pin: '123456', new_pin: '654321' }))
      assertEquals(response.status, 503)
      assertEquals(await response.json(), { error: 'login_unavailable' })
    },
  )
})

Deno.test('successful change clears the first-login gate', async () => {
  await withSupabaseStub(
    { profile: validProfile, membership: { user_id: userId }, profileUpdateMatches: true },
    async () => {
      const response = await handleRequest(changePin({ current_pin: '123456', new_pin: '654321' }))
      assertEquals(response.status, 200)
      assertEquals(await response.json(), { ok: true })
    },
  )
})

Deno.test('profile update miss reports retry required', async () => {
  await withSupabaseStub(
    { profile: validProfile, membership: { user_id: userId }, profileUpdateMatches: false },
    async () => {
      const response = await handleRequest(changePin({ current_pin: '123456', new_pin: '654321' }))
      assertEquals(response.status, 500)
      assertEquals(await response.json(), { error: 'pin_updated_retry_required' })
    },
  )
})

Deno.test('rejected Auth credential update returns 400', async () => {
  await withSupabaseStub(
    { profile: validProfile, membership: { user_id: userId }, updateStatus: 422 },
    async () => {
      const response = await handleRequest(changePin({ current_pin: '123456', new_pin: '654321' }))
      assertEquals(response.status, 400)
      assertEquals(await response.json(), { error: 'pin_update_failed' })
    },
  )
})
