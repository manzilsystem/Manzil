const appOrigin = Deno.env.get('APP_ORIGIN') || 'https://manzilsystem.github.io'
const corsHeaders = {
  'Access-Control-Allow-Origin': appOrigin,
  'Vary': 'Origin',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
}

function json(status: number, body: Record<string, unknown>, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
  })
}

function normalizePhone(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const raw = input.trim()
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776))
  const digits = raw.replace(/[^0-9]/g, '')
  let normalized: string

  if (raw.startsWith('00') && digits.length > 2) normalized = `+${digits.slice(2)}`
  else if (digits.length === 11 && digits.startsWith('01')) normalized = `+20${digits.slice(1)}`
  else if (digits.length === 10 && digits.startsWith('1')) normalized = `+20${digits}`
  else if (digits.length === 12 && digits.startsWith('20')) normalized = `+${digits}`
  else if (raw.startsWith('+')) normalized = `+${digits}`
  else return null

  const normalizedDigits = normalized.slice(1)
  if (normalizedDigits.length < 8 || normalizedDigits.length > 15 || normalizedDigits.startsWith('0')) return null
  return normalized
}

function normalizePin(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const pin = input.trim()
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776))
  return /^\d{6}(?:\d{2})?$/.test(pin) ? pin : null
}

function authEmailForPhone(phone: string): string {
  return `${phone.slice(1)}@phone-login.manzil.invalid`
}

async function hashPhone(phone: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(phone))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

type JsonRecord = Record<string, unknown>

function serviceHeaders(serviceRoleKey: string): Record<string, string> {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  }
}

async function readJson(response: Response): Promise<JsonRecord | null> {
  try {
    const body: unknown = await response.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? body as JsonRecord : null
  } catch {
    return null
  }
}

// Plain PostgREST calls keep the eszip bundle small enough for Supabase
// Branching. supabase-js pulled several MB into every function upload and made
// the platform reject the deploy with HTTP 413.
async function callRateLimit(
  supabaseUrl: string,
  serviceRoleKey: string,
  body: JsonRecord,
): Promise<JsonRecord | null> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/owner_login_rate_limit`, {
    method: 'POST',
    headers: serviceHeaders(serviceRoleKey),
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`owner_login_rate_limit failed: ${response.status}`)
  return readJson(response)
}

async function releaseAttempt(
  supabaseUrl: string,
  serviceRoleKey: string,
  phoneHash: string,
  context = '',
): Promise<void> {
  try {
    await callRateLimit(supabaseUrl, serviceRoleKey, {
      p_phone_hash: phoneHash,
      p_action: 'release',
    })
  } catch (err) {
    console.error(`Could not release owner login attempt${context}:`, err)
  }
}

async function selectRows(
  supabaseUrl: string,
  serviceRoleKey: string,
  path: string,
): Promise<JsonRecord[]> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: serviceHeaders(serviceRoleKey),
  })
  if (!response.ok) throw new Error(`${path.split('?')[0]} query failed: ${response.status}`)
  const body: unknown = await response.json()
  return Array.isArray(body) ? body as JsonRecord[] : []
}

export async function handleRequest(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  let payload: { phone?: unknown; pin?: unknown }
  try {
    payload = await request.json()
  } catch {
    return json(400, { error: 'invalid_request' })
  }

  const phone = normalizePhone(payload.phone)
  const pin = normalizePin(payload.pin)
  if (!phone || !pin) return json(400, { error: 'invalid_credentials' })

  const supabaseUrl = (Deno.env.get('SUPABASE_URL') || '').replace(/\/+$/, '')
  const publishableKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return json(503, { error: 'login_unavailable' })
  }

  // Count every syntactically valid phone probe, including unknown numbers,
  // so callers cannot bypass lockout by guessing unregistered phone numbers.
  const phoneHash = await hashPhone(phone, serviceRoleKey)
  let rateLimit: JsonRecord | null
  try {
    rateLimit = await callRateLimit(supabaseUrl, serviceRoleKey, {
      p_phone_hash: phoneHash,
      p_action: 'attempt',
    })
  } catch (err) {
    console.error('Owner login rate limiter failed:', err)
    return json(503, { error: 'login_unavailable' })
  }
  if (rateLimit?.allowed !== true) {
    const retryAfter = Math.max(1, Number(rateLimit?.retry_after_seconds) || 900)
    return json(429, { error: 'rate_limited', retry_after_seconds: retryAfter }, { 'Retry-After': String(retryAfter) })
  }

  let profile: JsonRecord | undefined
  try {
    profile = (await selectRows(
      supabaseUrl,
      serviceRoleKey,
      `profiles?select=id&phone=eq.${encodeURIComponent(phone)}&limit=1`,
    ))[0]
  } catch (err) {
    await releaseAttempt(supabaseUrl, serviceRoleKey, phoneHash, ' after profile lookup failure')
    console.error('Owner profile lookup failed:', err)
    return json(503, { error: 'login_unavailable' })
  }
  if (!profile) return json(401, { error: 'invalid_credentials' })

  let membership: JsonRecord | undefined
  try {
    membership = (await selectRows(
      supabaseUrl,
      serviceRoleKey,
      `building_members?select=user_id&user_id=eq.${encodeURIComponent(String(profile.id))}&role=eq.owner&limit=1`,
    ))[0]
  } catch (err) {
    await releaseAttempt(supabaseUrl, serviceRoleKey, phoneHash, ' after membership lookup failure')
    console.error('Owner membership lookup failed:', err)
    return json(503, { error: 'login_unavailable' })
  }
  if (!membership) return json(401, { error: 'invalid_credentials' })

  const tokenResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: authEmailForPhone(phone),
      password: pin,
    }),
  })
  const tokenBody = await readJson(tokenResponse)
  if (!tokenResponse.ok) {
    const status = tokenResponse.status
    if (status !== 400 && status !== 401) {
      await releaseAttempt(supabaseUrl, serviceRoleKey, phoneHash, ' after Auth outage')
      console.error('Owner Auth provider unavailable:', status)
      return json(503, { error: 'login_unavailable' })
    }
    return json(401, { error: 'invalid_credentials' })
  }

  const accessToken = tokenBody?.access_token
  const refreshToken = tokenBody?.refresh_token
  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string' || !accessToken || !refreshToken) {
    return json(503, { error: 'login_unavailable' })
  }

  try {
    await callRateLimit(supabaseUrl, serviceRoleKey, {
      p_phone_hash: phoneHash,
      p_action: 'success',
    })
  } catch (err) {
    console.error('Owner login rate limiter reset failed:', err)
    return json(503, { error: 'login_unavailable' })
  }

  return json(200, {
    session: {
      access_token: accessToken,
      refresh_token: refreshToken,
    },
  })
}

if (import.meta.main) {
  Deno.serve(handleRequest)
}
