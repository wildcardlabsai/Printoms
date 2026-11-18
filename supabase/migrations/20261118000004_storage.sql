-- =============================================================================
-- PrintFlow — Storage buckets (private; accessed via signed URLs)
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images', 'product-images', false, 5242880,
   array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('model-files', 'model-files', false, 104857600, null)
on conflict (id) do nothing;

create policy "printflow_read_files" on storage.objects for select to authenticated
  using (bucket_id in ('product-images', 'model-files') and public.is_team_member());

create policy "printflow_insert_files" on storage.objects for insert to authenticated
  with check (bucket_id in ('product-images', 'model-files') and public.can_write());

create policy "printflow_update_files" on storage.objects for update to authenticated
  using (bucket_id in ('product-images', 'model-files') and public.can_write());

create policy "printflow_delete_files" on storage.objects for delete to authenticated
  using (bucket_id in ('product-images', 'model-files') and public.can_write());
