-- Cover foreign-key lookup paths used by cashbox and subscription-rate history.
-- These indexes are additive and preserve all existing rows and constraints.

CREATE INDEX IF NOT EXISTS cash_transfers_audit_log_id_idx
    ON public.cash_transfers (audit_log_id);

CREATE INDEX IF NOT EXISTS cash_transfers_created_by_idx
    ON public.cash_transfers (created_by);

CREATE INDEX IF NOT EXISTS resident_subscription_rate_changes_changed_by_idx
    ON public.resident_subscription_rate_changes (changed_by);

CREATE INDEX IF NOT EXISTS resident_subscription_rate_changes_resident_id_idx
    ON public.resident_subscription_rate_changes (resident_id);
