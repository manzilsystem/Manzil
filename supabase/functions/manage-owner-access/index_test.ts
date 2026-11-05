import { assertEquals } from 'jsr:@std/assert@1'
import { handleRequest } from './index.ts'

const appOrigin = Deno.env.get('APP_ORIGIN') || 'https://manzilsystem.github.io'
const callerId = '11111111-1111-4111-8111-111111111111'
const residentId = '33333333-3333-4333-8333-333333333333'
const ownerId = '44444444-4444-4444-8444-444444444444'
const buildingId = '55555555-5555-4555-8555-555555555555'

const resident: {
  id: string
  building_id: string
  user_id: string | null
  name: string
  apartment_number: string
  phone: string
} = {
  id: residentId,
  building_id: buildingId,
  user_id: null,
  name: 'أحمد',
  apartment_number: '12',
  phone: '01012345678',
}

function request(body: unknown = { resident_id: residentId }, token = 'session-token'): Request {
  return new Request('https://example.test/manage-owner-access', {
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
  managerMembership?: { building_id: string } | null
  managerMembershipStatus?: number
  resident?: typeof resident | null
  residentStatus?: number
  existingProfile?: { id: string } | null
  profileLookupStatus?: number
  linkedResident?: { id: string } | null
  existingMembership?: { user_id: string } | null
  previousMembership?: { building_id: string; user_id: string; role: string } | null
  profileSnapshot?: Record<string, unknown> | null
  createUserStatus?: number
  upsertProfileStatus?: number
  upsertMembershipStatus?: number
  residentUpdateStatus?: number
  auditStatus?: number
}

type StubLog = { paths: string[]; deletedUsers: string[] }

async function withSupabaseStub(
  options: StubOptions,
  fn: (log: StubLog) => Promise<void>,
) {
  const log: StubLog = { paths: [], deletedUsers: [] }
  let residentPatches = 0
  const server = Deno.serve(
    { port: 0, hostname: '127.0.0.1', onListen: () => {} },
    (request) => {
      const url = new URL(request.url)
      log.paths.push(`${request.method} ${url.pathname}`)

      if (url.pathname === '/auth/v1/user') {
        if ((options.callerStatus ?? 200) >= 400) {
          return Response.json({ message: 'stub unauthorized' }, { status: options.callerStatus })
        }
        return Response.json({ id: callerId, aud: 'authenticated' })
      }
      if (url.pathname === '/auth/v1/admin/users' && request.method === 'POST') {
        if ((options.createUserStatus ?? 200) >= 400) {
          return Response.json({ message: 'stub create failure' }, { status: options.createUserStatus })
        }
        return Response.json({ id: ownerId, aud: 'authenticated' })
      }
      if (url.pathname.startsWith('/auth/v1/admin/users/') && request.method === 'DELETE') {
        log.deletedUsers.push(url.pathname.split('/').pop() ?? '')
        return Response.json({})
      }
      if (url.pathname.startsWith('/auth/v1/admin/users/') && request.method === 'PUT') {
        return Response.json({ id: url.pathname.split('/').pop() })
      }
      if (url.pathname === '/rest/v1/building_members') {
        const search = url.search
        if (request.method === 'GET') {
          if (search.includes('role=eq.manager')) {
            if (options.managerMembershipStatus) {
              return Response.json({ message: 'stub failure' }, { status: options.managerMembershipStatus })
            }
            return Response.json(options.managerMembership ? [options.managerMembership] : [])
          }
          if (search.includes('building_id=eq.')) {
            return Response.json(options.previousMembership ? [options.previousMembership] : [])
          }
          return Response.json(options.existingMembership ? [options.existingMembership] : [])
        }
        if ((options.upsertMembershipStatus ?? 201) >= 400) {
          return Response.json({ message: 'stub upsert failure' }, { status: options.upsertMembershipStatus })
        }
        return new Response(null, { status: 201 })
      }
      if (url.pathname === '/rest/v1/residents') {
        if (request.method === 'GET') {
          if (options.residentStatus) {
            return Response.json({ message: 'stub failure' }, { status: options.residentStatus })
          }
          if (url.search.includes('user_id=eq.')) {
            return Response.json(options.linkedResident ? [options.linkedResident] : [])
          }
          return Response.json(options.resident ?? null)
        }
        residentPatches += 1
        if ((options.residentUpdateStatus ?? 200) >= 400 && residentPatches === 1) {
          return Response.json({ message: 'stub update failure' }, { status: options.residentUpdateStatus })
        }
        return Response.json([{ id: residentId }])
      }
      if (url.pathname === '/rest/v1/profiles') {
        if (request.method === 'GET') {
          if (options.profileLookupStatus) {
            return Response.json({ message: 'stub failure' }, { status: options.profileLookupStatus })
          }
          if (url.search.includes('phone=eq.')) {
            return Response.json(options.existingProfile ? [options.existingProfile] : [])
          }
          return Response.json([options.profileSnapshot ?? { id: ownerId }])
        }
        if ((options.upsertProfileStatus ?? 201) >= 400) {
          return Response.json({ message: 'stub upsert failure' }, { status: options.upsertProfileStatus })
        }
        return new Response(null, { status: 201 })
      }
      if (url.pathname === '/rest/v1/audit_logs') {
        if (request.method === 'DELETE') return new Response(null, { status: 204 })
        if ((options.auditStatus ?? 201) >= 400) {
          return Response.json({ message: 'stub audit failure' }, { status: options.auditStatus })
        }
        return Response.json({ id: 'audit-entry-1' })
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
      () => fn(log),
    )
  } finally {
    await server.shutdown()
  }
}

const manager = { managerMembership: { building_id: buildingId } }

Deno.test('OPTIONS returns ok with CORS headers', async () => {
  const response = await handleRequest(
    new Request('https://example.test/manage-owner-access', { method: 'OPTIONS' }),
  )

  assertEquals(response.status, 200)
  assertEquals(await response.text(), 'ok')
  assertEquals(response.headers.get('Access-Control-Allow-Origin'), appOrigin)
})

Deno.test('non-POST method is rejected with 405', async () => {
  const response = await handleRequest(
    new Request('https://example.test/manage-owner-access', { method: 'GET' }),
  )

  assertEquals(response.status, 405)
  assertEquals(await response.json(), { error: 'method_not_allowed' })
})

Deno.test('request without bearer token returns 401', async () => {
  const response = await handleRequest(request({ resident_id: residentId }, ''))

  assertEquals(response.status, 401)
  assertEquals(await response.json(), { error: 'unauthorized' })
})

Deno.test('missing server configuration returns 500', async () => {
  await withEnv(
    { SUPABASE_URL: undefined, SUPABASE_ANON_KEY: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined },
    async () => {
      const response = await handleRequest(request())
      assertEquals(response.status, 500)
      assertEquals(await response.json(), { error: 'server_configuration_error' })
    },
  )
})

Deno.test('rejected caller session returns 401', async () => {
  await withSupabaseStub({ callerStatus: 401 }, async () => {
    const response = await handleRequest(request())
    assertEquals(response.status, 401)
    assertEquals(await response.json(), { error: 'unauthorized' })
  })
})

Deno.test('invalid JSON returns 400', async () => {
  await withSupabaseStub({}, async () => {
    const response = await handleRequest(
      new Request('https://example.test/manage-owner-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer session-token' },
        body: '{nope',
      }),
    )
    assertEquals(response.status, 400)
    assertEquals(await response.json(), { error: 'invalid_request' })
  })
})

Deno.test('invalid resident id returns 400 before any query', async () => {
  await withSupabaseStub({}, async (log) => {
    const response = await handleRequest(request({ resident_id: 'not-a-uuid' }))
    assertEquals(response.status, 400)
    assertEquals(await response.json(), { error: 'invalid_resident' })
    assertEquals(log.paths, ['GET /auth/v1/user'])
  })
})

Deno.test('caller without manager membership returns 403', async () => {
  await withSupabaseStub({ managerMembership: null }, async () => {
    const response = await handleRequest(request())
    assertEquals(response.status, 403)
    assertEquals(await response.json(), { error: 'manager_only' })
  })
})

Deno.test('resident outside the manager building returns 404', async () => {
  await withSupabaseStub({ ...manager, resident: null }, async () => {
    const response = await handleRequest(request())
    assertEquals(response.status, 404)
    assertEquals(await response.json(), { error: 'resident_not_found' })
  })
})

Deno.test('resident with an invalid phone returns 400', async () => {
  await withSupabaseStub(
    { ...manager, resident: { ...resident, phone: 'abc' } },
    async () => {
      const response = await handleRequest(request())
      assertEquals(response.status, 400)
      assertEquals(await response.json(), { error: 'invalid_phone' })
    },
  )
})

Deno.test('profile lookup failure returns 500', async () => {
  await withSupabaseStub(
    { ...manager, resident, profileLookupStatus: 500 },
    async () => {
      const response = await handleRequest(request())
      assertEquals(response.status, 500)
      assertEquals(await response.json(), { error: 'profile_lookup_failed' })
    },
  )
})

Deno.test('provisions a new owner account and returns a temporary PIN', async () => {
  await withSupabaseStub({ ...manager, resident }, async (log) => {
    const response = await handleRequest(request())
    assertEquals(response.status, 200)
    const body = await response.json()
    assertEquals(body.ok, true)
    assertEquals(body.phone, '+201012345678')
    assertEquals(body.first_login_pin_change_required, true)
    assertEquals(/^\d{8}$/.test(body.temporary_pin), true)
    assertEquals(log.paths.includes('POST /auth/v1/admin/users'), true)
    assertEquals(log.deletedUsers, [])
  })
})

Deno.test('reuses the account already linked to the resident', async () => {
  await withSupabaseStub(
    { ...manager, resident: { ...resident, user_id: ownerId }, profileSnapshot: { id: ownerId } },
    async (log) => {
      const response = await handleRequest(request())
      assertEquals(response.status, 200)
      assertEquals(log.paths.includes('POST /auth/v1/admin/users'), false)
    },
  )
})

Deno.test('phone linked to another apartment returns 409', async () => {
  await withSupabaseStub(
    {
      ...manager,
      resident: { ...resident, user_id: ownerId },
      existingProfile: { id: '66666666-6666-4666-8666-666666666666' },
    },
    async () => {
      const response = await handleRequest(request())
      assertEquals(response.status, 409)
      assertEquals(await response.json(), { error: 'phone_already_linked' })
    },
  )
})

Deno.test('orphan profile already attached elsewhere returns 409', async () => {
  await withSupabaseStub(
    {
      ...manager,
      resident,
      existingProfile: { id: '66666666-6666-4666-8666-666666666666' },
      linkedResident: { id: residentId },
    },
    async () => {
      const response = await handleRequest(request())
      assertEquals(response.status, 409)
      assertEquals(await response.json(), { error: 'phone_already_linked' })
    },
  )
})

Deno.test('existing membership with another role returns 409 and deletes the new user', async () => {
  await withSupabaseStub(
    {
      ...manager,
      resident,
      previousMembership: { building_id: buildingId, user_id: ownerId, role: 'manager' },
    },
    async (log) => {
      const response = await handleRequest(request())
      assertEquals(response.status, 409)
      assertEquals(await response.json(), { error: 'account_has_conflicting_role' })
      assertEquals(log.deletedUsers, [ownerId])
      assertEquals(log.paths.includes('DELETE /rest/v1/audit_logs'), false)
    },
  )
})

Deno.test('profile save failure compensates by deleting the new user', async () => {
  await withSupabaseStub(
    { ...manager, resident, upsertProfileStatus: 500 },
    async (log) => {
      const response = await handleRequest(request())
      assertEquals(response.status, 500)
      assertEquals(await response.json(), { error: 'profile_save_failed' })
      assertEquals(log.deletedUsers, [ownerId])
    },
  )
})

Deno.test('membership save failure compensates profile and auth', async () => {
  await withSupabaseStub(
    { ...manager, resident, upsertMembershipStatus: 500 },
    async (log) => {
      const response = await handleRequest(request())
      assertEquals(response.status, 500)
      assertEquals(await response.json(), { error: 'membership_save_failed' })
      assertEquals(log.deletedUsers, [ownerId])
    },
  )
})

Deno.test('resident link failure compensates the whole provisioning', async () => {
  await withSupabaseStub(
    { ...manager, resident, residentUpdateStatus: 500 },
    async (log) => {
      const response = await handleRequest(request())
      assertEquals(response.status, 500)
      assertEquals(await response.json(), { error: 'resident_link_failed' })
      assertEquals(log.deletedUsers, [ownerId])
    },
  )
})

Deno.test('audit failure rolls back all writes', async () => {
  await withSupabaseStub(
    { ...manager, resident, auditStatus: 500 },
    async (log) => {
      const response = await handleRequest(request())
      assertEquals(response.status, 500)
      assertEquals(await response.json(), { error: 'audit_log_save_failed' })
      assertEquals(log.deletedUsers, [ownerId])
    },
  )
})
