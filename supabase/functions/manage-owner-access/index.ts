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
  return String(10000000 + (random[0] % 90000000))
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
    .select('*')
    .eq('phone', phone)
    .limit(1)
    .maybeSingle()
  if (profileLookupError) return json(500, { error: 'profile_lookup_failed' })

  let ownerUserId = resident.user_id as string | null
  let createdNewUser = false
  if (existingProfile && existingProfile.id !== resident.user_id) {
    // Never replace an account already linked to this apartment.
    if (ownerUserId) return json(409, { error: 'phone_already_linked' })

    // A prior failed attempt can leave an auth/profile account with no links.
    // Reuse that account only if it is not attached to any resident or building.
    const { data: linkedResident, error: residentLinkLookupError } = await admin
      .from('residents')
      .select('id')
      .eq('user_id', existingProfile.id)
      .limit(1)
      .maybeSingle()
    const { data: existingMembership, error: membershipLookupError } = await admin
      .from('building_members')
      .select('user_id')
      .eq('user_id', existingProfile.id)
      .limit(1)
      .maybeSingle()
    if (residentLinkLookupError || membershipLookupError) {
      return json(500, { error: 'profile_link_lookup_failed' })
    }
    if (linkedResident || existingMembership) {
      return json(409, { error: 'phone_already_linked' })
    }
    ownerUserId = existingProfile.id
  }

  const temporaryPin = generateTemporaryPin()

  if (ownerUserId) {
    // Keep the existing credentials unchanged until all database links succeed.
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

  const { data: previousMembership, error: previousMembershipError } = await admin
    .from('building_members')
    .select('building_id, user_id, role')
    .eq('building_id', membership.building_id)
    .eq('user_id', ownerUserId)
    .maybeSingle()
  if (previousMembershipError) {
    if (createdNewUser && ownerUserId) {
      const { error } = await admin.auth.admin.deleteUser(ownerUserId)
      if (error) return json(500, { error: 'provisioning_compensation_failed' })
    }
    return json(500, { error: 'membership_snapshot_failed' })
  }
  if (previousMembership && previousMembership.role !== 'owner') {
    if (createdNewUser && ownerUserId) {
      const { error } = await admin.auth.admin.deleteUser(ownerUserId)
      if (error) return json(500, { error: 'provisioning_compensation_failed' })
    }
    return json(409, { error: 'account_has_conflicting_role' })
  }

  const { data: profileSnapshot, error: profileSnapshotError } = await admin
    .from('profiles')
    .select('*')
    .eq('id', ownerUserId)
    .maybeSingle()
  if (profileSnapshotError || !profileSnapshot) {
    if (createdNewUser && ownerUserId) {
      const { error } = await admin.auth.admin.deleteUser(ownerUserId)
      if (error) return json(500, { error: 'provisioning_compensation_failed' })
    }
    return json(500, { error: 'profile_snapshot_failed' })
  }

  const residentSnapshot = { user_id: resident.user_id, phone: resident.phone }
  // Captured for the compensation closure: TS drops outer null-narrowing inside nested functions.
  const linkedResidentId = resident.id
  const linkedBuildingId = membership.building_id
  let profileWriteAttempted = false
  let membershipWriteAttempted = false
  let residentLinkAttempted = false
  let auditId: string | null = null

  async function compensateProvisioning(): Promise<boolean> {
    let restored = true
    if (auditId) {
      const { error } = await admin.from('audit_logs').delete().eq('id', auditId)
      if (error) {
        restored = false
        console.error('owner_access_compensation_audit_failed', error)
      }
    }

    if (createdNewUser && ownerUserId) {
      const { error } = await admin.auth.admin.deleteUser(ownerUserId)
      if (error) {
        console.error('owner_access_compensation_auth_delete_failed', error)
        return false
      }
      if (residentLinkAttempted) {
        const { error: residentRestoreError } = await admin.from('residents').update({
          user_id: residentSnapshot.user_id,
          phone: residentSnapshot.phone,
        }).eq('id', linkedResidentId).eq('building_id', linkedBuildingId)
        if (residentRestoreError) {
          console.error('owner_access_compensation_new_user_resident_failed', residentRestoreError)
          restored = false
        }
      }
      return restored
    }

    if (residentLinkAttempted) {
      const { error } = await admin.from('residents').update({
        user_id: residentSnapshot.user_id,
        phone: residentSnapshot.phone,
      }).eq('id', linkedResidentId).eq('building_id', linkedBuildingId)
      if (error) {
        restored = false
        console.error('owner_access_compensation_resident_failed', error)
      }
    }

    if (membershipWriteAttempted) {
      if (previousMembership) {
        const { error } = await admin.from('building_members').upsert(previousMembership)
        if (error) {
          restored = false
          console.error('owner_access_compensation_membership_failed', error)
        }
      } else {
        const { error } = await admin.from('building_members').delete()
          .eq('building_id', linkedBuildingId)
          .eq('user_id', ownerUserId)
        if (error) {
          restored = false
          console.error('owner_access_compensation_membership_delete_failed', error)
        }
      }
    }

    if (profileWriteAttempted) {
      const { error } = await admin.from('profiles').upsert(profileSnapshot)
      if (error) {
        restored = false
        console.error('owner_access_compensation_profile_failed', error)
      }
    }
    return restored
  }

  const failWithCompensation = async (error: string, status = 500) => {
    const restored = await compensateProvisioning()
    return json(restored ? status : 500, {
      error: restored ? error : 'provisioning_compensation_failed',
    })
  }

  profileWriteAttempted = true
  const { error: upsertProfileError } = await admin.from('profiles').upsert({
    id: ownerUserId,
    full_name: resident.name,
    phone,
    must_change_pin: true,
  })
  if (upsertProfileError) return await failWithCompensation('profile_save_failed')

  membershipWriteAttempted = true
  const { error: membershipUpsertError } = await admin.from('building_members').upsert({
    building_id: membership.building_id,
    user_id: ownerUserId,
    role: 'owner',
  })
  if (membershipUpsertError) return await failWithCompensation('membership_save_failed')

  residentLinkAttempted = true
  const { data: linkedResident, error: residentUpdateError } = await admin.from('residents').update({
    user_id: ownerUserId,
    phone,
  }).eq('id', resident.id).eq('building_id', membership.building_id)
    .select('id')
    .maybeSingle()
  if (residentUpdateError || !linkedResident) return await failWithCompensation('resident_link_failed')

  const { data: auditEntry, error: auditError } = await admin.from('audit_logs').insert({
    building_id: membership.building_id,
    action: 'إصدار PIN مالك',
    details: `${resident.name} - شقة ${resident.apartment_number}`,
    actor_id: callerData.user.id,
  }).select('id').single()
  if (auditError || !auditEntry) return await failWithCompensation('audit_log_save_failed')
  auditId = auditEntry.id

  if (!createdNewUser && ownerUserId) {
    const { error } = await admin.auth.admin.updateUserById(ownerUserId, {
      email: loginEmail,
      email_confirm: true,
      password: temporaryPin,
      user_metadata: { full_name: resident.name, phone },
    })
    if (error) {
      // Auth Admin is outside the database compensation boundary. A transport
      // error may be returned after Auth has committed the new credential.
      // Keep the database linkage and audit row intact so either credential
      // outcome remains attached to the same owner account; allow a safe retry.
      console.error('owner_access_auth_update_status_unknown', error)
      return json(503, { error: 'auth_update_status_unknown' })
    }
  }

  return json(200, {
    ok: true,
    phone,
    temporary_pin: temporaryPin,
    first_login_pin_change_required: true,
  })
})
