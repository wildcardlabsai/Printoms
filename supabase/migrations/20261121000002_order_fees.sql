-- Actual marketplace fees per order (Etsy payment + payment-account ledger,
-- Shopify Payments transaction fees). Read-only copies of marketplace data;
-- additive only. Profit uses actual fees only where they are complete
-- (fee_basis = 'actual'); otherwise the existing estimate is kept.

create table if not exists public.order_fees (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  source public.integration_provider not null,
  kind text not null check (kind in ('processing', 'transaction', 'listing', 'shipping_label', 'advertising', 'tax_on_fees', 'other')),
  -- The marketplace's own name for the fee, shown so it can be checked against statements.
  label text not null,
  -- Positive = a cost to the seller; negative = a fee credited back (e.g. after a refund).
  amount numeric(12,2) not null,
  currency text not null,
  -- False when the line duplicates one already counted (kept for transparency).
  counted boolean not null default true,
  external_ref text not null,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_ref)
);
create index if not exists order_fees_order_idx on public.order_fees (order_id);
alter table public.order_fees enable row level security;
drop policy if exists order_fees_select on public.order_fees;
create policy order_fees_select on public.order_fees for select to authenticated using (public.is_team_member());

alter table public.orders
  add column if not exists fee_basis text check (fee_basis in ('actual', 'partial', 'unavailable')),
  add column if not exists fees_synced_at timestamptz;

-- Upsert fee lines for one order and set its basis. Never deletes lines.
create or replace function public.record_order_fees(p_order_id uuid, p_basis text, p_lines jsonb)
returns void
language plpgsql
as $$
declare
  v_source public.integration_provider;
begin
  select source::text::public.integration_provider into v_source from public.orders where id = p_order_id;
  if v_source is null then raise exception 'Order not found or not a marketplace order'; end if;
  insert into public.order_fees (order_id, source, kind, label, amount, currency, counted, external_ref, raw)
  select p_order_id, v_source, l ->> 'kind', left(l ->> 'label', 200), (l ->> 'amount')::numeric, l ->> 'currency',
         coalesce((l ->> 'counted')::boolean, true), l ->> 'external_ref', coalesce(l -> 'raw', '{}'::jsonb)
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) l
  on conflict (source, external_ref) do update set
    kind = excluded.kind, label = excluded.label, amount = excluded.amount, currency = excluded.currency,
    counted = excluded.counted, raw = excluded.raw, updated_at = now();
  update public.orders set fee_basis = p_basis, fees_synced_at = now() where id = p_order_id;
end;
$$;
revoke execute on function public.record_order_fees(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_order_fees(uuid, text, jsonb) to service_role;

-- Profit uses actual fees where complete (re-created from 20261120000003_vinted.sql;
-- only the fee lines and two counters are new).
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
      case
        -- Actual fees from the marketplace, when complete for this order.
        when o.fee_basis = 'actual' then coalesce((select sum(f.amount) from public.order_fees f where f.order_id = o.id and f.counted), 0)
        else case o.source
        when 'etsy' then o.total * s.etsy_fee_percent / 100.0 + s.etsy_fixed_fee
        when 'shopify' then o.total * s.shopify_fee_percent / 100.0 + s.shopify_fixed_fee
        -- Vinted order totals are already the seller payout (after Vinted's deductions).
        else 0
        end
      end as fees,
      (o.fee_basis = 'actual') as fees_actual,
      coalesce((select sum(sh.shipping_cost) from public.shipments sh where sh.order_id = o.id), 0) as shipping_cost,
      bool_or(ic.unmapped) as has_unmapped
    from o
    left join item_costs ic on ic.order_id = o.id
    group by o.id, o.source, o.total, o.tax_total, o.fee_basis
  )
  select jsonb_build_object(
    'orders', count(*),
    'gross_sales', coalesce(sum(total), 0),
    'tax_collected', coalesce(sum(tax_total), 0),
    'net_revenue', coalesce(sum(total - tax_total), 0),
    'etsy_revenue', coalesce(sum(total - tax_total) filter (where source = 'etsy'), 0),
    'shopify_revenue', coalesce(sum(total - tax_total) filter (where source = 'shopify'), 0),
    'vinted_revenue', coalesce(sum(total - tax_total) filter (where source = 'vinted'), 0),
    'manual_revenue', coalesce(sum(total - tax_total) filter (where source = 'manual'), 0),
    'average_order_value', coalesce(round(avg(total)::numeric, 2), 0),
    'est_marketplace_fees', coalesce(round(sum(fees)::numeric, 2), 0),
    'est_filament_cost', coalesce(round(sum(filament_cost)::numeric, 2), 0),
    'est_packaging_cost', coalesce(round(sum(packaging_cost)::numeric, 2), 0),
    'est_other_cost', coalesce(round(sum(other_cost)::numeric, 2), 0),
    'recorded_shipping_cost', coalesce(round(sum(shipping_cost)::numeric, 2), 0),
    'est_total_costs', coalesce(round(sum(fees + filament_cost + packaging_cost + other_cost + shipping_cost)::numeric, 2), 0),
    'est_profit', coalesce(round(sum((total - tax_total) - (fees + filament_cost + packaging_cost + other_cost + shipping_cost))::numeric, 2), 0),
    'orders_with_unmapped_items', count(*) filter (where has_unmapped),
    'orders_with_actual_fees', count(*) filter (where fees_actual),
    'orders_with_fees', count(*) filter (where source in ('etsy', 'shopify'))
  )
  into v_result
  from order_costs;

  return v_result;
end;
$$;
