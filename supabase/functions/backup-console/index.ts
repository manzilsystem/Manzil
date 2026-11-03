import { createClient } from 'npm:@supabase/supabase-js@2'
const appOrigin = Deno.env.get('APP_ORIGIN') || 'https://manzilsystem.github.io'
const headers = { 'Access-Control-Allow-Origin': appOrigin, 'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Max-Age': '86400', 'Vary': 'Origin', 'Cache-Control': 'no-store' }
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

  // A restore replaces the entire PostgreSQL database, not just one building.
  // Require this caller to manage every building before accepting that destructive request.
  const hasGlobalRestoreAccess = async (): Promise<boolean | null> => {
    const [{ data: buildings, error: buildingsError }, { data: managedMemberships, error: membershipsError }] = await Promise.all([
      admin.from('buildings').select('id'),
      admin.from('building_members').select('building_id').eq('user_id', auth.user.id).eq('role', 'manager')
    ])
    if (buildingsError || membershipsError) return null
    return Boolean(buildings?.length) && buildings.every(building =>
      managedMemberships?.some(item => item.building_id === building.id)
    )
  }

  let body: { action?: string; backup_tag?: string; confirmation?: string; request_id?: string }
  try { body = await req.json() } catch { return json(400, { error: 'invalid_json' }) }
  if (body.action === 'list') {
    const [{ data: backups, error: be }, { data: restoreRequests, error: re }, { data: backupRequests, error: bre }] = await Promise.all([
      admin.from('backup_catalog').select('tag,file_name,size_bytes,created_at').order('created_at', { ascending: false }).limit(30),
      admin.from('restore_requests').select('id,backup_tag,status,result_message,created_at,started_at,finished_at').eq('building_id', membership.building_id).order('created_at', { ascending: false }).limit(8),
      admin.from('backup_requests').select('id,status,result_message,created_at,dispatched_at,finished_at').eq('building_id', membership.building_id).order('created_at', { ascending: false }).limit(5)
    ])
    if (be || re || bre) return json(500, { error: 'query_failed' })
    return json(200, { backups: backups || [], restoreRequests: restoreRequests || [], backupRequests: backupRequests || [] })
  }
  if (body.action === 'request_backup') {
    const { data: pendingRestore } = await admin.from('restore_requests').select('id').in('status', ['queued','running']).limit(1).maybeSingle()
    if (pendingRestore) return json(409, { error: 'restore_already_pending' })
    const { data: request, error } = await admin.from('backup_requests')
      .insert({ building_id: membership.building_id, requested_by: auth.user.id })
      .select('id,status,created_at').single()
    if (error?.code === '23505') return json(409, { error: 'backup_already_pending' })
    if (error) return json(500, { error: 'request_failed' })
    return json(202, { request })
  }
  if (body.action === 'request_restore') {
    const globalRestoreAccess = await hasGlobalRestoreAccess()
    if (globalRestoreAccess === null) return json(500, { error: 'restore_authorization_check_failed' })
    if (!globalRestoreAccess) return json(403, { error: 'global_manager_only' })
    const tag = typeof body.backup_tag === 'string' ? body.backup_tag : ''
    if (!/^backup-\d{8}T\d{6}Z$/.test(tag) || body.confirmation !== 'RESTORE') return json(400, { error: 'confirmation_required' })
    const { data: backup } = await admin.from('backup_catalog').select('tag').eq('tag', tag).maybeSingle()
    if (!backup) return json(404, { error: 'backup_not_found' })
    const { data: pending } = await admin.from('restore_requests').select('id').in('status', ['queued','running']).limit(1).maybeSingle()
    const { data: pendingBackup } = await admin.from('backup_requests').select('id').in('status', ['queued','dispatched']).limit(1).maybeSingle()
    if (pending || pendingBackup) return json(409, { error: 'restore_already_pending' })
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
