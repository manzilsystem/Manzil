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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count, error } = await supabase
      .from('client_errors')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', oneDayAgo)

    if (error) throw error

    const errorCount = count || 0
    const threshold = 100

    if (errorCount > threshold) {
      console.error(`High error rate detected: ${errorCount} errors in last 24h (threshold: ${threshold})`)

      const { data: buildings, error: buildingsError } = await supabase
        .from('buildings')
        .select('id, manager_name, manager_phone')

      if (buildingsError) throw buildingsError

      console.log(`Would notify ${buildings?.length || 0} building managers about high error rate`)
    } else {
      console.log(`Error rate normal: ${errorCount} errors in last 24h (threshold: ${threshold})`)
    }

    return json(200, { checked: true, errorCount, threshold })
  } catch (err) {
    console.error('Error monitoring function failed:', err)
    return json(500, { error: 'internal_server_error' })
  }
}

if (Deno.mainModule === import.meta.url) {
  Deno.serve(handleRequest)
}
