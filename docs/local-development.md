# Local development and test data

## Scope

The Supabase seed is **local-only**. It creates fictional users, four apartments, sample subscriptions, collections, expenses, notices, notifications, and movements across the three cashboxes. It never imports data from hosted Manzil.

Disposable local credentials:

| Role | Login | Password / PIN |
|---|---|---|
| Manager | `manager@manzil.invalid` | `Manzil-Local-Only-2026!` |
| Owner 101 | `+201555001101` | `123456` |
| Owner 102 | `+201555001102` | `654321` |

These credentials and `.invalid` addresses are test-only. Never reuse them in a hosted environment.

## Run the local database

Requirements: Docker-compatible runtime, Supabase CLI, and Node.js 22+.

From the repository root:

```sh
supabase start
supabase db reset --local
node --test tests/local-seed.test.cjs
```

`supabase db reset --local` rebuilds the local database from tracked migrations, then loads `supabase/seed.sql`. The seed fails if fixture counts or cashbox/monthly-close calculations drift.

Run the integration verification against the local database:

```sh
DB_URL="$(supabase status -o env | sed -n 's/^DB_URL=//p' | tr -d '"')"
psql "$DB_URL" -v ON_ERROR_STOP=1 -f tests/local-seed.verify.sql
```

Expected 2026-11 closing balances:

| Account | Closing balance |
|---|---:|
| Main | 1,120 EGP |
| Development | 150 EGP |
| Emergency | 175 EGP |
| **Total** | **1,445 EGP** |

The SQL integration check also verifies owner RLS: each owner sees only their own apartment, payments, and notifications, and cannot read internal notes or subscription-rate history.

Stop the stack with `supabase stop`. Use `supabase stop --no-backup` only when intending to discard local Docker volumes.

## Production safety

- Never run `supabase db reset --linked`, `supabase db reset --remote`, or a reset with a hosted `--db-url`.
- Do not run `supabase link` as part of this local seed workflow.
- Never copy production users, phone numbers, access tokens, or financial records into seed files.
- Keep hosted backup and restore workflows separate from local fixtures.

**Frontend limitation:** `js/supabase.js` currently contains the hosted project URL. Until a separate local-frontend configuration change is merged, do not use the browser app with these local credentials; this setup validates the local database through CLI and SQL only.
