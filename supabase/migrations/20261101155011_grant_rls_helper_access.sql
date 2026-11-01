-- Authenticated users must be able to invoke RLS helpers from policies.
-- Keep the helper schema private from anon and public API roles.
grant usage on schema private to authenticated;
grant execute on function private.is_building_member(uuid) to authenticated;
grant execute on function private.is_building_manager(uuid) to authenticated;
grant execute on function private.owns_resident(uuid) to authenticated;
