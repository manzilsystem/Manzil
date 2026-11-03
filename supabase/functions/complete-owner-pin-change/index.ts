import { createClient } from 'npm:@supabase/supabase-js@2'

const appOrigin = Deno.env.get('APP_ORIGIN') || 'https://manzilsystem.github.io'
const corsHeaders = {
  'Access-Control-Allow-Origin': appOrigin,
  'Vary': 'Origin',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function normalizePin(input: unknown, allowTemporary = false): string | null {
  if (typeof input !== 'string') return null
  const pin = input.trim()
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776))
  return (allowTemporary ? /^(?:\d{6}|\d{8})$/ : /^\d{6}$/).test(pin) ? pin : null
}

function isE164Phone(phone: unknown): phone is string {
  return typeof phone === 'string' && /^\+[1-9]\d{7,14}$/.test(phone)
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

  const authorization = request.headers.get('Authorization') || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) return json(401, { error: 'unauthorized' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const publishableKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return json(500, { error: 'server_configuration_error' })
  }

  const callerClient = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  })
  const { data: callerData, error: callerError } = await callerClient.auth.getUser(token)
  if (callerError || !callerData.user) return json(401, { error: 'unauthorized' })

  let payload: { current_pin?: unknown; new_pin?: unknown }
  try {
    payload = await request.json()
  } catch {
    return json(400, { error: 'invalid_request' })
  }

  const currentPin = normalizePin(payload.current_pin, true)
  const newPin = normalizePin(payload.new_pin)
  if (!currentPin || !newPin) return json(400, { error: 'invalid_pin_format' })
  if (currentPin === newPin) return json(400, { error: 'pin_must_change' })

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('phone, must_change_pin')
    .eq('id', callerData.user.id)
    .maybeSingle()
  if (profileError) return json(500, { error: 'profile_lookup_failed' })
  if (!profile || profile.must_change_pin !== true || !isE164Phone(profile.phone)) {
    return json(403, { error: 'pin_change_not_required' })
  }

  const { data: membership, error: membershipError } = await admin
    .from('building_members')
    .select('user_id')
    .eq('user_id', callerData.user.id)
    .eq('role', 'owner')
    .limit(1)
    .maybeSingle()
  if (membershipError) return json(500, { error: 'membership_lookup_failed' })
  if (!membership) return json(403, { error: 'owner_only' })

  const phoneHash = await hashPhone(profile.phone, serviceRoleKey)
  const { data: rateLimit, error: rateLimitError } = await admin.rpc('owner_login_rate_limit', {
    p_phone_hash: phoneHash,
    p_action: 'attempt',
  })
  if (rateLimitError) return json(503, { error: 'login_unavailable' })
  if (rateLimit?.allowed !== true) {
    const retryAfter = Math.max(1, Number(rateLimit?.retry_after_seconds) || 900)
    return new Response(JSON.stringify({ error: 'rate_limited', retry_after_seconds: retryAfter }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) },
    })
  }

  const verifier = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: verified, error: verifyError } = await verifier.auth.signInWithPassword({
    email: authEmailForPhone(profile.phone),
    password: currentPin,
  })
  if (verifyError) {
    if (verifyError.status !== 400 && verifyError.status !== 401) {
      const { error: releaseError } = await admin.rpc('owner_login_rate_limit', {
        p_phone_hash: phoneHash,
        p_action: 'release',
      })
      if (releaseError) console.error('Could not release PIN attempt after Auth outage:', releaseError)
      return json(503, { error: 'login_unavailable' })
    }
    return json(400, { error: 'invalid_current_pin' })
  }
  if (verified.user?.id !== callerData.user.id) {
    return json(400, { error: 'invalid_current_pin' })
  }

  const { error: rateLimitResetError } = await admin.rpc('owner_login_rate_limit', {
    p_phone_hash: phoneHash,
    p_action: 'success',
  })
  if (rateLimitResetError) return json(503, { error: 'login_unavailable' })

  // Change the Auth credential first. Keep the RLS first-login gate closed
  // until Auth confirms the new password has been saved successfully.
  const { error: passwordError } = await admin.auth.admin.updateUserById(callerData.user.id, {
    password: newPin,
  })
  if (passwordError) {
    const status = Number(passwordError.status || 0)
    if ([400, 401, 403, 422, 429].includes(status)) {
      return json(400, { error: 'pin_update_failed' })
    }
    console.error('Auth credential update outcome is unknown:', passwordError)
    return json(503, { error: 'pin_update_status_unknown' })
  }

  const { data: updatedProfile, error: updateError } = await admin
    .from('profiles')
    .update({ must_change_pin: false })
    .eq('id', callerData.user.id)
    .eq('must_change_pin', true)
    .select('id')
    .maybeSingle()
  if (updateError || !updatedProfile) {
    // Auth now uses the new PIN, but RLS remains closed until this flag is
    // committed. The owner can retry using the new PIN as the current PIN.
    return json(500, { error: 'pin_updated_retry_required' })
  }

  return json(200, { ok: true })
})
