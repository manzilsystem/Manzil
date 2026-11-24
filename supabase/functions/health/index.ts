const appOrigin = Deno.env.get('APP_ORIGIN') || 'https://manzilsystem.github.io'
const corsHeaders = {
  'Access-Control-Allow-Origin': appOrigin,
  'Vary': 'Origin',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'no-store',
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// مسبار حياة خفيف للتطبيق: يثبت أن Edge Runtime يعمل دون كشف أي بيانات أو أسرار.
// فحص جاهزية المصادقة متاح في /auth/v1/health، وبيانات REST تتطلب جلسة مدير بسبب RLS.
export async function handleRequest(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'GET') {
    return json(405, { error: 'method_not_allowed' })
  }

  return json(200, {
    status: 'ok',
    service: 'manzil',
    release: Deno.env.get('APP_RELEASE') || 'unknown',
    time: new Date().toISOString(),
  })
}

if (import.meta.main) {
  Deno.serve(handleRequest)
}
