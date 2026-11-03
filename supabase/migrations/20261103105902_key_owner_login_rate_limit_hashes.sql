-- Replace reversible plain SHA-256 phone identifiers with keyed HMAC-SHA-256.
-- The Edge Functions use the Supabase service-role secret as the HMAC key.
-- Existing counters cannot be translated without the secret, so remove legacy hashes.
DELETE FROM private.owner_login_attempts;
