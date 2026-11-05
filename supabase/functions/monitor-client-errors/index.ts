import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") || "https://manzilsystem.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { cron, secret } = body;

    // Verify cron secret
    const expectedSecret = Deno.env.get("CRON_SECRET");
    if (!expectedSecret || secret !== expectedSecret) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    if (cron !== "daily_error_check") {
      return new Response("Unknown cron job", { status: 400, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check error count in last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from("client_errors")
      .select("id", { count: "exact", head: true })
      .gte("created_at", oneDayAgo);

    if (error) throw error;

    const errorCount = count || 0;
    const threshold = 100; // Alert if > 100 errors in 24h

    if (errorCount > threshold) {
      console.error(`High error rate detected: ${errorCount} errors in last 24h (threshold: ${threshold})`);

      // Get building managers to notify
      const { data: buildings, error: buildingsError } = await supabase
        .from("buildings")
        .select("id, manager_name, manager_phone");

      if (buildingsError) throw buildingsError;

      // Log alert - actual notification can be added later
      console.log(`Would notify ${buildings?.length || 0} building managers about high error rate`);
    } else {
      console.log(`Error rate normal: ${errorCount} errors in last 24h (threshold: ${threshold})`);
    }

    return new Response(JSON.stringify({ checked: true, errorCount, threshold }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error monitoring function failed:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
