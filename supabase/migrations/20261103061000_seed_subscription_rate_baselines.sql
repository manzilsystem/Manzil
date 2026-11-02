INSERT INTO public.resident_subscription_rates
    (building_id, resident_id, effective_month, monthly_amount, created_by)
SELECT r.building_id, r.id, date_trunc('month', r.created_at)::date,
       COALESCE(r.monthly_amount, 0), bm.user_id
FROM public.residents r
JOIN public.building_members bm
  ON bm.building_id = r.building_id AND bm.role = 'manager'
WHERE NOT EXISTS (
    SELECT 1 FROM public.resident_subscription_rates rate
    WHERE rate.resident_id = r.id
)
ON CONFLICT (resident_id, effective_month) DO NOTHING;
