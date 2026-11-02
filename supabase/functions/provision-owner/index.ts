import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function generatePin(): string {
  let pin = '';
  const sample = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / 10) * 10;
  while (pin.length < 8) {
    crypto.getRandomValues(sample);
    if (sample[0] >= limit) continue;
    pin += String(sample[0] % 10);
  }
  return pin;
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
    return jsonResponse({ error: 'Function configuration or authorization is missing.' }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return jsonResponse({ error: 'Unauthenticated.' }, 401);

  const { data: caller, error: callerError } = await adminClient
    .from('profiles')
    .select('id, building_id, role')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (callerError || !caller || caller.role !== 'admin') {
    return jsonResponse({ error: 'Only a building admin may create owner accounts.' }, 403);
  }

  let input: { phone?: unknown; apartmentId?: unknown; displayName?: unknown };
  try {
    input = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400);
  }
  const phone = String(input.phone || '').replace(/[\s().-]/g, '');
  const apartmentId = String(input.apartmentId || '');
  const displayName = String(input.displayName || '').trim().slice(0, 120);
  if (!/^\+[1-9]\d{7,14}$/.test(phone) || !apartmentId) {
    return jsonResponse({ error: 'Enter a valid E.164 phone number and an apartment.' }, 400);
  }

  const { data: apartment, error: apartmentError } = await adminClient
    .from('apartments')
    .select('id, building_id')
    .eq('id', apartmentId)
    .eq('building_id', caller.building_id)
    .maybeSingle();
  if (apartmentError || !apartment) return jsonResponse({ error: 'Apartment was not found in your building.' }, 404);

  const { data: existingProfile, error: existingError } = await adminClient
    .from('profiles')
    .select('id, building_id, role, apartment_id')
    .eq('phone', phone)
    .maybeSingle();
  if (existingError) return jsonResponse({ error: existingError.message }, 500);

  const pin = generatePin();
  if (existingProfile) {
    if (existingProfile.building_id !== caller.building_id || existingProfile.role !== 'owner' || existingProfile.apartment_id !== apartment.id) {
      return jsonResponse({ error: 'This phone number is already assigned to a different account or apartment.' }, 409);
    }
    const { error: resetError } = await adminClient.auth.admin.updateUserById(existingProfile.id, { password: pin });
    if (resetError) return jsonResponse({ error: resetError.message }, 500);
    return jsonResponse({ phone, pin, apartmentId: apartment.id, reset: true });
  }

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    phone,
    password: pin,
    phone_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (createError || !created.user) {
    return jsonResponse({ error: createError?.message || 'Could not create the authentication account.' }, 400);
  }

  const { error: profileError } = await adminClient.from('profiles').insert({
    id: created.user.id,
    building_id: caller.building_id,
    role: 'owner',
    apartment_id: apartment.id,
    phone,
    display_name: displayName || null,
  });
  if (profileError) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    return jsonResponse({ error: profileError.message }, 500);
  }

  // Return the one-time generated PIN only to the authenticated admin who invoked
  // this function. Supabase Auth stores the password as a salted hash; this
  // function never writes a plaintext PIN to a public table or logs it.
  return jsonResponse({ phone, pin, apartmentId: apartment.id });
});
