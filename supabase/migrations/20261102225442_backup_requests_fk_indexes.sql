create index if not exists backup_requests_building_created_idx
  on public.backup_requests(building_id, created_at desc);
create index if not exists backup_requests_requested_by_idx
  on public.backup_requests(requested_by);
