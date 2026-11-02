from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
migration = (root / "supabase/migrations/20261101163000_secure_owner_manager_access.sql").read_text(encoding="utf-8").lower()
client = (root / "js/supabase.js").read_text(encoding="utf-8").lower()
config = (root / "js/supabase-config.js").read_text(encoding="utf-8").lower()
html = (root / "index.html").read_text(encoding="utf-8").lower()

required_tables = [
    "buildings", "profiles", "apartments", "income_records",
    "expenses", "building_notices", "app_settings", "audit_logs",
]
for table in required_tables:
    marker = f"alter table public.{table} enable row level security"
    if marker not in migration:
        raise SystemExit(f"RLS is not enabled on public.{table}")

required_policy_fragments = [
    "current_apartment_id()",
    "current_manzil_role()) = 'admin'",
    "role in ('admin', 'owner')",
    "public.replace_building_state",
    "raise exception 'admin role required'",
    "item - 'ownerpin' - 'pincode'",
    "grant execute on function public.replace_building_state(jsonb) to authenticated",
]
for fragment in required_policy_fragments:
    if fragment not in migration:
        raise SystemExit(f"Missing SQL security rule: {fragment}")

if re.search(r"service[_-]?role\s*[:=]", config) or "sb_secret_" in config:
    raise SystemExit("A Supabase secret/service key must never be in browser config")
if "signinwithpassword" not in client:
    raise SystemExit("Supabase Auth password sign-in is missing")
if "auth.uid()" not in migration:
    raise SystemExit("RLS role helper must be tied to the authenticated user")
if "supabase-config.js" not in html or "supabase.js" not in html:
    raise SystemExit("Supabase browser configuration/client is not loaded by index.html")
if re.search(r"settingsgh(token|gistid)", html):
    raise SystemExit("Legacy GitHub token settings should not be exposed in the app")
edge = (root / "supabase/functions/provision-owner/index.ts").read_text(encoding="utf-8")
if "caller.role !== 'admin'" not in edge or "phone_confirm: true" not in edge:
    raise SystemExit("Owner provisioning must verify an admin and confirm the provisioned phone account")
if "service_role" in edge and "Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')" not in edge:
    raise SystemExit("Supabase service role must only be read from the Edge Function environment")

print("Supabase RLS, role checks, public-key boundary, and client wiring passed.")
