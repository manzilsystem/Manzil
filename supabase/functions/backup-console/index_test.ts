import { assertEquals } from 'jsr:@std/assert@1'
import { handleRequest } from './index.ts'

const appOrigin = Deno.env.get('APP_ORIGIN') || 'https://manzilsystem.github.io'

function post(headers: Record<string, string> = {}): Request {
  return new Request('https://example.test/backup-console', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ action: 'list' }),
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

Deno.test('OPTIONS returns ok with download CORS headers', async () => {
  const response = await handleRequest(
    new Request('https://example.test/backup-console', { method: 'OPTIONS' }),
  )

  assertEquals(response.status, 200)
  assertEquals(await response.text(), 'ok')
  assertEquals(response.headers.get('Access-Control-Allow-Origin'), appOrigin)
  assertEquals(response.headers.get('Access-Control-Expose-Headers'), 'X-Backup-SHA256, Content-Disposition')
})

Deno.test('non-POST method is rejected with 405', async () => {
  const response = await handleRequest(
    new Request('https://example.test/backup-console', { method: 'GET' }),
  )

  assertEquals(response.status, 405)
  assertEquals(await response.json(), { error: 'method_not_allowed' })
})

Deno.test('request without bearer token returns 401', async () => {
  const response = await handleRequest(post())

  assertEquals(response.status, 401)
  assertEquals(await response.json(), { error: 'unauthorized' })
})

Deno.test('non-bearer authorization header is treated as missing token', async () => {
  const response = await handleRequest(post({ Authorization: 'Basic abc123' }))

  assertEquals(response.status, 401)
  assertEquals(await response.json(), { error: 'unauthorized' })
})

Deno.test('missing server configuration returns 500', async () => {
  await withEnv(
    { SUPABASE_URL: undefined, SUPABASE_ANON_KEY: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined },
    async () => {
      const response = await handleRequest(post({ Authorization: 'Bearer test-token' }))
      assertEquals(response.status, 500)
      assertEquals(await response.json(), { error: 'server_configuration_error' })
    },
  )
})

type StubRoutes = {
  membership?: Record<string, unknown> | null
  membershipStatus?: number
}

async function withSupabaseStub(routes: StubRoutes, fn: () => Promise<void>) {
  const server = Deno.serve(
    { port: 0, hostname: '127.0.0.1', onListen: () => {} },
    (request) => {
      const url = new URL(request.url)
      if (url.pathname === '/auth/v1/user') {
        return Response.json({ id: 'user-1', aud: 'authenticated', role: 'authenticated' })
      }
      if (url.pathname === '/rest/v1/building_members') {
        if (routes.membershipStatus && routes.membershipStatus >= 400) {
          return Response.json(
            { code: 'PGRST116', details: 'stub failure', hint: null, message: 'stub failure' },
            { status: routes.membershipStatus },
          )
        }
        if (!routes.membership) {
          return Response.json([])
        }
        return Response.json(routes.membership)
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

Deno.test('authenticated caller without a manager membership gets 403', async () => {
  await withSupabaseStub({ membership: null }, async () => {
    const response = await handleRequest(post({ Authorization: 'Bearer test-token' }))
    assertEquals(response.status, 403)
    assertEquals(await response.json(), { error: 'manager_only' })
  })
})

Deno.test('membership query failure returns 500', async () => {
  await withSupabaseStub({ membershipStatus: 500 }, async () => {
    const response = await handleRequest(post({ Authorization: 'Bearer test-token' }))
    assertEquals(response.status, 500)
    assertEquals(await response.json(), { error: 'membership_check_failed' })
  })
})

Deno.test('unknown action for a manager returns 400', async () => {
  await withSupabaseStub(
    { membership: { building_id: 'b1', role: 'manager' } },
    async () => {
      const response = await handleRequest(
        new Request('https://example.test/backup-console', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
          body: JSON.stringify({ action: 'not_a_real_action' }),
        }),
      )
      assertEquals(response.status, 400)
      assertEquals(await response.json(), { error: 'unknown_action' })
    },
  )
})
