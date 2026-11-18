-- =============================================================================
-- PrintFlow — Row Level Security
-- -----------------------------------------------------------------------------
-- Model (single business, multi-user ready):
--   viewer  : read everything operational
--   staff   : + create/update operational data
--   admin   : + delete, settings, integrations, user management
--   owner   : + grant owner role
-- Inactive / unapproved accounts see nothing.
-- integration_credentials has RLS enabled and NO policies: service role only.
-- =============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'business_settings', 'customers', 'customer_identities', 'customer_addresses',
    'printers', 'filament_stock', 'products', 'product_listings', 'orders', 'order_items',
    'production_jobs', 'print_queue', 'print_runs', 'filament_usage', 'shipments',
    'integrations', 'integration_credentials', 'sync_logs', 'internal_notes', 'activity_log'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- Standard operational tables: read = member, write = staff+, delete = admin+
do $$
declare
  t text;
begin
  foreach t in array array[
    'customers', 'customer_identities', 'customer_addresses', 'printers', 'filament_stock',
    'products', 'product_listings', 'orders', 'order_items', 'production_jobs', 'print_queue',
    'print_runs', 'shipments'
  ]
  loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_team_member())', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_write())', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_write()) with check (public.can_write())', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_admin())', t || '_delete', t);
  end loop;
end;
$$;

-- Staff may remove queue entries and order lines while organising work.
create policy print_queue_delete_staff on public.print_queue for delete to authenticated using (public.can_write());

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_team_member());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());

-- business_settings
create policy business_settings_select on public.business_settings for select to authenticated using (public.is_team_member());
create policy business_settings_update on public.business_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- filament_usage: append-only ledger
create policy filament_usage_select on public.filament_usage for select to authenticated using (public.is_team_member());
create policy filament_usage_insert on public.filament_usage for insert to authenticated with check (public.can_write());

-- integrations: readable by members (no secrets in this table), editable by admins
create policy integrations_select on public.integrations for select to authenticated using (public.is_team_member());
create policy integrations_update on public.integrations for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- sync_logs: read-only for members; written by the server (service role)
create policy sync_logs_select on public.sync_logs for select to authenticated using (public.is_team_member());

-- internal notes: authors can edit/delete their own; admins any
create policy internal_notes_select on public.internal_notes for select to authenticated using (public.is_team_member());
create policy internal_notes_insert on public.internal_notes for insert to authenticated
  with check (public.can_write() and author_id = (select auth.uid()));
create policy internal_notes_update on public.internal_notes for update to authenticated
  using (author_id = (select auth.uid()) or public.is_admin())
  with check (author_id = (select auth.uid()) or public.is_admin());
create policy internal_notes_delete on public.internal_notes for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_admin());

-- activity_log: append-only audit trail
create policy activity_log_select on public.activity_log for select to authenticated using (public.is_team_member());
create policy activity_log_insert on public.activity_log for insert to authenticated
  with check (public.can_write() and (actor_id is null or actor_id = (select auth.uid())));

-- -----------------------------------------------------------------------------
-- Function privileges
-- -----------------------------------------------------------------------------
revoke execute on function public.ingest_marketplace_order(public.order_source, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.ingest_marketplace_order(public.order_source, jsonb, jsonb, text) to service_role;

revoke execute on function public.acquire_sync_lock(public.integration_provider, integer) from public, anon, authenticated;
grant execute on function public.acquire_sync_lock(public.integration_provider, integer) to service_role;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

grant execute on function public.setup_required() to anon, authenticated;

