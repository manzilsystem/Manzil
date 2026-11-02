import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
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

  const verifier = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: verified, error: verifyError } = await verifier.auth.signInWithPassword({
    email: authEmailForPhone(profile.phone),
    password: currentPin,
  })
  if (verifyError || verified.user?.id !== callerData.user.id) {
    return json(400, { error: 'invalid_current_pin' })
  }

  const { data: updatedProfile, error: updateError } = await admin
    .from('profiles')
    .update({ must_change_pin: false })
    .eq('id', callerData.user.id)
    .eq('must_change_pin', true)
    .select('id')
    .maybeSingle()
  if (updateError || !updatedProfile) {
    // Keep the first-login gate closed if profile state could not be committed.
    // The owner can retry with the newly chosen PIN as the current PIN.
    return json(500, { error: 'pin_updated_retry_required' })
  }

  const { error: passwordError } = await admin.auth.admin.updateUserById(callerData.user.id, {
    password: newPin,
  })
  if (passwordError) {
    // Restore the first-login gate when Auth rejects the new password.
    await admin
      .from('profiles')
      .update({ must_change_pin: true })
      .eq('id', callerData.user.id)
      .eq('must_change_pin', false)
    return json(400, { error: 'pin_update_failed' })
  }

  return json(200, { ok: true })
})
