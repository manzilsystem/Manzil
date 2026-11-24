-- The assistant reuses one request_id across retries of a confirmed action.
-- The existing unique key and atomic RPC make the retry a no-op instead of a duplicate write.
COMMENT ON TABLE public.building_mutations IS
    'Idempotency ledger for atomic building snapshots; retries reuse request_id and return the original version.';

COMMENT ON CONSTRAINT building_mutations_request_unique ON public.building_mutations IS
    'At most one atomic snapshot may be applied per building_id and request_id.';
