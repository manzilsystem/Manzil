import { createClient } from 'npm:@supabase/supabase-js@2'
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store' }
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } })
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  const authorization = req.headers.get('Authorization') || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!token) return json(401, { error: 'unauthorized' })
  const url = Deno.env.get('SUPABASE_URL'), anonKey = Deno.env.get('SUPABASE_ANON_KEY'), serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anonKey || !serviceKey) return json(500, { error: 'server_configuration_error' })
  const caller = createClient(url, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: authorization } } })
  const { data: auth, error: authError } = await caller.auth.getUser(token)
  if (authError || !auth.user) return json(401, { error: 'unauthorized' })
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: membership, error: memberError } = await admin.from('building_members').select('building_id, role').eq('user_id', auth.user.id).eq('role', 'manager').limit(1).maybeSingle()
  if (memberError || !membership) return json(403, { error: 'manager_only' })
  let body: { action?: string; backup_tag?: string; confirmation?: string; request_id?: string }
  try { body = await req.json() } catch { return json(400, { error: 'invalid_json' }) }
  if (body.action === 'list') {
    const [{ data: backups, error: be }, { data: requests, error: re }] = await Promise.all([
      admin.from('backup_catalog').select('tag,file_name,size_bytes,sha256,created_at').order('created_at', { ascending: false }).limit(30),
      admin.from('restore_requests').select('id,backup_tag,status,result_message,created_at,started_at,finished_at').eq('building_id', membership.building_id).order('created_at', { ascending: false }).limit(10),
    ])
    if (be || re) return json(500, { error: 'query_failed' })
    return json(200, { backups: backups || [], requests: requests || [] })
  }
  if (body.action === 'request_restore') {
    const tag = typeof body.backup_tag === 'string' ? body.backup_tag : ''
    if (!/^backup-\d{8}T\d{6}Z$/.test(tag) || body.confirmation !== 'RESTORE') return json(400, { error: 'confirmation_required' })
    const { data: backup } = await admin.from('backup_catalog').select('tag').eq('tag', tag).maybeSingle()
    if (!backup) return json(404, { error: 'backup_not_found' })
    const { data: pending } = await admin.from('restore_requests').select('id').in('status', ['queued','running']).limit(1).maybeSingle()
    if (pending) return json(409, { error: 'restore_already_pending' })
    const { data: request, error } = await admin.from('restore_requests').insert({ building_id: membership.building_id, requested_by: auth.user.id, backup_tag: tag }).select('id,backup_tag,status,created_at').single()
    if (error?.code === '23505') return json(409, { error: 'restore_already_pending' })
    if (error) return json(500, { error: 'request_failed' })
    return json(202, { request })
  }
  if (body.action === 'status') {
    const id = typeof body.request_id === 'string' ? body.request_id : ''
    const { data, error } = await admin.from('restore_requests').select('id,backup_tag,status,result_message,created_at,started_at,finished_at').eq('id', id).eq('building_id', membership.building_id).maybeSingle()
    if (error || !data) return json(404, { error: 'request_not_found' })
    return json(200, { request: data })
  }
  return json(400, { error: 'unknown_action' })
})
