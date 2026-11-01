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

function authEmailForPhone(phone: string): string {
  return `${phone.slice(1)}@phone-login.manzil.invalid`
}

function generateTemporaryPin(): string {
  const random = new Uint32Array(1)
  crypto.getRandomValues(random)
  return String(100000 + (random[0] % 900000))
}

function isUuid(value: string): boolean {
  return value.length === 36 && value[8] === '-' && value[13] === '-' && value[18] === '-' && value[23] === '-' && /^[0-9a-f-]{36}$/i.test(value)
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

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let payload: { resident_id?: unknown }
  try {
    payload = await request.json()
  } catch {
    return json(400, { error: 'invalid_request' })
  }
  const residentId = typeof payload.resident_id === 'string' ? payload.resident_id : ''
  if (!isUuid(residentId)) return json(400, { error: 'invalid_resident' })

  const { data: membership, error: membershipError } = await admin
    .from('building_members')
    .select('building_id')
    .eq('user_id', callerData.user.id)
    .eq('role', 'manager')
    .limit(1)
    .maybeSingle()
  if (membershipError || !membership) return json(403, { error: 'manager_only' })

  const { data: resident, error: residentError } = await admin
    .from('residents')
    .select('id, building_id, user_id, name, apartment_number, phone')
    .eq('id', residentId)
    .eq('building_id', membership.building_id)
    .single()
  if (residentError || !resident) return json(404, { error: 'resident_not_found' })

  const phone = normalizePhone(resident.phone)
  if (!phone) return json(400, { error: 'invalid_phone' })
  const loginEmail = authEmailForPhone(phone)

  const { data: existingProfile, error: profileLookupError } = await admin
    .from('profiles')
    .select('id')
    .eq('phone', phone)
    .limit(1)
    .maybeSingle()
  if (profileLookupError) return json(500, { error: 'profile_lookup_failed' })
  if (existingProfile && existingProfile.id !== resident.user_id) {
    return json(409, { error: 'phone_already_linked' })
  }

  const temporaryPin = generateTemporaryPin()
  let ownerUserId = resident.user_id as string | null
  let createdNewUser = false

  if (ownerUserId) {
    const { error } = await admin.auth.admin.updateUserById(ownerUserId, {
      email: loginEmail,
      email_confirm: true,
      password: temporaryPin,
      user_metadata: { full_name: resident.name, phone },
    })
    if (error) return json(400, { error: 'auth_update_failed' })
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: loginEmail,
      email_confirm: true,
      password: temporaryPin,
      user_metadata: { full_name: resident.name, phone },
    })
    if (error || !data.user) return json(409, { error: 'phone_account_create_failed' })
    ownerUserId = data.user.id
    createdNewUser = true
  }

  const { error: upsertProfileError } = await admin.from('profiles').upsert({
    id: ownerUserId,
    full_name: resident.name,
    phone,
    must_change_pin: true,
  })
  if (upsertProfileError) {
    if (createdNewUser && ownerUserId) await admin.auth.admin.deleteUser(ownerUserId)
    return json(500, { error: 'profile_save_failed' })
  }

  const { error: membershipUpsertError } = await admin.from('building_members').upsert({
    building_id: membership.building_id,
    user_id: ownerUserId,
    role: 'owner',
  })
  if (membershipUpsertError) {
    if (createdNewUser && ownerUserId) await admin.auth.admin.deleteUser(ownerUserId)
    return json(500, { error: 'membership_save_failed' })
  }

  const { error: residentUpdateError } = await admin.from('residents').update({
    user_id: ownerUserId,
    phone,
  }).eq('id', resident.id).eq('building_id', membership.building_id)
  if (residentUpdateError) {
    if (createdNewUser && ownerUserId) await admin.auth.admin.deleteUser(ownerUserId)
    return json(500, { error: 'resident_link_failed' })
  }

  await admin.from('audit_logs').insert({
    building_id: membership.building_id,
    action: 'إصدار PIN مالك',
    details: `${resident.name} - شقة ${resident.apartment_number}`,
    actor_id: callerData.user.id,
  })

  return json(200, {
    ok: true,
    phone,
    temporary_pin: temporaryPin,
    first_login_pin_change_required: true,
  })
})
