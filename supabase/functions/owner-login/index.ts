import { createClient } from 'npm:@supabase/supabase-js@2'

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

Deno.serve(async (request: Request) => {
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const publishableKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return json(503, { error: 'login_unavailable' })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id')
    .eq('phone', phone)
    .maybeSingle()
  if (profileError) return json(503, { error: 'login_unavailable' })
  if (!profile) return json(401, { error: 'invalid_credentials' })

  const { data: membership, error: membershipError } = await admin
    .from('building_members')
    .select('user_id')
    .eq('user_id', profile.id)
    .eq('role', 'owner')
    .limit(1)
    .maybeSingle()
  if (membershipError) return json(503, { error: 'login_unavailable' })
  if (!membership) return json(401, { error: 'invalid_credentials' })

  const phoneHash = await hashPhone(phone, serviceRoleKey)
  const { data: rateLimit, error: rateLimitError } = await admin.rpc('owner_login_rate_limit', {
    p_phone_hash: phoneHash,
    p_action: 'attempt',
  })
  if (rateLimitError) {
    console.error('Owner login rate limiter failed:', rateLimitError)
    return json(503, { error: 'login_unavailable' })
  }
  if (rateLimit?.allowed !== true) {
    const retryAfter = Math.max(1, Number(rateLimit?.retry_after_seconds) || 900)
    return json(429, { error: 'rate_limited', retry_after_seconds: retryAfter }, { 'Retry-After': String(retryAfter) })
  }

  const verifier = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await verifier.auth.signInWithPassword({
    email: authEmailForPhone(phone),
    password: pin,
  })

  if (error) {
    if (error.status !== 400 && error.status !== 401) {
      await admin.rpc('owner_login_rate_limit', { p_phone_hash: phoneHash, p_action: 'success' })
      return json(503, { error: 'login_unavailable' })
    }
    return json(401, { error: 'invalid_credentials' })
  }
  if (!data.session?.access_token || !data.session?.refresh_token) {
    return json(503, { error: 'login_unavailable' })
  }

  const { error: resetError } = await admin.rpc('owner_login_rate_limit', {
    p_phone_hash: phoneHash,
    p_action: 'success',
  })
  if (resetError) {
    console.error('Owner login rate limiter reset failed:', resetError)
    return json(503, { error: 'login_unavailable' })
  }

  return json(200, {
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
  })
})
