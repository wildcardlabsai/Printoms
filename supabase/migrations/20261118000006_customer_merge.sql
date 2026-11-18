-- =============================================================================
-- PrintFlow — explicit customer merge
-- Customers are never merged automatically (same name ≠ same person). Staff
-- can merge two records deliberately after checking them; this is atomic.
-- =============================================================================
create or replace function public.merge_customers(p_target uuid, p_source uuid)
returns void
language plpgsql
as $$
declare
  v_target_name text;
  v_source_name text;
begin
  perform public.assert_can_write();
  if p_target = p_source then raise exception 'Choose two different customers'; end if;
  select display_name into v_target_name from public.customers where id = p_target for update;
  select display_name into v_source_name from public.customers where id = p_source for update;
  if v_target_name is null or v_source_name is null then raise exception 'Customer not found'; end if;

  update public.orders set customer_id = p_target where customer_id = p_source;
  update public.customer_identities set customer_id = p_target where customer_id = p_source;
  -- Move addresses that the target doesn't already have.
  update public.customer_addresses a set customer_id = p_target
  where a.customer_id = p_source
    and not exists (select 1 from public.customer_addresses b where b.customer_id = p_target and b.fingerprint = a.fingerprint);
  update public.internal_notes set entity_id = p_target where entity_type = 'customer' and entity_id = p_source;
  update public.customers t set
    email = coalesce(t.email, s.email),
    phone = coalesce(t.phone, s.phone),
    notes = nullif(concat_ws(E'\n', t.notes, s.notes), '')
  from public.customers s
  where t.id = p_target and s.id = p_source;
  delete from public.customers where id = p_source;

  perform public.log_activity('customer', p_target, null, 'customer.merged',
    'Merged customer record “' || v_source_name || '” into “' || v_target_name || '”');
end;
$$;
