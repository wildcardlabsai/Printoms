-- =============================================================================
-- PrintFlow — business logic functions & triggers
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Auth helpers
-- -----------------------------------------------------------------------------

-- Role rank: owner 4 > admin 3 > staff 2 > viewer 1. Inactive / unknown = 0.
create or replace function public.current_role_rank()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case p.role
      when 'owner' then 4
      when 'admin' then 3
      when 'staff' then 2
      when 'viewer' then 1
    end
    from public.profiles p
    where p.id = (select auth.uid()) and p.is_active
  ), 0);
$$;

create or replace function public.is_team_member()
returns boolean language sql stable security definer set search_path = ''
as $$ select public.current_role_rank() >= 1; $$;

create or replace function public.can_write()
returns boolean language sql stable security definer set search_path = ''
as $$ select public.current_role_rank() >= 2; $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select public.current_role_rank() >= 3; $$;

create or replace function public.assert_can_write()
returns void language plpgsql stable as $$
begin
  if coalesce((select auth.role()), '') <> 'service_role' and not public.can_write() then
    raise exception 'You do not have permission to perform this action' using errcode = '42501';
  end if;
end;
$$;

-- True until the first owner account exists. Exposed to anon so the login
-- screen can offer "create owner account" on a brand-new installation only.
create or replace function public.setup_required()
returns boolean language sql stable security definer set search_path = ''
as $$ select not exists (select 1 from public.profiles where role = 'owner'); $$;

-- Create a profile for every new auth user. The very first user becomes the
-- active owner; everyone after that is inactive until approved.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first boolean;
begin
  perform pg_advisory_xact_lock(hashtext('printflow_profile_bootstrap'));
  v_first := not exists (select 1 from public.profiles where role = 'owner');
  insert into public.profiles (id, email, full_name, role, is_active)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    case when v_first then 'owner'::public.user_role else 'staff'::public.user_role end,
    v_first
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Prevent privilege escalation: only admins may change role / activation,
-- and nobody may demote the last active owner.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.role is distinct from old.role or new.is_active is distinct from old.is_active) then
    if coalesce((select auth.role()), '') <> 'service_role' and not public.is_admin() then
      raise exception 'Only owners and admins can change roles or account access';
    end if;
    if new.role = 'owner' and old.role <> 'owner'
       and coalesce((select auth.role()), '') <> 'service_role'
       and public.current_role_rank() < 4 then
      raise exception 'Only an owner can grant the owner role';
    end if;
    if old.role = 'owner' and old.is_active and (new.role <> 'owner' or not new.is_active)
       and not exists (
         select 1 from public.profiles
         where role = 'owner' and is_active and id <> old.id
       ) then
      raise exception 'Cannot remove the last active owner';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- -----------------------------------------------------------------------------
-- Activity log helper (security invoker; RLS applies)
-- -----------------------------------------------------------------------------
create or replace function public.log_activity(
  p_entity_type text,
  p_entity_id uuid,
  p_order_id uuid,
  p_action text,
  p_message text,
  p_metadata jsonb default '{}'::jsonb,
  p_actor_label text default null
)
returns void
language sql
as $$
  insert into public.activity_log (entity_type, entity_id, order_id, action, message, metadata, actor_id, actor_label)
  values (p_entity_type, p_entity_id, p_order_id, p_action, p_message, coalesce(p_metadata, '{}'::jsonb),
          (select auth.uid()), p_actor_label);
$$;

create or replace function public.stage_label(p public.production_stage)
returns text language sql immutable
as $$
  select case p
    when 'new_order' then 'New Order'
    when 'awaiting_preparation' then 'Awaiting Preparation'
    when 'ready_to_print' then 'Ready to Print'
    when 'printing' then 'Printing'
    when 'quality_check' then 'Quality Check'
    when 'ready_to_pack' then 'Ready to Pack'
    when 'dispatched' then 'Dispatched'
    when 'completed' then 'Completed'
    when 'on_hold' then 'On Hold'
  end;
$$;

-- -----------------------------------------------------------------------------
-- Order status derivation from production jobs
-- -----------------------------------------------------------------------------
create or replace function public.refresh_order_status(p_order_id uuid)
returns void
language plpgsql
as $$
declare
  v_status public.order_status;
  v_total integer;
  v_ready integer;
  v_progress integer;
  v_new public.order_status;
begin
  select status into v_status from public.orders where id = p_order_id;
  if v_status is null or v_status in ('cancelled', 'dispatched', 'completed', 'on_hold') then
    return;
  end if;

  select
    count(*),
    count(*) filter (where stage in ('ready_to_pack', 'dispatched', 'completed')),
    count(*) filter (where stage in ('awaiting_preparation', 'ready_to_print', 'printing', 'quality_check'))
  into v_total, v_ready, v_progress
  from public.production_jobs
  where order_id = p_order_id;

  if v_total = 0 then
    return;
  end if;

  if v_ready = v_total then
    v_new := case when v_status = 'packed' then 'packed'::public.order_status else 'ready_to_pack'::public.order_status end;
  elsif v_progress > 0 or v_ready > 0 then
    v_new := 'in_production';
  else
    v_new := 'new';
  end if;

  if v_new is distinct from v_status then
    update public.orders set status = v_new where id = p_order_id;
  end if;
end;
$$;

create or replace function public.production_jobs_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.stage is distinct from old.stage then
    new.stage_changed_at := now();
    if new.stage = 'on_hold' and old.stage <> 'on_hold' then
      new.stage_before_hold := old.stage;
    end if;
    if new.stage = 'printing' and new.started_at is null then
      new.started_at := now();
    end if;
    if new.stage in ('ready_to_pack', 'dispatched', 'completed') and new.completed_at is null then
      new.completed_at := now();
    elsif new.stage not in ('ready_to_pack', 'dispatched', 'completed') then
      new.completed_at := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger production_jobs_before_write
  before update on public.production_jobs
  for each row execute function public.production_jobs_before_write();

create or replace function public.production_jobs_after_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_order_status(old.order_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and new.stage is distinct from old.stage then
    perform public.log_activity(
      'production_job', new.id, new.order_id, 'job.stage_changed',
      new.job_number || ': ' || public.stage_label(old.stage) || ' → ' || public.stage_label(new.stage),
      jsonb_build_object('from', old.stage, 'to', new.stage)
    );
  end if;

  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    perform public.refresh_order_status(new.order_id);
  end if;
  return new;
end;
$$;

create trigger production_jobs_after_write
  after insert or update or delete on public.production_jobs
  for each row execute function public.production_jobs_after_write();

-- -----------------------------------------------------------------------------
-- Filament ledger → stock deduction (only from explicitly recorded usage)
-- -----------------------------------------------------------------------------
create or replace function public.filament_usage_before_insert()
returns trigger
language plpgsql
as $$
declare
  v_price numeric;
  v_weight integer;
begin
  if new.cost is null then
    select purchase_price, spool_weight_g into v_price, v_weight
    from public.filament_stock where id = new.filament_stock_id;
    if v_price is not null and v_weight > 0 then
      new.cost := round((new.grams * v_price / v_weight)::numeric, 2);
    end if;
  end if;
  new.recorded_by := coalesce(new.recorded_by, (select auth.uid()));
  return new;
end;
$$;

create trigger filament_usage_before_insert
  before insert on public.filament_usage
  for each row execute function public.filament_usage_before_insert();

create or replace function public.filament_usage_after_insert()
returns trigger
language plpgsql
as $$
begin
  update public.filament_stock
  set remaining_g = greatest(0, remaining_g - new.grams)
  where id = new.filament_stock_id;

  if new.print_run_id is not null then
    update public.print_runs set filament_recorded = true where id = new.print_run_id;
  end if;
  return new;
end;
$$;

create trigger filament_usage_after_insert
  after insert on public.filament_usage
  for each row execute function public.filament_usage_after_insert();

-- -----------------------------------------------------------------------------
-- Marketplace order ingestion (used by the sync engine, service role only)
-- -----------------------------------------------------------------------------
-- Idempotent upsert keyed on (source, external_order_id).
--   * Only marketplace-owned columns are overwritten on update.
--   * Internal production data (status, priority, notes, jobs) is preserved.
--   * Customers are matched by marketplace customer id, then exact email.
--     Never by name.
-- Returns {order_id, result: created|updated|unchanged}.
create or replace function public.ingest_marketplace_order(
  p_source public.order_source,
  p_order jsonb,
  p_items jsonb,
  p_actor_label text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_ext_id text := p_order ->> 'external_order_id';
  v_existing record;
  v_customer_id uuid;
  v_ext_customer text := nullif(p_order #>> '{customer,external_id}', '');
  v_email text := nullif(lower(trim(coalesce(p_order ->> 'customer_email', ''))), '');
  v_name text := coalesce(nullif(trim(p_order ->> 'customer_name'), ''), 'Unknown customer');
  v_addr jsonb := coalesce(p_order -> 'shipping_address', '{}'::jsonb);
  v_mp_updated timestamptz := nullif(p_order ->> 'marketplace_updated_at', '')::timestamptz;
  v_cancelled timestamptz := nullif(p_order ->> 'marketplace_cancelled_at', '')::timestamptz;
  v_fulfilled boolean := coalesce((p_order ->> 'is_fulfilled')::boolean, false);
  v_order_id uuid;
  v_inserted boolean;
  v_item jsonb;
  v_product_id uuid;
  v_status public.order_status;
  v_listing_source public.integration_provider;
begin
  if p_source = 'manual' then
    raise exception 'ingest_marketplace_order is for marketplace orders only';
  end if;
  if v_ext_id is null or v_ext_id = '' then
    raise exception 'external_order_id is required';
  end if;
  v_listing_source := p_source::text::public.integration_provider;

  select id, marketplace_updated_at, status, customer_id
  into v_existing
  from public.orders
  where source = p_source and external_order_id = v_ext_id;

  -- Skip untouched orders cheaply.
  if v_existing.id is not null and v_mp_updated is not null
     and v_existing.marketplace_updated_at is not null
     and v_mp_updated <= v_existing.marketplace_updated_at then
    update public.orders set last_synced_at = now() where id = v_existing.id;
    return jsonb_build_object('order_id', v_existing.id, 'result', 'unchanged');
  end if;

  -- ---- Customer resolution -------------------------------------------------
  v_customer_id := v_existing.customer_id;
  if v_customer_id is null and v_ext_customer is not null then
    select customer_id into v_customer_id
    from public.customer_identities
    where source = p_source and external_customer_id = v_ext_customer;
  end if;
  if v_customer_id is null and v_email is not null then
    select id into v_customer_id
    from public.customers
    where lower(email) = v_email
    order by created_at
    limit 1;
  end if;
  if v_customer_id is null then
    insert into public.customers (display_name, email, first_source)
    values (v_name, v_email, p_source)
    returning id into v_customer_id;
  elsif v_email is not null then
    update public.customers set email = coalesce(email, v_email) where id = v_customer_id;
  end if;
  if v_ext_customer is not null then
    insert into public.customer_identities (customer_id, source, external_customer_id)
    values (v_customer_id, p_source, v_ext_customer)
    on conflict (source, external_customer_id) do nothing;
  end if;
  if coalesce(v_addr ->> 'line1', '') <> '' then
    insert into public.customer_addresses (customer_id, name, line1, line2, city, region, postal_code, country_code, phone)
    values (v_customer_id, v_addr ->> 'name', v_addr ->> 'line1', v_addr ->> 'line2', v_addr ->> 'city',
            v_addr ->> 'region', v_addr ->> 'postal_code', v_addr ->> 'country_code', v_addr ->> 'phone')
    on conflict (customer_id, fingerprint) do update set last_used_at = now();
  end if;

  -- ---- Order upsert ---------------------------------------------------------
  v_status := case
    when v_cancelled is not null then 'cancelled'::public.order_status
    when v_fulfilled then 'completed'::public.order_status
    else 'new'::public.order_status
  end;

  insert into public.orders (
    source, external_order_id, external_order_number, customer_id, customer_name, customer_email,
    shipping_address, order_date, payment_status, marketplace_status, marketplace_fulfilment_status,
    currency, subtotal, shipping_total, tax_total, discount_total, total, customer_note,
    shipping_method, marketplace_dispatch_by, marketplace_updated_at, marketplace_cancelled_at,
    last_synced_at, status, dispatch_by, completed_at
  ) values (
    p_source, v_ext_id, p_order ->> 'external_order_number', v_customer_id, v_name, v_email,
    v_addr, coalesce(nullif(p_order ->> 'order_date', '')::timestamptz, now()),
    coalesce(nullif(p_order ->> 'payment_status', ''), 'unknown')::public.payment_status,
    p_order ->> 'marketplace_status', p_order ->> 'marketplace_fulfilment_status',
    coalesce(nullif(p_order ->> 'currency', ''), 'GBP'),
    coalesce((p_order ->> 'subtotal')::numeric, 0), coalesce((p_order ->> 'shipping_total')::numeric, 0),
    coalesce((p_order ->> 'tax_total')::numeric, 0), coalesce((p_order ->> 'discount_total')::numeric, 0),
    coalesce((p_order ->> 'total')::numeric, 0), nullif(p_order ->> 'customer_note', ''),
    nullif(p_order ->> 'shipping_method', ''), nullif(p_order ->> 'marketplace_dispatch_by', '')::timestamptz,
    v_mp_updated, v_cancelled, now(), v_status,
    coalesce(nullif(p_order ->> 'marketplace_dispatch_by', '')::timestamptz, nullif(p_order ->> 'default_dispatch_by', '')::timestamptz),
    case when v_status = 'completed' then now() end
  )
  on conflict (source, external_order_id) do update set
    external_order_number = excluded.external_order_number,
    customer_id = coalesce(public.orders.customer_id, excluded.customer_id),
    customer_name = excluded.customer_name,
    customer_email = coalesce(excluded.customer_email, public.orders.customer_email),
    shipping_address = excluded.shipping_address,
    order_date = excluded.order_date,
    payment_status = excluded.payment_status,
    marketplace_status = excluded.marketplace_status,
    marketplace_fulfilment_status = excluded.marketplace_fulfilment_status,
    currency = excluded.currency,
    subtotal = excluded.subtotal,
    shipping_total = excluded.shipping_total,
    tax_total = excluded.tax_total,
    discount_total = excluded.discount_total,
    total = excluded.total,
    customer_note = excluded.customer_note,
    shipping_method = excluded.shipping_method,
    marketplace_dispatch_by = excluded.marketplace_dispatch_by,
    marketplace_updated_at = excluded.marketplace_updated_at,
    marketplace_cancelled_at = excluded.marketplace_cancelled_at,
    last_synced_at = now(),
    -- Internal working deadline is only filled if it was never set.
    dispatch_by = coalesce(public.orders.dispatch_by, excluded.dispatch_by)
  returning id, (xmax = 0) into v_order_id, v_inserted;

  -- ---- Line items -----------------------------------------------------------
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_product_id := null;
    if nullif(v_item ->> 'external_listing_id', '') is not null then
      select pl.product_id into v_product_id
      from public.product_listings pl
      where pl.source = v_listing_source
        and pl.external_listing_id = v_item ->> 'external_listing_id'
        and (pl.external_variant_id is null or pl.external_variant_id = v_item ->> 'external_variant_id')
      order by (pl.external_variant_id is not null) desc
      limit 1;
    end if;
    if v_product_id is null and nullif(v_item ->> 'sku', '') is not null then
      select id into v_product_id from public.products where lower(sku) = lower(v_item ->> 'sku') limit 1;
    end if;

    insert into public.order_items (
      order_id, product_id, external_line_item_id, external_listing_id, external_variant_id, sku,
      title, variant_title, variant_details, quantity, unit_price, total_price, personalisation
    ) values (
      v_order_id, v_product_id, v_item ->> 'external_line_item_id', v_item ->> 'external_listing_id',
      v_item ->> 'external_variant_id', nullif(v_item ->> 'sku', ''),
      coalesce(nullif(v_item ->> 'title', ''), 'Untitled item'), nullif(v_item ->> 'variant_title', ''),
      coalesce(v_item -> 'variant_details', '[]'::jsonb),
      greatest(1, coalesce((v_item ->> 'quantity')::integer, 1)),
      coalesce((v_item ->> 'unit_price')::numeric, 0), coalesce((v_item ->> 'total_price')::numeric, 0),
      nullif(v_item ->> 'personalisation', '')
    )
    on conflict (order_id, external_line_item_id) do update set
      external_listing_id = excluded.external_listing_id,
      external_variant_id = excluded.external_variant_id,
      sku = excluded.sku,
      title = excluded.title,
      variant_title = excluded.variant_title,
      variant_details = excluded.variant_details,
      quantity = excluded.quantity,
      unit_price = excluded.unit_price,
      total_price = excluded.total_price,
      personalisation = excluded.personalisation,
      -- Keep a manual product mapping if staff already set one.
      product_id = coalesce(public.order_items.product_id, excluded.product_id);
  end loop;

  -- Keep quantities of not-yet-started jobs aligned with marketplace edits.
  update public.production_jobs j
  set quantity = oi.quantity
  from public.order_items oi
  where j.order_item_id = oi.id and oi.order_id = v_order_id
    and j.quantity <> oi.quantity
    and j.stage in ('new_order', 'awaiting_preparation', 'ready_to_print');

  -- ---- Production jobs for new lines ------------------------------------------
  if v_cancelled is null then
    insert into public.production_jobs (
      order_id, order_item_id, product_id, stage, priority, quantity, printer_id,
      estimated_print_minutes, material, colour, estimated_filament_g, print_requirements, due_date
    )
    select
      v_order_id, oi.id, oi.product_id,
      case when v_inserted and v_fulfilled then 'completed'::public.production_stage else 'new_order'::public.production_stage end,
      o.priority, oi.quantity, p.default_printer_id,
      p.estimated_print_minutes * oi.quantity, p.material, p.default_colour,
      p.estimated_filament_g * oi.quantity, p.production_instructions, o.dispatch_by
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join public.products p on p.id = oi.product_id
    left join public.production_jobs j on j.order_item_id = oi.id
    where oi.order_id = v_order_id and j.id is null;
  end if;

  -- ---- Marketplace-driven status transitions (existing orders) --------------
  if not v_inserted then
    if v_cancelled is not null and v_existing.status not in ('cancelled', 'dispatched', 'completed') then
      update public.orders set status = 'cancelled' where id = v_order_id;
      perform public.log_activity('order', v_order_id, v_order_id, 'order.cancelled_on_marketplace',
        'Order was cancelled on ' || initcap(p_source::text), '{}'::jsonb, p_actor_label);
    elsif v_fulfilled and v_existing.status not in ('cancelled', 'dispatched', 'completed') then
      update public.orders set status = 'dispatched', dispatched_at = coalesce(dispatched_at, now())
      where id = v_order_id;
      update public.production_jobs set stage = 'dispatched'
      where order_id = v_order_id and stage not in ('dispatched', 'completed');
      perform public.log_activity('order', v_order_id, v_order_id, 'order.fulfilled_on_marketplace',
        'Order was marked as shipped on ' || initcap(p_source::text) || ' outside PrintFlow', '{}'::jsonb, p_actor_label);
    end if;
    perform public.log_activity('order', v_order_id, v_order_id, 'order.synced',
      'Marketplace data updated from ' || initcap(p_source::text), '{}'::jsonb, p_actor_label);
  else
    perform public.log_activity('order', v_order_id, v_order_id, 'order.imported',
      'Order imported from ' || initcap(p_source::text), jsonb_build_object('external_order_id', v_ext_id), p_actor_label);
  end if;

  return jsonb_build_object('order_id', v_order_id, 'result', case when v_inserted then 'created' else 'updated' end);
end;
$$;

-- -----------------------------------------------------------------------------
-- Manual order creation (security invoker → RLS applies to the caller)
-- -----------------------------------------------------------------------------
create or replace function public.create_manual_order(p_order jsonb, p_items jsonb)
returns uuid
language plpgsql
as $$
declare
  v_order_id uuid;
  v_customer_id uuid := nullif(p_order ->> 'customer_id', '')::uuid;
  v_email text := nullif(lower(trim(coalesce(p_order ->> 'customer_email', ''))), '');
  v_name text := trim(p_order ->> 'customer_name');
  v_addr jsonb := coalesce(p_order -> 'shipping_address', '{}'::jsonb);
  v_item jsonb;
  v_subtotal numeric := 0;
  v_is_sample boolean := coalesce((p_order ->> 'is_sample')::boolean, false);
begin
  perform public.assert_can_write();
  if coalesce(v_name, '') = '' then
    raise exception 'Customer name is required';
  end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'At least one item is required';
  end if;

  if v_customer_id is null and v_email is not null then
    select id into v_customer_id from public.customers where lower(email) = v_email order by created_at limit 1;
  end if;
  if v_customer_id is null then
    insert into public.customers (display_name, email, phone, first_source, is_sample)
    values (v_name, v_email, nullif(p_order ->> 'customer_phone', ''), 'manual', v_is_sample)
    returning id into v_customer_id;
  end if;
  if coalesce(v_addr ->> 'line1', '') <> '' then
    insert into public.customer_addresses (customer_id, name, line1, line2, city, region, postal_code, country_code, phone)
    values (v_customer_id, v_addr ->> 'name', v_addr ->> 'line1', v_addr ->> 'line2', v_addr ->> 'city',
            v_addr ->> 'region', v_addr ->> 'postal_code', v_addr ->> 'country_code', v_addr ->> 'phone')
    on conflict (customer_id, fingerprint) do update set last_used_at = now();
  end if;

  select coalesce(sum((i ->> 'quantity')::integer * (i ->> 'unit_price')::numeric), 0)
  into v_subtotal
  from jsonb_array_elements(p_items) i;

  insert into public.orders (
    source, external_order_number, customer_id, customer_name, customer_email, shipping_address,
    order_date, payment_status, currency, subtotal, shipping_total, tax_total, discount_total, total,
    customer_note, shipping_method, dispatch_by, priority, production_notes, is_sample, created_by
  ) values (
    'manual', nullif(p_order ->> 'external_order_number', ''), v_customer_id, v_name, v_email, v_addr,
    coalesce(nullif(p_order ->> 'order_date', '')::timestamptz, now()),
    coalesce(nullif(p_order ->> 'payment_status', ''), 'pending')::public.payment_status,
    coalesce(nullif(p_order ->> 'currency', ''), (select currency from public.business_settings limit 1), 'GBP'),
    v_subtotal, coalesce((p_order ->> 'shipping_total')::numeric, 0), 0,
    coalesce((p_order ->> 'discount_total')::numeric, 0),
    greatest(0, v_subtotal + coalesce((p_order ->> 'shipping_total')::numeric, 0) - coalesce((p_order ->> 'discount_total')::numeric, 0)),
    nullif(p_order ->> 'customer_note', ''), nullif(p_order ->> 'shipping_method', ''),
    nullif(p_order ->> 'dispatch_by', '')::timestamptz,
    coalesce(nullif(p_order ->> 'priority', ''), 'normal')::public.priority_level,
    nullif(p_order ->> 'production_notes', ''), v_is_sample, (select auth.uid())
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.order_items (
      order_id, product_id, sku, title, variant_title, quantity, unit_price, total_price, personalisation
    )
    select
      v_order_id, p.id, coalesce(nullif(v_item ->> 'sku', ''), p.sku),
      coalesce(nullif(v_item ->> 'title', ''), p.name, 'Custom item'),
      nullif(v_item ->> 'variant_title', ''),
      (v_item ->> 'quantity')::integer, (v_item ->> 'unit_price')::numeric,
      (v_item ->> 'quantity')::integer * (v_item ->> 'unit_price')::numeric,
      nullif(v_item ->> 'personalisation', '')
    from (select 1) dummy
    left join public.products p on p.id = nullif(v_item ->> 'product_id', '')::uuid;
  end loop;

  insert into public.production_jobs (
    order_id, order_item_id, product_id, priority, quantity, printer_id, estimated_print_minutes,
    material, colour, estimated_filament_g, print_requirements, due_date, is_sample
  )
  select v_order_id, oi.id, oi.product_id, o.priority, oi.quantity, p.default_printer_id,
         p.estimated_print_minutes * oi.quantity, p.material, p.default_colour,
         p.estimated_filament_g * oi.quantity, p.production_instructions, o.dispatch_by, v_is_sample
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  left join public.products p on p.id = oi.product_id
  where oi.order_id = v_order_id;

  perform public.log_activity('order', v_order_id, v_order_id, 'order.created', 'Manual order created');
  return v_order_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Order hold / release
-- -----------------------------------------------------------------------------
create or replace function public.set_order_hold(p_order_id uuid, p_hold boolean, p_reason text default null)
returns void
language plpgsql
as $$
declare
  v_status public.order_status;
begin
  perform public.assert_can_write();
  select status into v_status from public.orders where id = p_order_id for update;
  if v_status is null then raise exception 'Order not found'; end if;

  if p_hold then
    if v_status in ('dispatched', 'completed', 'cancelled') then
      raise exception 'Order can no longer be put on hold';
    end if;
    update public.production_jobs set stage = 'on_hold'
    where order_id = p_order_id and stage not in ('on_hold', 'dispatched', 'completed');
    update public.orders set status = 'on_hold' where id = p_order_id;
    perform public.log_activity('order', p_order_id, p_order_id, 'order.on_hold',
      'Order put on hold' || coalesce(': ' || nullif(trim(p_reason), ''), ''));
  else
    if v_status <> 'on_hold' then return; end if;
    update public.orders set status = 'new' where id = p_order_id;
    update public.production_jobs set stage = coalesce(stage_before_hold, 'new_order'), stage_before_hold = null
    where order_id = p_order_id and stage = 'on_hold';
    perform public.refresh_order_status(p_order_id);
    perform public.log_activity('order', p_order_id, p_order_id, 'order.released', 'Order released from hold');
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Print farm workflow
-- -----------------------------------------------------------------------------
create or replace function public.assign_job_to_printer(p_job_id uuid, p_printer_id uuid)
returns void
language plpgsql
as $$
declare
  v_job record;
  v_printer_name text;
begin
  perform public.assert_can_write();
  select id, order_id, job_number, stage into v_job from public.production_jobs where id = p_job_id for update;
  if v_job.id is null then raise exception 'Production job not found'; end if;

  update public.print_queue set status = 'removed'
  where production_job_id = p_job_id and status = 'queued';

  if p_printer_id is null then
    update public.production_jobs set printer_id = null where id = p_job_id;
    perform public.log_activity('production_job', p_job_id, v_job.order_id, 'job.unassigned',
      v_job.job_number || ' unassigned from printer');
    return;
  end if;

  select name into v_printer_name from public.printers where id = p_printer_id and is_active;
  if v_printer_name is null then raise exception 'Printer not found'; end if;

  update public.production_jobs set printer_id = p_printer_id where id = p_job_id;
  if v_job.stage in ('new_order', 'awaiting_preparation', 'ready_to_print') then
    insert into public.print_queue (printer_id, production_job_id) values (p_printer_id, p_job_id)
    on conflict do nothing;
  end if;
  perform public.log_activity('production_job', p_job_id, v_job.order_id, 'job.assigned',
    v_job.job_number || ' assigned to ' || v_printer_name);
end;
$$;

create or replace function public.start_print_run(p_job_id uuid, p_printer_id uuid, p_quantity integer default null)
returns uuid
language plpgsql
as $$
declare
  v_job record;
  v_printer record;
  v_run_id uuid;
  v_minutes integer;
begin
  perform public.assert_can_write();
  select * into v_job from public.production_jobs where id = p_job_id for update;
  if v_job.id is null then raise exception 'Production job not found'; end if;
  if v_job.stage in ('dispatched', 'completed', 'on_hold') then
    raise exception 'Job is %, it cannot be printed', public.stage_label(v_job.stage);
  end if;

  select * into v_printer from public.printers where id = p_printer_id and is_active for update;
  if v_printer.id is null then raise exception 'Printer not found'; end if;
  if v_printer.status in ('printing', 'paused') and v_printer.current_print_run_id is not null then
    raise exception '% is already running a print', v_printer.name;
  end if;
  if v_printer.status in ('maintenance', 'offline') then
    raise exception '% is %', v_printer.name, v_printer.status;
  end if;

  v_minutes := v_job.estimated_print_minutes;

  insert into public.print_runs (production_job_id, printer_id, attempt_number, quantity, estimated_minutes, started_by)
  values (p_job_id, p_printer_id, v_job.attempt_count + 1, coalesce(p_quantity, v_job.quantity), v_minutes, (select auth.uid()))
  returning id into v_run_id;

  update public.production_jobs
  set stage = 'printing', printer_id = p_printer_id, attempt_count = attempt_count + 1
  where id = p_job_id;

  update public.printers
  set status = 'printing', current_job_id = p_job_id, current_print_run_id = v_run_id,
      estimated_completion_at = case when v_minutes is not null then now() + make_interval(mins => v_minutes) end
  where id = p_printer_id;

  update public.print_queue set status = 'removed'
  where production_job_id = p_job_id and status = 'queued' and printer_id <> p_printer_id;
  update public.print_queue set status = 'active'
  where production_job_id = p_job_id and status = 'queued' and printer_id = p_printer_id;
  if not found then
    insert into public.print_queue (printer_id, production_job_id, status) values (p_printer_id, p_job_id, 'active');
  end if;

  perform public.log_activity('production_job', p_job_id, v_job.order_id, 'print.started',
    v_job.job_number || ' started on ' || v_printer.name || ' (attempt ' || (v_job.attempt_count + 1) || ')',
    jsonb_build_object('print_run_id', v_run_id, 'printer_id', p_printer_id));
  return v_run_id;
end;
$$;

create or replace function public.finish_print_run(
  p_run_id uuid,
  p_succeeded boolean,
  p_failure_reason text default null,
  p_notes text default null,
  p_requeue boolean default true
)
returns void
language plpgsql
as $$
declare
  v_run record;
  v_job record;
  v_printer_name text;
begin
  perform public.assert_can_write();
  select * into v_run from public.print_runs where id = p_run_id for update;
  if v_run.id is null then raise exception 'Print run not found'; end if;
  if v_run.status <> 'printing' then raise exception 'This print run has already finished'; end if;
  if not p_succeeded and coalesce(trim(p_failure_reason), '') = '' then
    raise exception 'A failure reason is required';
  end if;

  select * into v_job from public.production_jobs where id = v_run.production_job_id for update;
  select name into v_printer_name from public.printers where id = v_run.printer_id;

  update public.print_runs
  set status = case when p_succeeded then 'succeeded'::public.print_run_status else 'failed'::public.print_run_status end,
      ended_at = now(),
      failure_reason = case when p_succeeded then null else trim(p_failure_reason) end,
      notes = coalesce(nullif(trim(p_notes), ''), notes),
      ended_by = (select auth.uid())
  where id = p_run_id;

  update public.printers
  set status = 'available', current_job_id = null, current_print_run_id = null, estimated_completion_at = null
  where id = v_run.printer_id and current_print_run_id = p_run_id;

  if p_succeeded then
    update public.production_jobs set stage = 'quality_check' where id = v_job.id;
    update public.print_queue set status = 'done'
    where production_job_id = v_job.id and status = 'active';
    perform public.log_activity('production_job', v_job.id, v_job.order_id, 'print.succeeded',
      v_job.job_number || ' print completed on ' || coalesce(v_printer_name, 'printer'),
      jsonb_build_object('print_run_id', p_run_id));
  else
    -- Reprint the same job: no duplicate order or job is created.
    update public.production_jobs
    set stage = 'ready_to_print', failed_attempts = failed_attempts + 1
    where id = v_job.id;
    if p_requeue and v_run.printer_id is not null then
      update public.print_queue set status = 'queued', position = 0
      where production_job_id = v_job.id and status = 'active';
    else
      update public.print_queue set status = 'removed'
      where production_job_id = v_job.id and status = 'active';
    end if;
    perform public.log_activity('production_job', v_job.id, v_job.order_id, 'print.failed',
      v_job.job_number || ' print failed on ' || coalesce(v_printer_name, 'printer') || ': ' || trim(p_failure_reason),
      jsonb_build_object('print_run_id', p_run_id, 'reason', trim(p_failure_reason)));
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Packing & dispatch
-- -----------------------------------------------------------------------------
create or replace function public.mark_order_packed(p_order_id uuid, p_checklist jsonb, p_packaging_notes text default null)
returns uuid
language plpgsql
as $$
declare
  v_order record;
  v_shipment_id uuid;
begin
  perform public.assert_can_write();
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'Order not found'; end if;
  if v_order.status not in ('ready_to_pack', 'packed') then
    raise exception 'Order is not ready to pack';
  end if;

  select id into v_shipment_id from public.shipments
  where order_id = p_order_id and status in ('pending', 'packed')
  order by created_at desc limit 1;

  if v_shipment_id is null then
    insert into public.shipments (order_id, status, shipping_method, checklist, packaging_notes, packed_at, packed_by)
    values (p_order_id, 'packed', v_order.shipping_method, coalesce(p_checklist, '[]'::jsonb),
            nullif(trim(p_packaging_notes), ''), now(), (select auth.uid()))
    returning id into v_shipment_id;
  else
    update public.shipments
    set status = 'packed', checklist = coalesce(p_checklist, checklist),
        packaging_notes = coalesce(nullif(trim(p_packaging_notes), ''), packaging_notes),
        packed_at = now(), packed_by = (select auth.uid())
    where id = v_shipment_id;
  end if;

  update public.orders set status = 'packed' where id = p_order_id;
  perform public.log_activity('order', p_order_id, p_order_id, 'order.packed', 'Order packed');
  return v_shipment_id;
end;
$$;

create or replace function public.mark_order_dispatched(
  p_order_id uuid,
  p_carrier text,
  p_tracking_number text,
  p_shipping_method text default null,
  p_tracking_url text default null,
  p_shipping_cost numeric default null,
  p_dispatched_at timestamptz default null
)
returns uuid
language plpgsql
as $$
declare
  v_order record;
  v_shipment_id uuid;
  v_when timestamptz := coalesce(p_dispatched_at, now());
begin
  perform public.assert_can_write();
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'Order not found'; end if;
  if v_order.status not in ('ready_to_pack', 'packed') then
    raise exception 'Only packed or ready-to-pack orders can be dispatched';
  end if;

  select id into v_shipment_id from public.shipments
  where order_id = p_order_id and status in ('pending', 'packed')
  order by created_at desc limit 1;

  if v_shipment_id is null then
    insert into public.shipments (order_id, status) values (p_order_id, 'pending') returning id into v_shipment_id;
  end if;

  update public.shipments set
    status = 'dispatched',
    carrier = nullif(trim(p_carrier), ''),
    tracking_number = nullif(trim(p_tracking_number), ''),
    tracking_url = nullif(trim(p_tracking_url), ''),
    shipping_method = coalesce(nullif(trim(p_shipping_method), ''), shipping_method, v_order.shipping_method),
    shipping_cost = p_shipping_cost,
    packed_at = coalesce(packed_at, v_when),
    packed_by = coalesce(packed_by, (select auth.uid())),
    dispatched_at = v_when,
    dispatched_by = (select auth.uid()),
    marketplace_push_status = case when v_order.source = 'manual' then 'not_required'::public.marketplace_push_status
                                   else 'pending'::public.marketplace_push_status end
  where id = v_shipment_id;

  update public.orders set
    status = 'dispatched',
    dispatched_at = v_when,
    carrier = nullif(trim(p_carrier), ''),
    tracking_number = nullif(trim(p_tracking_number), '')
  where id = p_order_id;

  update public.production_jobs set stage = 'dispatched'
  where order_id = p_order_id and stage not in ('dispatched', 'completed');

  perform public.log_activity('order', p_order_id, p_order_id, 'order.dispatched',
    'Order dispatched' || coalesce(' via ' || nullif(trim(p_carrier), ''), '') ||
    coalesce(' — tracking ' || nullif(trim(p_tracking_number), ''), ''));
  return v_shipment_id;
end;
$$;

create or replace function public.mark_order_completed(p_order_id uuid)
returns void
language plpgsql
as $$
begin
  perform public.assert_can_write();
  update public.orders set status = 'completed', completed_at = now()
  where id = p_order_id and status = 'dispatched';
  if not found then raise exception 'Only dispatched orders can be completed'; end if;
  update public.production_jobs set stage = 'completed' where order_id = p_order_id and stage = 'dispatched';
  perform public.log_activity('order', p_order_id, p_order_id, 'order.completed', 'Order marked as completed');
end;
$$;

-- -----------------------------------------------------------------------------
-- Integration sync lock (prevents overlapping cron + manual syncs)
-- -----------------------------------------------------------------------------
create or replace function public.acquire_sync_lock(p_provider public.integration_provider, p_seconds integer default 600)
returns boolean
language plpgsql
as $$
begin
  update public.integrations
  set sync_locked_until = now() + make_interval(secs => p_seconds), last_sync_started_at = now()
  where provider = p_provider
    and (sync_locked_until is null or sync_locked_until < now());
  return found;
end;
$$;

-- -----------------------------------------------------------------------------
-- Sample data purge (only rows flagged is_sample)
-- -----------------------------------------------------------------------------
create or replace function public.purge_sample_data()
returns jsonb
language plpgsql
as $$
declare
  v_orders integer;
  v_customers integer;
  v_products integer;
  v_filament integer;
begin
  if not public.is_admin() then
    raise exception 'Only owners and admins can remove sample data';
  end if;
  -- Free any printer that is mid-way through a sample print.
  update public.printers
  set status = 'available', current_job_id = null, current_print_run_id = null, estimated_completion_at = null
  where current_job_id in (select id from public.production_jobs where is_sample);
  delete from public.orders where is_sample;
  get diagnostics v_orders = row_count;
  delete from public.customers c where c.is_sample
    and not exists (select 1 from public.orders o where o.customer_id = c.id);
  get diagnostics v_customers = row_count;
  delete from public.products p where p.is_sample
    and not exists (select 1 from public.order_items oi where oi.product_id = p.id);
  get diagnostics v_products = row_count;
  delete from public.filament_stock where is_sample;
  get diagnostics v_filament = row_count;
  return jsonb_build_object('orders', v_orders, 'customers', v_customers, 'products', v_products, 'filament', v_filament);
end;
$$;

-- -----------------------------------------------------------------------------
-- Baseline configuration rows (real configuration, not sample data)
-- -----------------------------------------------------------------------------
insert into public.business_settings (singleton) values (true);

insert into public.integrations (provider, display_name)
values ('etsy', 'Etsy'), ('shopify', 'Shopify');

insert into public.printers (name, manufacturer, model, printer_type, build_volume_x_mm, build_volume_y_mm, build_volume_z_mm,
                             nozzle_size_mm, supported_materials, has_multi_material, sort_order)
values
  ('Bambu Lab A1', 'Bambu Lab', 'A1', 'FDM (bed slinger)', 256, 256, 256, 0.4,
   array['PLA', 'PLA+', 'PETG', 'TPU'], false, 1),
  ('Flashforge AD5X', 'Flashforge', 'AD5X', 'FDM (CoreXY, multi-colour)', 220, 220, 220, 0.4,
   array['PLA', 'PLA+', 'PETG', 'TPU'], true, 2),
  ('Flashforge Adventurer 5M', 'Flashforge', 'Adventurer 5M', 'FDM (CoreXY)', 220, 220, 220, 0.4,
   array['PLA', 'PLA+', 'PETG', 'TPU'], false, 3);
