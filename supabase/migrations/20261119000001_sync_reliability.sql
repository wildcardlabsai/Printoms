-- =============================================================================
-- PrintFlow — Phase 1: marketplace sync reliability
-- -----------------------------------------------------------------------------
-- Additive only: new table, new nullable/defaulted columns, one enum value and
-- a replacement ingest function. No existing rows are modified or removed.
--
--  1. sync_failures        — durable record of orders that failed to ingest,
--                            retried on later runs and cleared on success.
--  2. sync_logs            — retry/recovery counters and structured warnings.
--  3. orders               — customer_data_status distinguishes "withheld by the
--                            marketplace" from "genuinely empty".
--  4. order_items          — marketplace_options keeps the untouched original
--                            variation / custom-attribute data.
--  5. integrations         — customer data access state.
--  6. sync_trigger         — 'resync' for administrative full resynchronisation.
--  7. ingest_marketplace_order — force mode for resync, restricted-customer
--                            handling, change detection, original options.
-- =============================================================================

-- 6. Enum value (must be committed before use; it is only used at runtime).
alter type public.sync_trigger add value if not exists 'resync';

-- -----------------------------------------------------------------------------
-- 1. Failed order recovery
-- -----------------------------------------------------------------------------
create table public.sync_failures (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid references public.integrations (id) on delete cascade,
  provider public.integration_provider not null,
  external_order_id text not null,
  marketplace_updated_at timestamptz,
  -- Normalised {order, items} payload so the order can be retried even if the
  -- marketplace never returns it again.
  payload jsonb not null,
  last_error text not null,
  attempts integer not null default 1 check (attempts >= 1),
  first_failed_at timestamptz not null default now(),
  last_failed_at timestamptz not null default now(),
  last_sync_log_id uuid references public.sync_logs (id) on delete set null,
  resolved_at timestamptz,
  resolved_sync_log_id uuid references public.sync_logs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_order_id)
);
create index sync_failures_open_idx on public.sync_failures (provider, last_failed_at desc) where resolved_at is null;

create trigger sync_failures_set_updated_at
  before update on public.sync_failures
  for each row execute function public.set_updated_at();

alter table public.sync_failures enable row level security;
-- Readable by the team (shown on the integrations page); written by the server only.
create policy sync_failures_select on public.sync_failures for select to authenticated using (public.is_team_member());

-- Record (or re-open) a failure and return the cumulative attempt count.
create or replace function public.record_sync_failure(
  p_provider public.integration_provider,
  p_external_order_id text,
  p_marketplace_updated_at timestamptz,
  p_payload jsonb,
  p_error text,
  p_sync_log_id uuid
)
returns integer
language plpgsql
as $$
declare
  v_attempts integer;
begin
  insert into public.sync_failures (
    integration_id, provider, external_order_id, marketplace_updated_at, payload, last_error, last_sync_log_id
  ) values (
    (select id from public.integrations where provider = p_provider),
    p_provider, p_external_order_id, p_marketplace_updated_at, p_payload, left(p_error, 2000), p_sync_log_id
  )
  on conflict (provider, external_order_id) do update set
    -- A previously resolved failure that fails again starts a new count.
    attempts = case when public.sync_failures.resolved_at is null then public.sync_failures.attempts + 1 else 1 end,
    first_failed_at = case when public.sync_failures.resolved_at is null then public.sync_failures.first_failed_at else now() end,
    marketplace_updated_at = greatest(public.sync_failures.marketplace_updated_at, excluded.marketplace_updated_at),
    -- Keep the newest payload we have seen.
    payload = case
      when public.sync_failures.marketplace_updated_at is null
        or excluded.marketplace_updated_at >= public.sync_failures.marketplace_updated_at then excluded.payload
      else public.sync_failures.payload end,
    last_error = excluded.last_error,
    last_failed_at = now(),
    last_sync_log_id = excluded.last_sync_log_id,
    resolved_at = null,
    resolved_sync_log_id = null
  returning attempts into v_attempts;
  return v_attempts;
end;
$$;

create or replace function public.resolve_sync_failure(
  p_provider public.integration_provider,
  p_external_order_id text,
  p_sync_log_id uuid
)
returns boolean
language plpgsql
as $$
begin
  update public.sync_failures
  set resolved_at = now(), resolved_sync_log_id = p_sync_log_id
  where provider = p_provider and external_order_id = p_external_order_id and resolved_at is null;
  return found;
end;
$$;

revoke execute on function public.record_sync_failure(public.integration_provider, text, timestamptz, jsonb, text, uuid) from public, anon, authenticated;
revoke execute on function public.resolve_sync_failure(public.integration_provider, text, uuid) from public, anon, authenticated;
grant execute on function public.record_sync_failure(public.integration_provider, text, timestamptz, jsonb, text, uuid) to service_role;
grant execute on function public.resolve_sync_failure(public.integration_provider, text, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 2. Sync log counters & warnings
-- -----------------------------------------------------------------------------
alter table public.sync_logs
  add column orders_retried integer not null default 0,
  add column orders_recovered integer not null default 0,
  add column failures_outstanding integer not null default 0,
  add column warnings jsonb not null default '[]'::jsonb;

-- -----------------------------------------------------------------------------
-- 3/4/5. Customer data status, original marketplace options, access state
-- -----------------------------------------------------------------------------
alter table public.orders
  add column customer_data_status text not null default 'available'
    check (customer_data_status in ('available', 'restricted')),
  add column customer_data_restricted_fields text[] not null default '{}';

comment on column public.orders.customer_data_status is
  'available = the marketplace supplied customer fields (they may genuinely be empty); restricted = the marketplace withheld them (e.g. Shopify protected customer data).';

alter table public.order_items
  add column marketplace_options jsonb;

comment on column public.order_items.marketplace_options is
  'Untouched original variation / custom attribute data from the marketplace. personalisation and variant_details are derived from it.';

alter table public.integrations
  add column customer_data_access text not null default 'unknown'
    check (customer_data_access in ('unknown', 'available', 'restricted')),
  add column customer_data_checked_at timestamptz;

-- -----------------------------------------------------------------------------
-- 7. Ingest function (replaces the 4-argument version)
-- -----------------------------------------------------------------------------

-- Fingerprint of marketplace-owned data for one order, used to detect whether
-- a forced resync actually changed anything.
create or replace function public.marketplace_order_fingerprint(p_order_id uuid)
returns text
language sql
stable
as $$
  select md5(
    coalesce((
      select jsonb_build_array(
        o.external_order_number, o.customer_name, o.customer_email, o.shipping_address, o.order_date,
        o.payment_status, o.marketplace_status, o.marketplace_fulfilment_status, o.currency, o.subtotal,
        o.shipping_total, o.tax_total, o.discount_total, o.total, o.customer_note, o.shipping_method,
        o.marketplace_dispatch_by, o.marketplace_cancelled_at, o.customer_data_status, o.status
      )::text
      from public.orders o where o.id = p_order_id
    ), '') ||
    coalesce((
      select string_agg(
        jsonb_build_array(
          i.external_line_item_id, i.sku, i.title, i.variant_title, i.variant_details, i.quantity,
          i.unit_price, i.total_price, i.personalisation, i.marketplace_options
        )::text, '|' order by i.external_line_item_id
      )
      from public.order_items i where i.order_id = p_order_id
    ), '')
  );
$$;

drop function if exists public.ingest_marketplace_order(public.order_source, jsonb, jsonb, text);

-- Idempotent upsert keyed on (source, external_order_id).
--   * Only marketplace-owned columns are overwritten on update.
--   * Internal production data (status, priority, notes, deadlines, printer
--     assignments, stages, print history) is preserved.
--   * Customers are matched by marketplace customer id, then exact email.
--   * p_force (full resync) re-applies marketplace data even when the
--     marketplace timestamp is unchanged; activity is only logged when the
--     marketplace data actually changed.
--   * When customer data is restricted by the marketplace, existing customer
--     details are never overwritten with blanks and no customer is created.
-- Returns {order_id, result: created|updated|unchanged}.
create or replace function public.ingest_marketplace_order(
  p_source public.order_source,
  p_order jsonb,
  p_items jsonb,
  p_actor_label text default null,
  p_force boolean default false
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
  v_restricted boolean := coalesce(p_order ->> 'customer_data_status', 'available') = 'restricted';
  v_restricted_fields text[] := coalesce(
    (select array_agg(value) from jsonb_array_elements_text(coalesce(p_order -> 'customer_data_restricted_fields', '[]'::jsonb))),
    '{}'
  );
  v_keep_customer boolean;
  v_before text;
  v_after text;
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

  select id, marketplace_updated_at, status, customer_id, customer_data_status
  into v_existing
  from public.orders
  where source = p_source and external_order_id = v_ext_id;

  -- Skip untouched orders cheaply — unless forced (resync), or the stored
  -- customer data was restricted and the marketplace now supplies it.
  if not p_force
     and v_existing.id is not null and v_mp_updated is not null
     and v_existing.marketplace_updated_at is not null
     and v_mp_updated <= v_existing.marketplace_updated_at
     and not (v_existing.customer_data_status = 'restricted' and not v_restricted) then
    update public.orders set last_synced_at = now() where id = v_existing.id;
    return jsonb_build_object('order_id', v_existing.id, 'result', 'unchanged');
  end if;

  -- Restricted data must never overwrite customer details we already hold.
  v_keep_customer := v_restricted and v_existing.id is not null and v_existing.customer_data_status = 'available';

  if v_existing.id is not null and p_force then
    v_before := public.marketplace_order_fingerprint(v_existing.id);
  end if;

  -- ---- Customer resolution (skipped when the marketplace withheld it) -------
  v_customer_id := v_existing.customer_id;
  if not v_restricted then
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
    last_synced_at, status, dispatch_by, completed_at, customer_data_status, customer_data_restricted_fields
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
    case when v_status = 'completed' then now() end,
    case when v_restricted then 'restricted' else 'available' end,
    v_restricted_fields
  )
  on conflict (source, external_order_id) do update set
    external_order_number = excluded.external_order_number,
    customer_id = coalesce(public.orders.customer_id, excluded.customer_id),
    customer_name = case when v_keep_customer then public.orders.customer_name else excluded.customer_name end,
    customer_email = case when v_keep_customer then public.orders.customer_email
                          else coalesce(excluded.customer_email, public.orders.customer_email) end,
    shipping_address = case when v_keep_customer then public.orders.shipping_address else excluded.shipping_address end,
    customer_data_status = case when v_keep_customer then public.orders.customer_data_status else excluded.customer_data_status end,
    customer_data_restricted_fields = case when v_keep_customer then public.orders.customer_data_restricted_fields
                                           else excluded.customer_data_restricted_fields end,
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
    -- Never move the marketplace timestamp backwards (e.g. a stale retry payload).
    marketplace_updated_at = greatest(public.orders.marketplace_updated_at, excluded.marketplace_updated_at),
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
      title, variant_title, variant_details, quantity, unit_price, total_price, personalisation, marketplace_options
    ) values (
      v_order_id, v_product_id, v_item ->> 'external_line_item_id', v_item ->> 'external_listing_id',
      v_item ->> 'external_variant_id', nullif(v_item ->> 'sku', ''),
      coalesce(nullif(v_item ->> 'title', ''), 'Untitled item'), nullif(v_item ->> 'variant_title', ''),
      coalesce(v_item -> 'variant_details', '[]'::jsonb),
      greatest(1, coalesce((v_item ->> 'quantity')::integer, 1)),
      coalesce((v_item ->> 'unit_price')::numeric, 0), coalesce((v_item ->> 'total_price')::numeric, 0),
      nullif(v_item ->> 'personalisation', ''),
      v_item -> 'marketplace_options'
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
      marketplace_options = coalesce(excluded.marketplace_options, public.order_items.marketplace_options),
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

  -- ---- Production jobs for new lines (never duplicated: unique order_item_id)
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
    where oi.order_id = v_order_id and j.id is null
    on conflict (order_item_id) do nothing;
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

    if p_force then
      v_after := public.marketplace_order_fingerprint(v_order_id);
      if v_after is not distinct from v_before then
        return jsonb_build_object('order_id', v_order_id, 'result', 'unchanged');
      end if;
      perform public.log_activity('order', v_order_id, v_order_id, 'order.resynced',
        'Marketplace data refreshed by a full resync from ' || initcap(p_source::text), '{}'::jsonb, p_actor_label);
    else
      perform public.log_activity('order', v_order_id, v_order_id, 'order.synced',
        'Marketplace data updated from ' || initcap(p_source::text), '{}'::jsonb, p_actor_label);
    end if;
  else
    perform public.log_activity('order', v_order_id, v_order_id, 'order.imported',
      'Order imported from ' || initcap(p_source::text), jsonb_build_object('external_order_id', v_ext_id), p_actor_label);
  end if;

  return jsonb_build_object('order_id', v_order_id, 'result', case when v_inserted then 'created' else 'updated' end);
end;
$$;

revoke execute on function public.ingest_marketplace_order(public.order_source, jsonb, jsonb, text, boolean) from public, anon, authenticated;
grant execute on function public.ingest_marketplace_order(public.order_source, jsonb, jsonb, text, boolean) to service_role;
revoke execute on function public.marketplace_order_fingerprint(uuid) from public, anon;
