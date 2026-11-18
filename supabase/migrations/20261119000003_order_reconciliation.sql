-- =============================================================================
-- PrintFlow — Phase 2: cancellations, line-item reconciliation, production safety
-- -----------------------------------------------------------------------------
-- Principles:
--   * A marketplace update never discards physical work, never moves a job
--     backwards, and never removes a printer assignment or print history.
--   * Changes that are safe are applied automatically and recorded.
--   * Changes that affect work already done are flagged for a human decision
--     (order_reviews, severity = action_required) and block packing/dispatch.
--   * The same marketplace update received twice never records anything twice.
-- Additive: new table/columns; replaced functions keep compatible signatures.
-- =============================================================================

-- ---- Review records ---------------------------------------------------------
create table public.order_reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  order_item_id uuid references public.order_items (id) on delete cascade,
  production_job_id uuid references public.production_jobs (id) on delete set null,
  kind text not null check (kind in (
    'order_cancelled', 'order_cancelled_after_dispatch', 'fulfilled_externally_during_production',
    'item_added', 'item_removed', 'quantity_increased', 'quantity_decreased',
    'personalisation_changed', 'variation_changed'
  )),
  severity text not null check (severity in ('info', 'action_required')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  title text not null,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  -- Identifies one specific change so the same update is never recorded twice.
  fingerprint text not null,
  source text not null default 'marketplace' check (source in ('marketplace', 'printflow')),
  detected_at timestamptz not null default now(),
  resolution text check (resolution in ('auto_applied', 'acknowledged', 'jobs_closed', 'reprint_requested', 'returned_to_production')),
  resolution_note text,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, fingerprint)
);
create index order_reviews_open_idx on public.order_reviews (status, severity, detected_at desc);
create index order_reviews_order_idx on public.order_reviews (order_id, detected_at desc);

create trigger order_reviews_set_updated_at
  before update on public.order_reviews
  for each row execute function public.set_updated_at();

alter table public.order_reviews enable row level security;
create policy order_reviews_select on public.order_reviews for select to authenticated using (public.is_team_member());
-- Writes go through the SQL functions below (security invoker → caller's rights).
create policy order_reviews_write on public.order_reviews for all to authenticated using (public.can_write()) with check (public.can_write());

alter table public.orders
  add column requires_review boolean not null default false,
  add column marketplace_amended_at timestamptz;
create index orders_requires_review_idx on public.orders (requires_review) where requires_review;

alter table public.order_items
  add column marketplace_status text not null default 'active' check (marketplace_status in ('active', 'removed')),
  add column removed_at timestamptz,
  add column personalisation_changed_at timestamptz;

-- Keep orders.requires_review in step with open action_required reviews.
create or replace function public.order_reviews_after_write()
returns trigger
language plpgsql
as $$
declare
  v_order uuid := coalesce(new.order_id, old.order_id);
begin
  update public.orders o
  set requires_review = exists (
    select 1 from public.order_reviews r
    where r.order_id = v_order and r.status = 'open' and r.severity = 'action_required'
  )
  where o.id = v_order;
  return null;
end;
$$;

create trigger order_reviews_after_write
  after insert or update or delete on public.order_reviews
  for each row execute function public.order_reviews_after_write();

-- Record a review once (dedupe on fingerprint). Info reviews are recorded as
-- already applied; action_required reviews stay open until a person decides.
create or replace function public.raise_order_review(
  p_order_id uuid,
  p_item_id uuid,
  p_job_id uuid,
  p_kind text,
  p_severity text,
  p_title text,
  p_message text,
  p_details jsonb,
  p_fingerprint text,
  p_source text default 'marketplace',
  p_actor_label text default null
)
returns boolean
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into public.order_reviews (
    order_id, order_item_id, production_job_id, kind, severity, status, title, message, details, fingerprint, source,
    resolution, resolved_at
  ) values (
    p_order_id, p_item_id, p_job_id, p_kind, p_severity,
    case when p_severity = 'info' then 'resolved' else 'open' end,
    p_title, p_message, coalesce(p_details, '{}'::jsonb), p_fingerprint, p_source,
    case when p_severity = 'info' then 'auto_applied' end,
    case when p_severity = 'info' then now() end
  )
  on conflict (order_id, fingerprint) do nothing
  returning id into v_id;

  if v_id is not null then
    perform public.log_activity('order', p_order_id, p_order_id,
      case when p_severity = 'info' then 'order.amended' else 'order.review_required' end,
      p_title || ' — ' || p_message,
      jsonb_build_object('review_id', v_id, 'kind', p_kind) || coalesce(p_details, '{}'::jsonb),
      p_actor_label);
  end if;
  return v_id is not null;
end;
$$;

-- Has physical work started on this job? (printing, printed or further along)
create or replace function public.job_has_physical_work(p_job public.production_jobs)
returns boolean
language sql
stable
as $$
  select p_job.quantity_printing > 0 or p_job.quantity_printed > 0 or p_job.quantity_surplus > 0
      or p_job.stage in ('printing', 'quality_check', 'ready_to_pack', 'dispatched', 'completed')
      or exists (select 1 from public.print_runs r where r.production_job_id = p_job.id and r.status = 'printing');
$$;

-- Close a job that hasn't produced anything: cancel its units, take it off
-- printer queues. Stage and history are left untouched.
create or replace function public.close_unstarted_job(p_job_id uuid, p_reason text)
returns void
language plpgsql
as $$
begin
  update public.production_units set status = 'cancelled', status_reason = p_reason
  where production_job_id = p_job_id and status = 'pending';
  update public.print_queue set status = 'removed' where production_job_id = p_job_id and status = 'queued';
  update public.production_jobs set cancelled_at = now(), cancellation_reason = p_reason
  where id = p_job_id and cancelled_at is null;
end;
$$;

-- ---- Cancellation (marketplace and in-app share one safe path) ---------------
create or replace function public.apply_order_cancellation(
  p_order_id uuid,
  p_source text,
  p_reason text default null,
  p_actor_label text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_order record;
  v_job public.production_jobs;
  v_closed integer := 0;
  v_dequeued integer := 0;
  v_affected jsonb := '[]'::jsonb;
  v_where text;
  v_printer text;
  v_reason text := 'Order cancelled' || case when p_source = 'marketplace' then ' on marketplace' else '' end;
  v_msg text;
begin
  if p_source = 'printflow' then perform public.assert_can_write(); end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'Order not found'; end if;
  if v_order.status = 'cancelled' then
    return jsonb_build_object('already_cancelled', true);
  end if;

  -- Already shipped: never rewrite history. Flag for refund/return handling.
  if v_order.status in ('dispatched', 'completed') then
    perform public.raise_order_review(p_order_id, null, null, 'order_cancelled_after_dispatch', 'action_required',
      'Cancelled after dispatch',
      'The order was cancelled ' || case when p_source = 'marketplace' then 'on the marketplace ' else '' end ||
        'after it was dispatched. Check whether a return or refund is needed. Shipping history is unchanged.',
      jsonb_build_object('status_at_cancellation', v_order.status, 'reason', p_reason),
      'cancelled_after_dispatch', p_source, p_actor_label);
    return jsonb_build_object('status_kept', v_order.status);
  end if;

  update public.orders set status = 'cancelled' where id = p_order_id;

  for v_job in select * from public.production_jobs where order_id = p_order_id and cancelled_at is null order by created_at
  loop
    if public.job_has_physical_work(v_job) then
      select p.name into v_printer from public.print_runs r join public.printers p on p.id = r.printer_id
      where r.production_job_id = v_job.id and r.status = 'printing' limit 1;
      v_where := case
        when v_printer is not null then 'printing on ' || v_printer
        when v_job.stage in ('ready_to_pack', 'dispatched', 'completed') then 'finished and ready to pack'
        when v_job.quantity_printed > 0 then v_job.quantity_printed || ' of ' || v_job.quantity || ' printed'
        else public.stage_label(v_job.stage)
      end;
      v_affected := v_affected || jsonb_build_object('job_id', v_job.id, 'job_number', v_job.job_number, 'state', v_where,
        'printing_on', v_printer, 'printed', v_job.quantity_printed);
    else
      select count(*) into v_dequeued from public.print_queue where production_job_id = v_job.id and status = 'queued';
      perform public.close_unstarted_job(v_job.id, v_reason);
      v_closed := v_closed + 1;
    end if;
  end loop;

  if jsonb_array_length(v_affected) = 0 and v_order.status <> 'packed' then
    perform public.raise_order_review(p_order_id, null, null, 'order_cancelled', 'info',
      'Order cancelled before production',
      v_closed || ' production job' || case when v_closed = 1 then ' was' else 's were' end || ' closed' ||
        case when v_dequeued > 0 then ' and removed from printer queues' else '' end || '. Nothing had been printed.',
      jsonb_build_object('jobs_closed', v_closed, 'reason', p_reason),
      'cancelled', p_source, p_actor_label);
  else
    v_msg := case when v_order.status = 'packed'
      then 'The order was already packed — unpack it and do not ship. '
      else '' end ||
      case when jsonb_array_length(v_affected) > 0
        then 'Work already done: ' || (select string_agg((a ->> 'job_number') || ' (' || (a ->> 'state') || ')', ', ') from jsonb_array_elements(v_affected) a) ||
             '. Nothing has been discarded — decide whether to keep the items as stock or scrap them.'
        else '' end;
    perform public.raise_order_review(p_order_id, null, null, 'order_cancelled', 'action_required',
      case when v_order.status = 'packed' then 'Cancelled after packing' else 'Cancelled during production' end,
      trim(v_msg),
      jsonb_build_object('jobs', v_affected, 'jobs_closed', v_closed, 'status_at_cancellation', v_order.status, 'reason', p_reason),
      'cancelled', p_source, p_actor_label);
  end if;

  perform public.log_activity('order', p_order_id, p_order_id,
    case when p_source = 'marketplace' then 'order.cancelled_on_marketplace' else 'order.cancelled' end,
    v_reason || coalesce(': ' || nullif(trim(p_reason), ''), ''), '{}'::jsonb, p_actor_label);
  return jsonb_build_object('jobs_closed', v_closed, 'jobs_needing_decision', jsonb_array_length(v_affected));
end;
$$;

-- Reopen a cancelled order (in-app). Jobs closed by the cancellation reopen;
-- open cancellation reviews are resolved.
create or replace function public.reopen_cancelled_order(p_order_id uuid)
returns void
language plpgsql
as $$
declare
  v_job record;
begin
  perform public.assert_can_write();
  update public.orders set status = 'new' where id = p_order_id and status = 'cancelled';
  if not found then raise exception 'Only cancelled orders can be reopened'; end if;
  for v_job in select id from public.production_jobs where order_id = p_order_id and cancellation_reason like 'Order cancelled%'
  loop
    update public.production_jobs set cancelled_at = null, cancellation_reason = null where id = v_job.id;
    update public.production_units set status = 'pending', status_reason = null
    where production_job_id = v_job.id and status = 'cancelled' and status_reason like 'Order cancelled%';
    perform public.sync_job_units(v_job.id);
  end loop;
  update public.order_reviews set status = 'resolved', resolution = 'acknowledged', resolution_note = 'Order reopened',
    resolved_at = now(), resolved_by = (select auth.uid())
  where order_id = p_order_id and kind = 'order_cancelled' and status = 'open';
  perform public.refresh_order_status(p_order_id);
  perform public.log_activity('order', p_order_id, p_order_id, 'order.reopened', 'Cancelled order reopened');
end;
$$;

-- ---- Resolving reviews (always an explicit human action) ----------------------
create or replace function public.resolve_order_review(p_review_id uuid, p_resolution text, p_note text default null)
returns jsonb
language plpgsql
as $$
declare
  v_review record;
  v_job public.production_jobs;
  v_n integer := 0;
  v_jobs uuid[];
  v_item record;
begin
  perform public.assert_can_write();
  select * into v_review from public.order_reviews where id = p_review_id for update;
  if v_review.id is null then raise exception 'Review not found'; end if;
  if v_review.status = 'resolved' then raise exception 'This change has already been resolved'; end if;
  if p_resolution not in ('acknowledged', 'jobs_closed', 'reprint_requested', 'returned_to_production') then
    raise exception 'Unknown resolution';
  end if;

  -- Jobs this review concerns.
  if v_review.production_job_id is not null then
    v_jobs := array[v_review.production_job_id];
  elsif v_review.order_item_id is not null then
    select array_agg(id) into v_jobs from public.production_jobs where order_item_id = v_review.order_item_id;
  else
    select array_agg(id) into v_jobs from public.production_jobs where order_id = v_review.order_id and cancelled_at is null;
  end if;

  if p_resolution = 'jobs_closed' then
    if v_review.kind not in ('order_cancelled', 'item_removed', 'quantity_decreased') then
      raise exception 'Closing jobs only applies to cancellations and removed items';
    end if;
    if exists (select 1 from public.print_runs r where r.production_job_id = any(v_jobs) and r.status = 'printing') then
      raise exception 'A print is still running for this order. Record the print as completed or failed first.';
    end if;
    for v_job in select * from public.production_jobs where id = any(v_jobs) and cancelled_at is null
    loop
      -- Printed items physically exist: keep them as surplus (stock/scrap decision is the note).
      update public.production_units set status = 'surplus', status_reason = 'Kept after cancellation'
      where production_job_id = v_job.id and status in ('printed', 'passed');
      perform public.close_unstarted_job(v_job.id, 'Closed after review: ' || coalesce(nullif(trim(p_note), ''), v_review.title));
      v_n := v_n + 1;
    end loop;
    if v_review.kind = 'order_cancelled' then
      update public.shipments set status = 'cancelled' where order_id = v_review.order_id and status in ('pending', 'packed');
    end if;
  elsif p_resolution = 'reprint_requested' then
    if v_review.kind not in ('personalisation_changed', 'variation_changed') then
      raise exception 'Reprinting only applies to personalisation or variation changes';
    end if;
    select personalisation, variant_title into v_item from public.order_items where id = v_review.order_item_id;
    update public.production_units u set status = 'pending', status_reason = 'Reprint: ' || v_review.title, passed_at = null
    from public.production_jobs j
    where j.id = u.production_job_id and j.id = any(v_jobs) and u.status in ('printed', 'passed')
      and (u.printed_personalisation is distinct from v_item.personalisation
           or u.printed_variant is distinct from v_item.variant_title
           or u.printed_personalisation is null);
    get diagnostics v_n = row_count;
    update public.production_jobs set stage = 'ready_to_print'
    where id = any(v_jobs) and stage in ('quality_check', 'ready_to_pack') and cancelled_at is null;
  elsif p_resolution = 'returned_to_production' then
    update public.production_jobs set stage = 'ready_to_print'
    where id = any(v_jobs) and stage in ('quality_check', 'ready_to_pack') and quantity_pending > 0 and cancelled_at is null;
    get diagnostics v_n = row_count;
  end if;

  update public.order_reviews
  set status = 'resolved', resolution = p_resolution, resolution_note = nullif(trim(p_note), ''),
      resolved_at = now(), resolved_by = (select auth.uid())
  where id = p_review_id;

  perform public.refresh_order_status(v_review.order_id);
  perform public.log_activity('order', v_review.order_id, v_review.order_id, 'order.review_resolved',
    v_review.title || ' — ' || case p_resolution
      when 'acknowledged' then 'acknowledged'
      when 'jobs_closed' then v_n || ' job' || case when v_n = 1 then '' else 's' end || ' closed (printed items kept as surplus)'
      when 'reprint_requested' then v_n || ' unit' || case when v_n = 1 then '' else 's' end || ' sent for reprint'
      when 'returned_to_production' then 'returned to production'
    end || coalesce(': ' || nullif(trim(p_note), ''), ''),
    jsonb_build_object('review_id', p_review_id, 'resolution', p_resolution));
  return jsonb_build_object('affected', v_n);
end;
$$;

-- ---- Order status derivation ignores closed jobs -------------------------------
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
  where order_id = p_order_id and cancelled_at is null;

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

-- Re-derive status when a job is closed/reopened.
create or replace function public.production_jobs_after_cancel()
returns trigger
language plpgsql
as $$
begin
  perform public.refresh_order_status(new.order_id);
  return null;
end;
$$;
create trigger production_jobs_after_cancel
  after update of cancelled_at on public.production_jobs
  for each row when (old.cancelled_at is distinct from new.cancelled_at)
  execute function public.production_jobs_after_cancel();

-- ---- Packing & dispatch guards -----------------------------------------------------
create or replace function public.assert_order_shippable(p_order_id uuid)
returns void
language plpgsql
as $$
declare
  v_outstanding integer;
begin
  if exists (select 1 from public.orders where id = p_order_id and requires_review) then
    raise exception 'This order has marketplace changes that need a decision. Resolve them on the order page before packing or dispatching.';
  end if;
  select coalesce(sum(quantity_pending + quantity_printing), 0) into v_outstanding
  from public.production_jobs where order_id = p_order_id and cancelled_at is null;
  if v_outstanding > 0 then
    raise exception '% unit% still need printing before this order can be packed', v_outstanding, case when v_outstanding = 1 then '' else 's' end;
  end if;
end;
$$;

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
  perform public.assert_order_shippable(p_order_id);

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
  perform public.assert_order_shippable(p_order_id);

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
    marketplace_push_status = case when v_order.source = 'manual' or v_order.is_sample then 'not_required'::public.marketplace_push_status
                                   else 'pending'::public.marketplace_push_status end
  where id = v_shipment_id;

  update public.orders set
    status = 'dispatched',
    dispatched_at = v_when,
    carrier = nullif(trim(p_carrier), ''),
    tracking_number = nullif(trim(p_tracking_number), '')
  where id = p_order_id;

  update public.production_jobs set stage = 'dispatched'
  where order_id = p_order_id and stage not in ('dispatched', 'completed') and cancelled_at is null;

  perform public.log_activity('order', p_order_id, p_order_id, 'order.dispatched',
    'Order dispatched' || coalesce(' via ' || nullif(trim(p_carrier), ''), '') ||
    coalesce(' — tracking ' || nullif(trim(p_tracking_number), ''), ''));
  return v_shipment_id;
end;
$$;

-- ---- Ingest with line-item reconciliation ----------------------------------------
drop function if exists public.ingest_marketplace_order(public.order_source, jsonb, jsonb, text, boolean);

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
  v_items_complete boolean := coalesce((p_order ->> 'items_complete')::boolean, false);
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
  v_old record;
  v_job public.production_jobs;
  v_product_id uuid;
  v_status public.order_status;
  v_listing_source public.integration_provider;
  v_qty integer;
  v_line text;
  v_seen text[] := '{}';
  v_removed_lines text[] := '{}';
  v_started boolean;
  v_shipped_state boolean;
  v_sync jsonb;
  v_changes integer := 0;
  v_printing jsonb;
  v_label text := initcap(p_source::text);
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

  if not p_force
     and v_existing.id is not null and v_mp_updated is not null
     and v_existing.marketplace_updated_at is not null
     and v_mp_updated <= v_existing.marketplace_updated_at
     and not (v_existing.customer_data_status = 'restricted' and not v_restricted) then
    update public.orders set last_synced_at = now() where id = v_existing.id;
    return jsonb_build_object('order_id', v_existing.id, 'result', 'unchanged');
  end if;

  v_keep_customer := v_restricted and v_existing.id is not null and v_existing.customer_data_status = 'available';
  v_shipped_state := v_existing.status in ('packed', 'dispatched', 'completed');

  if v_existing.id is not null and p_force then
    v_before := public.marketplace_order_fingerprint(v_existing.id);
  end if;

  -- ---- Customer resolution (skipped when the marketplace withheld it) -------
  v_customer_id := v_existing.customer_id;
  if not v_restricted then
    if v_customer_id is null and v_ext_customer is not null then
      select customer_id into v_customer_id from public.customer_identities
      where source = p_source and external_customer_id = v_ext_customer;
    end if;
    if v_customer_id is null and v_email is not null then
      select id into v_customer_id from public.customers where lower(email) = v_email order by created_at limit 1;
    end if;
    if v_customer_id is null then
      insert into public.customers (display_name, email, first_source) values (v_name, v_email, p_source)
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
    marketplace_updated_at = greatest(public.orders.marketplace_updated_at, excluded.marketplace_updated_at),
    marketplace_cancelled_at = excluded.marketplace_cancelled_at,
    last_synced_at = now(),
    dispatch_by = coalesce(public.orders.dispatch_by, excluded.dispatch_by)
  returning id, (xmax = 0) into v_order_id, v_inserted;

  -- ---- Line items: insert new, reconcile existing ------------------------------
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_line := v_item ->> 'external_line_item_id';
    v_qty := coalesce((v_item ->> 'quantity')::integer, 1);
    v_seen := v_seen || v_line;

    select * into v_old from public.order_items where order_id = v_order_id and external_line_item_id = v_line;

    -- A line with quantity 0 (e.g. Shopify order edit) is a removal.
    if v_qty <= 0 then
      v_seen := array_remove(v_seen, v_line);
      if v_old.id is not null then v_removed_lines := v_removed_lines || v_line; end if;
      continue;
    end if;

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
      v_order_id, v_product_id, v_line, v_item ->> 'external_listing_id',
      v_item ->> 'external_variant_id', nullif(v_item ->> 'sku', ''),
      coalesce(nullif(v_item ->> 'title', ''), 'Untitled item'), nullif(v_item ->> 'variant_title', ''),
      coalesce(v_item -> 'variant_details', '[]'::jsonb),
      v_qty,
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
      marketplace_status = 'active',
      removed_at = null,
      product_id = coalesce(public.order_items.product_id, excluded.product_id);

    continue when v_inserted;  -- first import: nothing to reconcile

    if v_old.id is null then
      -- Added after the original import.
      v_changes := v_changes + 1;
      perform public.raise_order_review(v_order_id,
        (select id from public.order_items where order_id = v_order_id and external_line_item_id = v_line), null,
        'item_added', case when v_shipped_state or v_existing.status = 'ready_to_pack' then 'action_required' else 'info' end,
        'Item added: ' || coalesce(nullif(v_item ->> 'title', ''), 'item'),
        v_qty || ' × ' || coalesce(nullif(v_item ->> 'title', ''), 'item') || ' was added on ' || v_label ||
          case when v_shipped_state or v_existing.status = 'ready_to_pack'
               then ' after the order was ready to pack — a production job has been created; repack before shipping.'
               else ' — a production job has been created.' end,
        jsonb_build_object('external_line_item_id', v_line, 'quantity', v_qty),
        'added:' || v_line, 'marketplace', p_actor_label);
      continue;
    end if;

    select * into v_job from public.production_jobs where order_item_id = v_old.id;
    v_started := v_job.id is not null and public.job_has_physical_work(v_job);

    -- Quantity
    if v_old.quantity is distinct from v_qty and v_job.id is not null and v_job.cancelled_at is null then
      v_changes := v_changes + 1;
      if v_existing.status in ('dispatched', 'completed') then
        perform public.raise_order_review(v_order_id, v_old.id, v_job.id,
          case when v_qty > v_old.quantity then 'quantity_increased' else 'quantity_decreased' end, 'action_required',
          'Quantity changed after dispatch', v_old.title || ': ' || v_old.quantity || ' → ' || v_qty || ' after the order was dispatched.',
          jsonb_build_object('before', v_old.quantity, 'after', v_qty), 'qty:' || v_line || ':' || v_qty, 'marketplace', p_actor_label);
      else
        update public.production_jobs set quantity = v_qty where id = v_job.id;  -- units adjust via trigger
        select * into v_job from public.production_jobs where id = v_job.id;
        if v_qty > v_old.quantity then
          perform public.raise_order_review(v_order_id, v_old.id, v_job.id, 'quantity_increased',
            case when v_started and v_job.stage in ('quality_check', 'ready_to_pack') or v_shipped_state then 'action_required' else 'info' end,
            'Quantity increased: ' || v_old.title,
            v_old.quantity || ' → ' || v_qty || '. ' || (v_qty - v_old.quantity) || ' more unit' ||
              case when v_qty - v_old.quantity = 1 then ' needs' else 's need' end || ' printing' ||
              case when v_started and v_job.stage in ('quality_check', 'ready_to_pack') then ' — the job is already at ' || public.stage_label(v_job.stage) || ' and has not been moved back.' else '.' end,
            jsonb_build_object('before', v_old.quantity, 'after', v_qty), 'qty:' || v_line || ':' || v_qty, 'marketplace', p_actor_label);
        else
          perform public.raise_order_review(v_order_id, v_old.id, v_job.id, 'quantity_decreased',
            case when v_job.quantity_surplus > 0 or (v_job.quantity_printing + v_job.quantity_printed + v_job.quantity_pending) > v_qty then 'action_required' else 'info' end,
            'Quantity reduced: ' || v_old.title,
            v_old.quantity || ' → ' || v_qty || '.' ||
              case when v_job.quantity_surplus > 0 then ' ' || v_job.quantity_surplus || ' printed unit' || case when v_job.quantity_surplus = 1 then ' is' else 's are' end || ' now surplus — nothing was discarded.'
                   when (v_job.quantity_printing + v_job.quantity_printed + v_job.quantity_pending) > v_qty then ' More units are on the printer than now needed.'
                   else ' Unprinted units were cancelled.' end,
            jsonb_build_object('before', v_old.quantity, 'after', v_qty, 'surplus', v_job.quantity_surplus),
            'qty:' || v_line || ':' || v_qty, 'marketplace', p_actor_label);
        end if;
      end if;
    end if;

    -- Personalisation
    if coalesce(v_old.personalisation, '') is distinct from coalesce(nullif(v_item ->> 'personalisation', ''), '') then
      v_changes := v_changes + 1;
      update public.order_items set personalisation_changed_at = now() where id = v_old.id;
      perform public.raise_order_review(v_order_id, v_old.id, v_job.id, 'personalisation_changed',
        case when v_started or v_shipped_state then 'action_required' else 'info' end,
        'Personalisation changed: ' || v_old.title,
        case when v_started then 'Changed after production started. Items already printed show the old text — check them before packing.'
             else 'Updated before production started; the job uses the new text.' end,
        jsonb_build_object('before', v_old.personalisation, 'after', nullif(v_item ->> 'personalisation', '')),
        'pers:' || v_line || ':' || md5(coalesce(v_item ->> 'personalisation', '')), 'marketplace', p_actor_label);
    end if;

    -- Variation / product details
    if coalesce(v_old.variant_title, '') is distinct from coalesce(nullif(v_item ->> 'variant_title', ''), '')
       or coalesce(v_old.sku, '') is distinct from coalesce(nullif(v_item ->> 'sku', ''), '')
       or v_old.title is distinct from coalesce(nullif(v_item ->> 'title', ''), 'Untitled item') then
      v_changes := v_changes + 1;
      perform public.raise_order_review(v_order_id, v_old.id, v_job.id, 'variation_changed',
        case when v_started or v_shipped_state then 'action_required' else 'info' end,
        'Variation changed: ' || v_old.title,
        coalesce(v_old.variant_title, '—') || ' → ' || coalesce(nullif(v_item ->> 'variant_title', ''), '—') ||
          case when v_started then '. Items already printed may not match — check them before packing.' else '.' end,
        jsonb_build_object('before', jsonb_build_object('title', v_old.title, 'variant', v_old.variant_title, 'sku', v_old.sku),
                           'after', jsonb_build_object('title', v_item ->> 'title', 'variant', v_item ->> 'variant_title', 'sku', v_item ->> 'sku')),
        'var:' || v_line || ':' || md5(coalesce(v_item ->> 'title', '') || '|' || coalesce(v_item ->> 'variant_title', '') || '|' || coalesce(v_item ->> 'sku', '')),
        'marketplace', p_actor_label);
    end if;
  end loop;

  -- ---- Removed lines (only when the marketplace sent the complete list) -----
  if not v_inserted and (v_items_complete or cardinality(v_removed_lines) > 0) then
    for v_old in
      select * from public.order_items
      where order_id = v_order_id and marketplace_status = 'active'
        and external_line_item_id is not null and not (external_line_item_id = any(v_seen))
        and (v_items_complete or external_line_item_id = any(v_removed_lines))
    loop
      v_changes := v_changes + 1;
      update public.order_items set marketplace_status = 'removed', removed_at = now() where id = v_old.id;
      select * into v_job from public.production_jobs where order_item_id = v_old.id;
      v_started := v_job.id is not null and public.job_has_physical_work(v_job);
      if v_job.id is not null and not v_started and not v_shipped_state then
        perform public.close_unstarted_job(v_job.id, 'Item removed on ' || v_label);
      end if;
      perform public.raise_order_review(v_order_id, v_old.id, v_job.id, 'item_removed',
        case when v_started or v_shipped_state then 'action_required' else 'info' end,
        'Item removed: ' || v_old.title,
        v_old.quantity || ' × ' || v_old.title || ' was removed on ' || v_label ||
          case when v_started or v_shipped_state then '. Work has already started — nothing was discarded; decide whether to keep or scrap it.'
               else '. Its production job was closed.' end,
        jsonb_build_object('external_line_item_id', v_old.external_line_item_id, 'quantity', v_old.quantity),
        'removed:' || v_old.external_line_item_id, 'marketplace', p_actor_label);
    end loop;
  end if;

  if v_changes > 0 then
    update public.orders set marketplace_amended_at = now() where id = v_order_id;
  end if;

  -- ---- Production jobs for new lines (never duplicated: unique order_item_id)
  if v_cancelled is null and coalesce(v_existing.status, 'new') <> 'cancelled' then
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
    where oi.order_id = v_order_id and j.id is null and oi.marketplace_status = 'active'
    on conflict (order_item_id) do nothing;
  end if;

  -- ---- Marketplace-driven status changes for existing orders ----------------
  if not v_inserted then
    if v_cancelled is not null and v_existing.status <> 'cancelled' then
      perform public.apply_order_cancellation(v_order_id, 'marketplace', null, p_actor_label);
    elsif v_fulfilled and v_existing.status not in ('cancelled', 'dispatched', 'completed') then
      -- Shipped outside PrintFlow. Move finished/unstarted jobs forward, but
      -- never touch a job that is on a printer right now.
      select jsonb_agg(jsonb_build_object('job_number', j.job_number)) into v_printing
      from public.production_jobs j
      where j.order_id = v_order_id and j.cancelled_at is null
        and exists (select 1 from public.print_runs r where r.production_job_id = j.id and r.status = 'printing');
      update public.orders set status = 'dispatched', dispatched_at = coalesce(dispatched_at, now()) where id = v_order_id;
      update public.production_jobs j set stage = 'dispatched'
      where j.order_id = v_order_id and j.stage not in ('dispatched', 'completed') and j.cancelled_at is null
        and not exists (select 1 from public.print_runs r where r.production_job_id = j.id and r.status = 'printing');
      perform public.log_activity('order', v_order_id, v_order_id, 'order.fulfilled_on_marketplace',
        'Order was marked as shipped on ' || v_label || ' outside PrintFlow', '{}'::jsonb, p_actor_label);
      if v_printing is not null then
        perform public.raise_order_review(v_order_id, null, null, 'fulfilled_externally_during_production', 'action_required',
          'Shipped on ' || v_label || ' while still printing',
          'The order was marked as shipped on ' || v_label || ' but these jobs are still on a printer: ' ||
            (select string_agg(x ->> 'job_number', ', ') from jsonb_array_elements(v_printing) x) || '. They were not moved.',
          jsonb_build_object('jobs', v_printing), 'fulfilled_during_production', 'marketplace', p_actor_label);
      end if;
    end if;

    if p_force then
      v_after := public.marketplace_order_fingerprint(v_order_id);
      if v_after is not distinct from v_before then
        return jsonb_build_object('order_id', v_order_id, 'result', 'unchanged');
      end if;
      perform public.log_activity('order', v_order_id, v_order_id, 'order.resynced',
        'Marketplace data refreshed by a full resync from ' || v_label, '{}'::jsonb, p_actor_label);
    else
      perform public.log_activity('order', v_order_id, v_order_id, 'order.synced',
        'Marketplace data updated from ' || v_label, '{}'::jsonb, p_actor_label);
    end if;
  else
    perform public.log_activity('order', v_order_id, v_order_id, 'order.imported',
      'Order imported from ' || v_label, jsonb_build_object('external_order_id', v_ext_id), p_actor_label);
  end if;

  return jsonb_build_object('order_id', v_order_id, 'result', case when v_inserted then 'created' else 'updated' end);
end;
$$;

revoke execute on function public.ingest_marketplace_order(public.order_source, jsonb, jsonb, text, boolean) from public, anon, authenticated;
grant execute on function public.ingest_marketplace_order(public.order_source, jsonb, jsonb, text, boolean) to service_role;
