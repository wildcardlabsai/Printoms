-- =============================================================================
-- PrintFlow — dashboard & analytics functions (security invoker; RLS applies)
-- -----------------------------------------------------------------------------
-- Definitions used throughout:
--   gross sales   = order total (items + shipping + tax − discounts)
--   net revenue   = gross sales − tax collected
--   estimated profit = net revenue − estimated costs (marketplace fees,
--                      filament, packaging, labour/other, recorded shipping).
-- Estimated profit is an operational indicator, NOT accounting profit.
-- Cancelled orders are excluded from all revenue figures.
-- =============================================================================

create or replace function public.dashboard_metrics()
returns jsonb
language plpgsql
stable
as $$
declare
  v_tz text := coalesce((select timezone from public.business_settings limit 1), 'Europe/London');
  v_today_start timestamptz := (date_trunc('day', now() at time zone v_tz)) at time zone v_tz;
  v_result jsonb;
begin
  select jsonb_build_object(
    'total_orders', count(*) filter (where status <> 'cancelled'),
    'new_today', count(*) filter (where order_date >= v_today_start and status <> 'cancelled'),
    'awaiting_production', count(*) filter (where status = 'new'),
    'in_production', count(*) filter (where status = 'in_production'),
    'ready_to_pack', count(*) filter (where status = 'ready_to_pack'),
    'awaiting_dispatch', count(*) filter (where status = 'packed'),
    'on_hold', count(*) filter (where status = 'on_hold'),
    'overdue', count(*) filter (where dispatch_by < now() and status not in ('dispatched', 'completed', 'cancelled')),
    'total_sales', coalesce(sum(total) filter (where status <> 'cancelled'), 0),
    'etsy_sales', coalesce(sum(total) filter (where status <> 'cancelled' and source = 'etsy'), 0),
    'shopify_sales', coalesce(sum(total) filter (where status <> 'cancelled' and source = 'shopify'), 0),
    'manual_sales', coalesce(sum(total) filter (where status <> 'cancelled' and source = 'manual'), 0),
    'etsy_orders', count(*) filter (where status <> 'cancelled' and source = 'etsy'),
    'shopify_orders', count(*) filter (where status <> 'cancelled' and source = 'shopify'),
    'manual_orders', count(*) filter (where status <> 'cancelled' and source = 'manual'),
    'sample_orders', count(*) filter (where is_sample)
  )
  into v_result
  from public.orders;

  v_result := v_result || jsonb_build_object(
    'currently_printing', (select count(*) from public.print_runs where status = 'printing'),
    'jobs_by_stage', coalesce((
      select jsonb_object_agg(stage, n) from (
        select stage, count(*) n from public.production_jobs group by stage
      ) s
    ), '{}'::jsonb),
    'sales_30d', coalesce((
      select jsonb_agg(d order by d ->> 'date') from (
        select jsonb_build_object(
          'date', to_char(day, 'YYYY-MM-DD'),
          'etsy', coalesce(sum(o.total) filter (where o.source = 'etsy'), 0),
          'shopify', coalesce(sum(o.total) filter (where o.source = 'shopify'), 0),
          'manual', coalesce(sum(o.total) filter (where o.source = 'manual'), 0),
          'orders', count(o.id)
        ) d
        from generate_series(
          date_trunc('day', now() at time zone v_tz) - interval '29 days',
          date_trunc('day', now() at time zone v_tz),
          interval '1 day'
        ) day
        left join public.orders o
          on o.status <> 'cancelled'
         and (o.order_date at time zone v_tz) >= day
         and (o.order_date at time zone v_tz) < day + interval '1 day'
        group by day
      ) x
    ), '[]'::jsonb)
  );
  return v_result;
end;
$$;

-- Summary figures for one period. Internal helper for analytics_report.
create or replace function public.analytics_period_summary(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
as $$
declare
  s record;
  v_result jsonb;
begin
  select * into s from public.business_settings limit 1;

  with o as (
    select * from public.orders
    where status <> 'cancelled' and order_date >= p_from and order_date < p_to
  ),
  items as (
    select oi.*, p.estimated_filament_g, p.material_cost, p.packaging_cost, p.labour_cost, p.other_cost
    from public.order_items oi
    join o on o.id = oi.order_id
    left join public.products p on p.id = oi.product_id
  ),
  recorded_filament as (
    -- Actual recorded consumption for jobs belonging to these orders
    select j.order_item_id, sum(fu.cost) as cost
    from public.filament_usage fu
    join public.production_jobs j on j.id = fu.production_job_id
    join o on o.id = j.order_id
    where fu.kind in ('print', 'failed_print')
    group by j.order_item_id
  ),
  item_costs as (
    select
      i.order_id,
      -- Filament: recorded cost if available, else product material cost override,
      -- else estimated grams × default cost/kg.
      coalesce(
        rf.cost,
        i.material_cost * i.quantity,
        i.estimated_filament_g * i.quantity * s.default_filament_cost_per_kg / 1000.0,
        0
      ) as filament_cost,
      (rf.cost is not null) as filament_recorded,
      (i.product_id is null) as unmapped,
      coalesce(i.packaging_cost, 0) * i.quantity as packaging_cost,
      (coalesce(i.labour_cost, 0) + coalesce(i.other_cost, 0)) * i.quantity as other_cost
    from items i
    left join recorded_filament rf on rf.order_item_id = i.id
  ),
  order_costs as (
    select
      o.id, o.source, o.total, o.tax_total,
      coalesce(sum(ic.filament_cost), 0) as filament_cost,
      greatest(coalesce(sum(ic.packaging_cost), 0), s.default_packaging_cost) as packaging_cost,
      coalesce(sum(ic.other_cost), 0) as other_cost,
      case o.source
        when 'etsy' then o.total * s.etsy_fee_percent / 100.0 + s.etsy_fixed_fee
        when 'shopify' then o.total * s.shopify_fee_percent / 100.0 + s.shopify_fixed_fee
        else 0
      end as fees,
      coalesce((select sum(sh.shipping_cost) from public.shipments sh where sh.order_id = o.id), 0) as shipping_cost,
      bool_or(ic.unmapped) as has_unmapped
    from o
    left join item_costs ic on ic.order_id = o.id
    group by o.id, o.source, o.total, o.tax_total
  )
  select jsonb_build_object(
    'orders', count(*),
    'gross_sales', coalesce(sum(total), 0),
    'tax_collected', coalesce(sum(tax_total), 0),
    'net_revenue', coalesce(sum(total - tax_total), 0),
    'etsy_revenue', coalesce(sum(total - tax_total) filter (where source = 'etsy'), 0),
    'shopify_revenue', coalesce(sum(total - tax_total) filter (where source = 'shopify'), 0),
    'manual_revenue', coalesce(sum(total - tax_total) filter (where source = 'manual'), 0),
    'average_order_value', coalesce(round(avg(total)::numeric, 2), 0),
    'est_marketplace_fees', coalesce(round(sum(fees)::numeric, 2), 0),
    'est_filament_cost', coalesce(round(sum(filament_cost)::numeric, 2), 0),
    'est_packaging_cost', coalesce(round(sum(packaging_cost)::numeric, 2), 0),
    'est_other_cost', coalesce(round(sum(other_cost)::numeric, 2), 0),
    'recorded_shipping_cost', coalesce(round(sum(shipping_cost)::numeric, 2), 0),
    'est_total_costs', coalesce(round(sum(fees + filament_cost + packaging_cost + other_cost + shipping_cost)::numeric, 2), 0),
    'est_profit', coalesce(round(sum((total - tax_total) - (fees + filament_cost + packaging_cost + other_cost + shipping_cost))::numeric, 2), 0),
    'orders_with_unmapped_items', count(*) filter (where has_unmapped)
  )
  into v_result
  from order_costs;

  return v_result;
end;
$$;

create or replace function public.analytics_report(p_from date, p_to date)
returns jsonb
language plpgsql
stable
as $$
declare
  v_tz text := coalesce((select timezone from public.business_settings limit 1), 'Europe/London');
  v_from timestamptz := (p_from::timestamp) at time zone v_tz;
  v_to timestamptz := ((p_to + 1)::timestamp) at time zone v_tz;   -- inclusive end date
  v_len interval := v_to - v_from;
  v_result jsonb;
begin
  if p_to < p_from then
    raise exception 'End date must be on or after start date';
  end if;

  v_result := jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'current', public.analytics_period_summary(v_from, v_to),
    'previous', public.analytics_period_summary(v_from - v_len, v_from)
  );

  -- Monthly comparison (calendar months overlapping the range)
  v_result := v_result || jsonb_build_object('monthly', coalesce((
    select jsonb_agg(m order by m ->> 'month') from (
      select jsonb_build_object(
        'month', to_char(date_trunc('month', o.order_date at time zone v_tz), 'YYYY-MM'),
        'orders', count(*),
        'etsy', coalesce(sum(o.total - o.tax_total) filter (where o.source = 'etsy'), 0),
        'shopify', coalesce(sum(o.total - o.tax_total) filter (where o.source = 'shopify'), 0),
        'manual', coalesce(sum(o.total - o.tax_total) filter (where o.source = 'manual'), 0),
        'net_revenue', coalesce(sum(o.total - o.tax_total), 0)
      ) m
      from public.orders o
      where o.status <> 'cancelled'
        and o.order_date >= date_trunc('month', v_from at time zone v_tz) at time zone v_tz
        and o.order_date < v_to
      group by date_trunc('month', o.order_date at time zone v_tz)
    ) x
  ), '[]'::jsonb));

  -- Daily order volume
  v_result := v_result || jsonb_build_object('daily', coalesce((
    select jsonb_agg(d order by d ->> 'date') from (
      select jsonb_build_object(
        'date', to_char(day, 'YYYY-MM-DD'),
        'orders', count(o.id),
        'revenue', coalesce(sum(o.total - o.tax_total), 0)
      ) d
      from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') day
      left join public.orders o
        on o.status <> 'cancelled'
       and (o.order_date at time zone v_tz) >= day
       and (o.order_date at time zone v_tz) < day + interval '1 day'
      group by day
    ) x
  ), '[]'::jsonb));

  -- Best-selling products (falls back to line title for unmapped items)
  v_result := v_result || jsonb_build_object('best_sellers', coalesce((
    select jsonb_agg(b) from (
      select jsonb_build_object(
        'product_id', oi.product_id,
        'name', coalesce(p.name, oi.title),
        'sku', coalesce(p.sku, oi.sku),
        'mapped', oi.product_id is not null,
        'units', sum(oi.quantity),
        'revenue', sum(oi.total_price),
        'orders', count(distinct oi.order_id)
      ) b
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      left join public.products p on p.id = oi.product_id
      where o.status <> 'cancelled' and o.order_date >= v_from and o.order_date < v_to
      group by oi.product_id, coalesce(p.name, oi.title), coalesce(p.sku, oi.sku)
      order by sum(oi.quantity) desc, sum(oi.total_price) desc
      limit 10
    ) x
  ), '[]'::jsonb));

  -- Production performance
  v_result := v_result || jsonb_build_object('production', (
    select jsonb_build_object(
      'print_runs', count(*),
      'succeeded', count(*) filter (where status = 'succeeded'),
      'failed', count(*) filter (where status = 'failed'),
      'failure_rate', case when count(*) filter (where status in ('succeeded', 'failed')) > 0
        then round(100.0 * count(*) filter (where status = 'failed') / count(*) filter (where status in ('succeeded', 'failed')), 1)
        else 0 end,
      'avg_print_minutes', coalesce(round(avg(extract(epoch from (ended_at - started_at)) / 60.0) filter (where status = 'succeeded')::numeric, 0), 0),
      'total_print_hours', coalesce(round(sum(extract(epoch from (ended_at - started_at)) / 3600.0) filter (where ended_at is not null)::numeric, 1), 0)
    )
    from public.print_runs
    where started_at >= v_from and started_at < v_to
  ));

  v_result := v_result || jsonb_build_object('fulfilment', (
    select jsonb_build_object(
      'dispatched_orders', count(*),
      'avg_turnaround_hours', coalesce(round(avg(extract(epoch from (dispatched_at - order_date)) / 3600.0)::numeric, 1), 0),
      'on_time_rate', case when count(*) filter (where dispatch_by is not null) > 0
        then round(100.0 * count(*) filter (where dispatch_by is not null and dispatched_at <= dispatch_by)
                   / count(*) filter (where dispatch_by is not null), 1)
        else null end
    )
    from public.orders
    where dispatched_at >= v_from and dispatched_at < v_to
  ));

  -- Recorded filament consumption in the period (actual ledger entries)
  v_result := v_result || jsonb_build_object('filament', (
    select jsonb_build_object(
      'recorded_grams', coalesce(sum(fu.grams) filter (where fu.kind in ('print', 'failed_print', 'waste')), 0),
      'recorded_cost', coalesce(sum(fu.cost) filter (where fu.kind in ('print', 'failed_print', 'waste')), 0),
      'failed_print_grams', coalesce(sum(fu.grams) filter (where fu.kind = 'failed_print'), 0),
      'by_material', coalesce((
        select jsonb_agg(jsonb_build_object('material', material, 'grams', grams, 'cost', cost) order by grams desc)
        from (
          select fs.material, sum(fu2.grams) grams, coalesce(sum(fu2.cost), 0) cost
          from public.filament_usage fu2
          join public.filament_stock fs on fs.id = fu2.filament_stock_id
          where fu2.created_at >= v_from and fu2.created_at < v_to
            and fu2.kind in ('print', 'failed_print', 'waste')
          group by fs.material
        ) m
      ), '[]'::jsonb)
    )
    from public.filament_usage fu
    where fu.created_at >= v_from and fu.created_at < v_to
  ));

  v_result := v_result || jsonb_build_object(
    'includes_sample_data', exists (select 1 from public.orders where is_sample and order_date >= v_from and order_date < v_to)
  );

  return v_result;
end;
$$;

-- Customer aggregates for the customer list.
create or replace view public.customer_summaries
with (security_invoker = true)
as
select
  c.id,
  c.display_name,
  c.email,
  c.phone,
  c.first_source,
  c.is_sample,
  c.created_at,
  count(o.id) filter (where o.status <> 'cancelled') as order_count,
  coalesce(sum(o.total) filter (where o.status <> 'cancelled'), 0) as total_spend,
  max(o.order_date) as last_order_at,
  array_remove(array_agg(distinct o.source), null) as sources,
  min(o.currency) as currency
from public.customers c
left join public.orders o on o.customer_id = c.id
group by c.id;

-- Filament stock with derived figures
create or replace view public.filament_stock_overview
with (security_invoker = true)
as
select
  fs.*,
  round((fs.remaining_g / nullif(fs.spool_weight_g, 0) * 100)::numeric, 0) as remaining_percent,
  case when fs.purchase_price is not null and fs.spool_weight_g > 0
       then round((fs.purchase_price / fs.spool_weight_g * 1000)::numeric, 2) end as cost_per_kg,
  (fs.remaining_g <= fs.low_stock_threshold_g) as is_low_stock
from public.filament_stock fs;
