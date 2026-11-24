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

function restConfig() {
  const url = (Deno.env.get('SUPABASE_URL') || '').replace(/\/+$/, '')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!url || !key) throw new Error('missing_supabase_config')
  return { url, headers: { apikey: key, Authorization: `Bearer ${key}` } }
}

export async function handleRequest(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' })
  }

  try {
    const body = await request.json()
    const { cron, secret } = body as { cron?: string; secret?: string }

    const expectedSecret = Deno.env.get('CRON_SECRET')
    if (!expectedSecret || secret !== expectedSecret) {
      return json(401, { error: 'unauthorized' })
    }

    if (cron !== 'daily_error_check') {
      return json(400, { error: 'unknown_cron_job' })
    }

    const { url, headers } = restConfig()
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const countResponse = await fetch(
      `${url}/rest/v1/client_errors?select=id&created_at=gte.${encodeURIComponent(oneDayAgo)}`,
      { headers: { ...headers, Prefer: 'count=exact', Range: '0-0' } },
    )
    if (!countResponse.ok) throw new Error(`client_errors query failed: ${countResponse.status}`)
    const contentRange = countResponse.headers.get('content-range') || ''
    const reportedCount = Number(contentRange.split('/')[1])
    await countResponse.text()
    const errorCount = Number.isFinite(reportedCount) ? reportedCount : 0
    const threshold = 100

    if (errorCount > threshold) {
      console.error(`High error rate detected: ${errorCount} errors in last 24h (threshold: ${threshold})`)

      const buildingsResponse = await fetch(
        `${url}/rest/v1/buildings?select=id,manager_name,manager_phone`,
        { headers },
      )
      if (!buildingsResponse.ok) throw new Error(`buildings query failed: ${buildingsResponse.status}`)
      const buildings = await buildingsResponse.json()
      console.log(`Would notify ${Array.isArray(buildings) ? buildings.length : 0} building managers about high error rate`)
    } else {
      console.log(`Error rate normal: ${errorCount} errors in last 24h (threshold: ${threshold})`)
    }

    return json(200, { checked: true, errorCount, threshold })
  } catch (err) {
    console.error('Error monitoring function failed:', err)
    return json(500, { error: 'internal_server_error' })
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest)
}
