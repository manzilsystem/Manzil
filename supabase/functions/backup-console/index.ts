import { createClient } from 'npm:@supabase/supabase-js@2'
const appOrigin = Deno.env.get('APP_ORIGIN') || 'https://manzilsystem.github.io'
const headers = { 'Access-Control-Allow-Origin': appOrigin, 'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Expose-Headers': 'X-Backup-SHA256, Content-Disposition', 'Access-Control-Max-Age': '86400', 'Vary': 'Origin', 'Cache-Control': 'no-store' }
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
  if (memberError) return json(500, { error: 'membership_check_failed' })
  if (!membership) return json(403, { error: 'manager_only' })

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
    const [globalAccess, { data: backups, error: be }, { data: restoreRequests, error: re }, { data: backupRequests, error: bre }] = await Promise.all([
      hasGlobalRestoreAccess(),
      admin.from('backup_catalog').select('tag,file_name,size_bytes,created_at').order('created_at', { ascending: false }).limit(30),
      admin.from('restore_requests').select('id,backup_tag,status,result_message,created_at,started_at,finished_at').eq('building_id', membership.building_id).order('created_at', { ascending: false }).limit(8),
      admin.from('backup_requests').select('id,status,result_message,created_at,dispatched_at,finished_at').eq('building_id', membership.building_id).order('created_at', { ascending: false }).limit(5)
    ])
    if (globalAccess === null) return json(500, { error: 'download_authorization_check_failed' })
    if (be || re || bre) return json(500, { error: 'query_failed' })
    return json(200, { backups: backups || [], restoreRequests: restoreRequests || [], backupRequests: backupRequests || [], canDownload: globalAccess })
  }
  if (body.action === 'download_backup' || body.action === 'prepare_download') {
    const globalAccess = await hasGlobalRestoreAccess()
    if (globalAccess === null) return json(500, { error: 'download_authorization_check_failed' })
    if (!globalAccess) return json(403, { error: 'global_manager_only' })

    const tag = typeof body.backup_tag === 'string' ? body.backup_tag : ''
    if (!/^backup-\d{8}T\d{6}Z$/.test(tag)) return json(400, { error: 'invalid_backup_tag' })

    const githubToken = Deno.env.get('BACKUP_REPO_TOKEN')
    if (!githubToken) return json(503, { error: 'backup_download_not_configured' })

    const { data: backup, error: backupError } = await admin
      .from('backup_catalog')
      .select('tag,file_name,size_bytes,sha256')
      .eq('tag', tag)
      .maybeSingle()
    if (backupError) return json(500, { error: 'backup_lookup_failed' })
    if (!backup) return json(404, { error: 'backup_not_found' })

    const filename = `manzil-db-${tag.slice('backup-'.length)}.dump`
    if (backup.file_name !== filename || !Number.isSafeInteger(Number(backup.size_bytes)) || Number(backup.size_bytes) <= 0 || !/^[a-f0-9]{64}$/i.test(String(backup.sha256 || ''))) {
      return json(409, { error: 'backup_metadata_invalid' })
    }

    const githubHeaders = {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${githubToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Manzil-Backup-Console'
    }
    const apiBase = 'https://api.github.com/repos/manzilsystem/manzil_backups'
    try {
      const releaseResponse = await fetch(`${apiBase}/releases/tags/${encodeURIComponent(tag)}`, { headers: githubHeaders })
      if (releaseResponse.status === 404) return json(404, { error: 'backup_release_not_found' })
      if (!releaseResponse.ok) return json(502, { error: 'backup_provider_unavailable' })
      const release = await releaseResponse.json()
      if (release.tag_name !== tag || release.draft || release.prerelease || !Array.isArray(release.assets)) {
        return json(409, { error: 'backup_release_invalid' })
      }

      const dumpAsset = release.assets.find((asset: { name?: string; size?: number; state?: string; url?: string; digest?: string }) =>
        asset.name === filename && asset.state === 'uploaded' && Number(asset.size) === Number(backup.size_bytes)
      )
      const checksumAsset = release.assets.find((asset: { name?: string; state?: string; url?: string }) =>
        asset.name === `${filename}.sha256` && asset.state === 'uploaded'
      )
      if (!dumpAsset?.url || !checksumAsset?.url) return json(404, { error: 'backup_asset_missing' })
      if (dumpAsset.digest && dumpAsset.digest.toLowerCase() !== `sha256:${String(backup.sha256).toLowerCase()}`) {
        return json(409, { error: 'backup_asset_digest_mismatch' })
      }

      const trustedAssetUrl = (value: string) =>
        /^https:\/\/api\.github\.com\/repos\/manzilsystem\/manzil_backups\/releases\/assets\/\d+$/.test(value)
      if (!trustedAssetUrl(dumpAsset.url) || !trustedAssetUrl(checksumAsset.url)) {
        return json(502, { error: 'backup_provider_response_invalid' })
      }

      const checksumResponse = await fetch(checksumAsset.url, {
        headers: { ...githubHeaders, 'Accept': 'application/octet-stream' },
        redirect: 'follow'
      })
      if (!checksumResponse.ok) return json(502, { error: 'backup_checksum_unavailable' })
      const checksumText = await checksumResponse.text()
      const checksumMatch = checksumText.trim().match(/^([a-f0-9]{64})\s+\*?(.+)$/i)
      if (!checksumMatch || checksumMatch[1].toLowerCase() !== String(backup.sha256).toLowerCase() || checksumMatch[2].split('/').pop() !== filename) {
        return json(409, { error: 'backup_checksum_mismatch' })
      }

      // Prefer a short-lived GitHub asset redirect so the browser streams the
      // dump directly to its download manager instead of buffering it in Edge.
      if (body.action === 'prepare_download') {
        if (!dumpAsset.digest) return json(409, { error: 'provider_digest_unavailable' })
        const redirectResponse = await fetch(dumpAsset.url, {
          headers: { ...githubHeaders, 'Accept': 'application/octet-stream' },
          redirect: 'manual'
        })
        const location = redirectResponse.headers.get('location')
        if (![301, 302, 303, 307, 308].includes(redirectResponse.status) || !location) {
          return json(409, { error: 'direct_download_unavailable' })
        }
        const directUrl = new URL(location)
        if (directUrl.protocol !== 'https:' || directUrl.username || directUrl.password
          || !['release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(directUrl.hostname)) {
          return json(502, { error: 'backup_direct_url_invalid' })
        }
        return json(200, {
          downloadUrl: directUrl.toString(),
          filename,
          sha256: String(backup.sha256).toLowerCase(),
          sizeBytes: Number(backup.size_bytes)
        })
      }

      const assetResponse = await fetch(dumpAsset.url, {
        headers: { ...githubHeaders, 'Accept': 'application/octet-stream' },
        redirect: 'follow'
      })
      if (!assetResponse.ok || !assetResponse.body) return json(502, { error: 'backup_download_failed' })
      const contentLength = Number(assetResponse.headers.get('content-length') || dumpAsset.size)
      const finalHost = new URL(assetResponse.url).hostname
      const contentType = (assetResponse.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
      if (contentLength !== Number(backup.size_bytes) || !['api.github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(finalHost) || contentType !== 'application/octet-stream') {
        return json(502, { error: 'backup_download_response_invalid' })
      }
      const responseHeaders = new Headers(headers)
      responseHeaders.set('Content-Type', 'application/octet-stream')
      responseHeaders.set('Content-Disposition', `attachment; filename="${filename}"`)
      responseHeaders.set('Content-Length', String(backup.size_bytes))
      responseHeaders.set('X-Backup-SHA256', String(backup.sha256).toLowerCase())
      return new Response(assetResponse.body, { status: 200, headers: responseHeaders })
    } catch {
      return json(502, { error: 'backup_provider_unavailable' })
    }
  }
  if (body.action === 'request_backup') {
    const { data: pendingRestore, error: pendingRestoreError } = await admin.from('restore_requests').select('id').in('status', ['queued','running']).limit(1).maybeSingle()
    if (pendingRestoreError) return json(500, { error: 'maintenance_state_check_failed' })
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
    const { data: backup, error: backupError } = await admin.from('backup_catalog').select('tag').eq('tag', tag).maybeSingle()
    if (backupError) return json(500, { error: 'backup_lookup_failed' })
    if (!backup) return json(404, { error: 'backup_not_found' })
    const [
      { data: pending, error: pendingError },
      { data: pendingBackup, error: pendingBackupError }
    ] = await Promise.all([
      admin.from('restore_requests').select('id').in('status', ['queued','running']).limit(1).maybeSingle(),
      admin.from('backup_requests').select('id').in('status', ['queued','dispatched']).limit(1).maybeSingle()
    ])
    if (pendingError || pendingBackupError) return json(500, { error: 'maintenance_state_check_failed' })
    if (pending || pendingBackup) return json(409, { error: 'restore_already_pending' })
    const { data: request, error } = await admin.from('restore_requests').insert({ building_id: membership.building_id, requested_by: auth.user.id, backup_tag: tag }).select('id,backup_tag,status,created_at').single()
    if (error?.code === '23505') return json(409, { error: 'restore_already_pending' })
    if (error) return json(500, { error: 'request_failed' })
    return json(202, { request })
  }
  if (body.action === 'status') {
    const id = typeof body.request_id === 'string' ? body.request_id : ''
    const { data, error } = await admin.from('restore_requests').select('id,backup_tag,status,result_message,created_at,started_at,finished_at').eq('id', id).eq('building_id', membership.building_id).maybeSingle()
    if (error) return json(500, { error: 'status_query_failed' })
    if (!data) return json(404, { error: 'request_not_found' })
    return json(200, { request: data })
  }
  return json(400, { error: 'unknown_action' })
})
