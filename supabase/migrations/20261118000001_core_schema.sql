-- =============================================================================
-- PrintFlow — core schema
-- -----------------------------------------------------------------------------
-- Conventions
--   * UUID primary keys (gen_random_uuid()).
--   * created_at / updated_at on every mutable table (updated_at via trigger).
--   * Marketplace-owned columns are kept separate from internal production
--     columns so marketplace re-syncs never overwrite internal work.
--   * `is_sample` marks development sample data so it can be identified in the
--     UI and purged without touching real business records.
-- =============================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- -----------------------------------------------------------------------------
-- Enumerated types
-- -----------------------------------------------------------------------------
create type public.user_role as enum ('owner', 'admin', 'staff', 'viewer');
create type public.order_source as enum ('etsy', 'shopify', 'manual');
create type public.payment_status as enum (
  'pending', 'paid', 'partially_paid', 'partially_refunded', 'refunded', 'voided', 'unknown'
);
-- Internal operational status of an order (not the marketplace's status).
create type public.order_status as enum (
  'new', 'in_production', 'ready_to_pack', 'packed', 'dispatched', 'completed', 'on_hold', 'cancelled'
);
create type public.production_stage as enum (
  'new_order', 'awaiting_preparation', 'ready_to_print', 'printing', 'quality_check',
  'ready_to_pack', 'dispatched', 'completed', 'on_hold'
);
create type public.priority_level as enum ('low', 'normal', 'high', 'urgent');
create type public.printer_status as enum ('available', 'printing', 'paused', 'maintenance', 'offline');
create type public.print_run_status as enum ('printing', 'succeeded', 'failed', 'cancelled');
create type public.queue_status as enum ('queued', 'active', 'done', 'removed');
create type public.integration_provider as enum ('etsy', 'shopify');
create type public.integration_status as enum ('not_connected', 'connected', 'error', 'disabled');
create type public.sync_trigger as enum ('scheduled', 'manual', 'initial', 'webhook');
create type public.sync_status as enum ('running', 'success', 'partial', 'failed');
create type public.shipment_status as enum ('pending', 'packed', 'dispatched', 'delivered', 'returned', 'cancelled');
create type public.marketplace_push_status as enum ('not_required', 'pending', 'sent', 'failed');
create type public.filament_usage_kind as enum ('print', 'failed_print', 'adjustment', 'waste');

-- -----------------------------------------------------------------------------
-- Shared trigger: maintain updated_at
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- profiles — one row per auth user
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role public.user_role not null default 'staff',
  -- New accounts (other than the first owner) start inactive and must be
  -- approved by an owner/admin before they can see any business data.
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (lower(email));

-- -----------------------------------------------------------------------------
-- business_settings — single row of business-wide configuration
-- -----------------------------------------------------------------------------
create table public.business_settings (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  business_name text not null default 'My Print Business',
  currency char(3) not null default 'GBP',
  timezone text not null default 'Europe/London',
  default_dispatch_days integer not null default 3 check (default_dispatch_days between 0 and 60),
  -- Cost assumptions used ONLY for *estimated* profit. Never accounting truth.
  etsy_fee_percent numeric(6,3) not null default 9.5 check (etsy_fee_percent >= 0),
  etsy_fixed_fee numeric(10,2) not null default 0.45 check (etsy_fixed_fee >= 0),
  shopify_fee_percent numeric(6,3) not null default 2.2 check (shopify_fee_percent >= 0),
  shopify_fixed_fee numeric(10,2) not null default 0.20 check (shopify_fixed_fee >= 0),
  default_packaging_cost numeric(10,2) not null default 0.50 check (default_packaging_cost >= 0),
  default_filament_cost_per_kg numeric(10,2) not null default 18.00 check (default_filament_cost_per_kg >= 0),
  packing_checklist text[] not null default array[
    'Items match order and quantities',
    'Personalisation checked',
    'Quality inspected',
    'Protective packaging added',
    'Shipping label attached'
  ],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- customers — unified customer records across marketplaces
-- -----------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  email text,
  phone text,
  notes text,
  first_source public.order_source,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customers_email_idx on public.customers (lower(email)) where email is not null;
create index customers_name_trgm_idx on public.customers using gin (display_name gin_trgm_ops);

-- A customer may have several marketplace identities. Matching is ONLY by
-- marketplace customer id or exact email — never by name alone.
create table public.customer_identities (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  source public.order_source not null,
  external_customer_id text not null,
  created_at timestamptz not null default now(),
  unique (source, external_customer_id)
);
create index customer_identities_customer_idx on public.customer_identities (customer_id);

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  name text,
  line1 text,
  line2 text,
  city text,
  region text,
  postal_code text,
  country_code text,
  phone text,
  -- Deterministic fingerprint so the same address is not stored twice.
  fingerprint text generated always as (
    lower(regexp_replace(
      coalesce(line1, '') || '|' || coalesce(postal_code, '') || '|' || coalesce(country_code, ''),
      '\s+', '', 'g'
    ))
  ) stored,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, fingerprint)
);

-- -----------------------------------------------------------------------------
-- printers
-- -----------------------------------------------------------------------------
create table public.printers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  manufacturer text not null,
  model text not null,
  printer_type text not null default 'FDM',
  build_volume_x_mm integer check (build_volume_x_mm > 0),
  build_volume_y_mm integer check (build_volume_y_mm > 0),
  build_volume_z_mm integer check (build_volume_z_mm > 0),
  nozzle_size_mm numeric(4,2) default 0.4 check (nozzle_size_mm > 0),
  supported_materials text[] not null default array['PLA', 'PLA+', 'PETG'],
  has_multi_material boolean not null default false,
  status public.printer_status not null default 'available',
  current_job_id uuid,          -- FK added after production_jobs exists
  current_print_run_id uuid,    -- FK added after print_runs exists
  estimated_completion_at timestamptz,
  maintenance_notes text,
  -- Live monitoring is NOT implemented. This flag documents that statuses are
  -- set manually by staff until a real printer integration exists.
  monitoring_source text not null default 'manual' check (monitoring_source in ('manual')),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- filament_stock
-- -----------------------------------------------------------------------------
create table public.filament_stock (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  material text not null,             -- PLA, PLA+, PETG, ... (free text for future materials)
  colour text not null,
  colour_hex text check (colour_hex is null or colour_hex ~ '^#[0-9A-Fa-f]{6}$'),
  spool_weight_g integer not null check (spool_weight_g > 0),
  remaining_g numeric(10,1) not null check (remaining_g >= 0),
  purchase_price numeric(10,2) check (purchase_price >= 0),
  supplier text,
  purchase_date date,
  low_stock_threshold_g integer not null default 200 check (low_stock_threshold_g >= 0),
  notes text,
  is_archived boolean not null default false,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index filament_stock_material_idx on public.filament_stock (material, colour);

-- -----------------------------------------------------------------------------
-- products & marketplace listings
-- -----------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text not null,
  description text,
  category text,
  image_path text,                     -- Supabase Storage path in product-images bucket
  model_file_ref text,                 -- STL/3MF reference (storage path or external URL)
  estimated_print_minutes integer check (estimated_print_minutes >= 0),
  material text,
  default_colour text,
  estimated_filament_g numeric(10,1) check (estimated_filament_g >= 0),
  default_printer_id uuid references public.printers (id) on delete set null,
  production_instructions text,
  base_price numeric(10,2) check (base_price >= 0),
  material_cost numeric(10,2) check (material_cost >= 0),      -- override; else estimated from grams
  packaging_cost numeric(10,2) check (packaging_cost >= 0),
  labour_cost numeric(10,2) check (labour_cost >= 0),
  other_cost numeric(10,2) check (other_cost >= 0),
  is_active boolean not null default true,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index products_sku_key on public.products (lower(sku));
create index products_name_trgm_idx on public.products using gin (name gin_trgm_ops);

-- Etsy listing IDs and Shopify product/variant IDs are NOT interchangeable,
-- so each listing is its own row keyed by (source, listing, variant).
create table public.product_listings (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  source public.integration_provider not null,
  external_listing_id text not null,   -- Etsy listing_id / Shopify product GID
  external_variant_id text,            -- Etsy product_id / Shopify variant GID
  external_sku text,
  title text,
  url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (source, external_listing_id, external_variant_id)
);
create index product_listings_product_idx on public.product_listings (product_id);

-- -----------------------------------------------------------------------------
-- orders
-- -----------------------------------------------------------------------------
create sequence public.order_number_seq start 1001;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('PF-' || nextval('public.order_number_seq')::text),
  source public.order_source not null,
  external_order_id text,              -- marketplace receipt/order id (null for manual)
  external_order_number text,          -- human-facing marketplace number, e.g. Shopify "#1042"
  customer_id uuid references public.customers (id) on delete set null,

  -- Marketplace-owned snapshot (overwritten on sync)
  customer_name text not null,
  customer_email text,
  shipping_address jsonb not null default '{}'::jsonb,
  order_date timestamptz not null default now(),
  payment_status public.payment_status not null default 'unknown',
  marketplace_status text,             -- raw status string from the marketplace
  marketplace_fulfilment_status text,
  currency char(3) not null default 'GBP',
  subtotal numeric(12,2) not null default 0,
  shipping_total numeric(12,2) not null default 0,
  tax_total numeric(12,2) not null default 0,
  discount_total numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  customer_note text,
  shipping_method text,
  marketplace_dispatch_by timestamptz, -- deadline as supplied by the marketplace
  marketplace_updated_at timestamptz,
  marketplace_cancelled_at timestamptz,
  last_synced_at timestamptz,

  -- Internal (never overwritten by sync)
  status public.order_status not null default 'new',
  priority public.priority_level not null default 'normal',
  dispatch_by timestamptz,             -- working deadline (defaults from marketplace)
  production_notes text,
  tracking_number text,
  carrier text,
  dispatched_at timestamptz,
  completed_at timestamptz,
  is_sample boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,

  search_text text generated always as (
    lower(
      order_number || ' ' || coalesce(external_order_id, '') || ' ' ||
      coalesce(external_order_number, '') || ' ' || customer_name || ' ' ||
      coalesce(customer_email, '') || ' ' || coalesce(tracking_number, '')
    )
  ) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Duplicate prevention: one row per marketplace order.
  constraint orders_source_external_key unique (source, external_order_id),
  constraint orders_external_id_required check (source = 'manual' or external_order_id is not null),
  constraint orders_totals_non_negative check (subtotal >= 0 and shipping_total >= 0 and tax_total >= 0 and discount_total >= 0 and total >= 0)
);
create index orders_status_idx on public.orders (status);
create index orders_order_date_idx on public.orders (order_date desc);
create index orders_dispatch_by_idx on public.orders (dispatch_by) where status not in ('dispatched', 'completed', 'cancelled');
create index orders_customer_idx on public.orders (customer_id);
create index orders_source_idx on public.orders (source, order_date desc);
create index orders_search_trgm_idx on public.orders using gin (search_text gin_trgm_ops);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  external_line_item_id text,          -- Etsy transaction_id / Shopify line item GID
  external_listing_id text,
  external_variant_id text,
  sku text,
  title text not null,
  variant_title text,
  variant_details jsonb not null default '[]'::jsonb,  -- [{name, value}]
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  total_price numeric(12,2) not null default 0 check (total_price >= 0),
  personalisation text,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls distinct (order_id, external_line_item_id)
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);

-- -----------------------------------------------------------------------------
-- production
-- -----------------------------------------------------------------------------
create table public.production_jobs (
  id uuid primary key default gen_random_uuid(),
  job_number text not null unique default ('JOB-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  order_id uuid not null references public.orders (id) on delete cascade,
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  stage public.production_stage not null default 'new_order',
  stage_before_hold public.production_stage,
  priority public.priority_level not null default 'normal',
  quantity integer not null check (quantity > 0),
  printer_id uuid references public.printers (id) on delete set null,
  estimated_print_minutes integer check (estimated_print_minutes >= 0),
  material text,
  colour text,
  estimated_filament_g numeric(10,1) check (estimated_filament_g >= 0),
  print_requirements text,
  notes text,
  due_date timestamptz,
  attempt_count integer not null default 0,
  failed_attempts integer not null default 0,
  board_position double precision not null default extract(epoch from now()),
  stage_changed_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One job per order line. Reprints are print_runs, never new jobs/orders.
  unique (order_item_id)
);
create index production_jobs_stage_idx on public.production_jobs (stage, board_position);
create index production_jobs_order_idx on public.production_jobs (order_id);
create index production_jobs_printer_idx on public.production_jobs (printer_id);

create table public.print_queue (
  id uuid primary key default gen_random_uuid(),
  printer_id uuid not null references public.printers (id) on delete cascade,
  production_job_id uuid not null references public.production_jobs (id) on delete cascade,
  position double precision not null default extract(epoch from now()),
  status public.queue_status not null default 'queued',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- A job can only be waiting in one queue at a time.
create unique index print_queue_job_open_key on public.print_queue (production_job_id) where status in ('queued', 'active');
create index print_queue_printer_idx on public.print_queue (printer_id, status, position);

create table public.print_runs (
  id uuid primary key default gen_random_uuid(),
  production_job_id uuid not null references public.production_jobs (id) on delete cascade,
  printer_id uuid references public.printers (id) on delete set null,
  attempt_number integer not null default 1,
  status public.print_run_status not null default 'printing',
  quantity integer not null default 1 check (quantity > 0),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  estimated_minutes integer,
  failure_reason text,
  notes text,
  filament_recorded boolean not null default false,
  started_by uuid references public.profiles (id) on delete set null,
  ended_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint print_runs_failure_reason check (status <> 'failed' or failure_reason is not null)
);
create index print_runs_job_idx on public.print_runs (production_job_id);
create index print_runs_printer_idx on public.print_runs (printer_id, started_at desc);
create index print_runs_status_idx on public.print_runs (status, started_at desc);

alter table public.printers
  add constraint printers_current_job_fk foreign key (current_job_id) references public.production_jobs (id) on delete set null,
  add constraint printers_current_run_fk foreign key (current_print_run_id) references public.print_runs (id) on delete set null;

-- Filament consumption ledger. Stock is only deducted when a row is recorded
-- here — i.e. when actual consumption has been entered/confirmed by a person.
create table public.filament_usage (
  id uuid primary key default gen_random_uuid(),
  filament_stock_id uuid not null references public.filament_stock (id) on delete cascade,
  print_run_id uuid references public.print_runs (id) on delete set null,
  production_job_id uuid references public.production_jobs (id) on delete set null,
  kind public.filament_usage_kind not null default 'print',
  grams numeric(10,1) not null check (grams <> 0),
  cost numeric(10,2),
  note text,
  recorded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index filament_usage_stock_idx on public.filament_usage (filament_stock_id, created_at desc);
create index filament_usage_job_idx on public.filament_usage (production_job_id);

-- -----------------------------------------------------------------------------
-- shipments
-- -----------------------------------------------------------------------------
create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  status public.shipment_status not null default 'pending',
  carrier text,
  shipping_method text,
  tracking_number text,
  tracking_url text,
  packaging_notes text,
  checklist jsonb not null default '[]'::jsonb,   -- [{label, done}]
  shipping_cost numeric(10,2) check (shipping_cost >= 0),
  packed_at timestamptz,
  packed_by uuid references public.profiles (id) on delete set null,
  dispatched_at timestamptz,
  dispatched_by uuid references public.profiles (id) on delete set null,
  -- Prepared for pushing fulfilment back to Etsy/Shopify.
  marketplace_push_status public.marketplace_push_status not null default 'not_required',
  marketplace_push_error text,
  marketplace_pushed_at timestamptz,
  external_fulfilment_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shipments_order_idx on public.shipments (order_id);
create index shipments_status_idx on public.shipments (status, dispatched_at desc);

-- -----------------------------------------------------------------------------
-- integrations, credentials & sync logs
-- -----------------------------------------------------------------------------
create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  provider public.integration_provider not null unique,
  status public.integration_status not null default 'not_connected',
  display_name text,
  external_shop_id text,
  shop_domain text,
  scopes text[] not null default '{}',
  connected_at timestamptz,
  connected_by uuid references public.profiles (id) on delete set null,
  sync_enabled boolean not null default true,
  sync_interval_minutes integer not null default 10 check (sync_interval_minutes between 5 and 1440),
  initial_import_days integer not null default 60 check (initial_import_days between 1 and 365),
  sync_cursor timestamptz,             -- high-water mark of marketplace updated_at
  last_sync_started_at timestamptz,
  last_sync_finished_at timestamptz,
  last_successful_sync_at timestamptz,
  next_sync_at timestamptz,
  sync_locked_until timestamptz,
  consecutive_failures integer not null default 0,
  last_error text,
  last_error_at timestamptz,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Secrets live in their own table. RLS is enabled with NO policies, so only
-- the server-side service role can read/write it. Values are additionally
-- encrypted by the application (AES-256-GCM) before storage.
create table public.integration_credentials (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null unique references public.integrations (id) on delete cascade,
  access_token_encrypted text,
  refresh_token_encrypted text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid references public.integrations (id) on delete set null,
  provider public.integration_provider not null,
  trigger public.sync_trigger not null,
  status public.sync_status not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  cursor_from timestamptz,
  cursor_to timestamptz,
  pages_fetched integer not null default 0,
  orders_fetched integer not null default 0,
  orders_created integer not null default 0,
  orders_updated integer not null default 0,
  orders_failed integer not null default 0,
  error_message text,
  error_details jsonb,
  triggered_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index sync_logs_provider_idx on public.sync_logs (provider, started_at desc);

-- -----------------------------------------------------------------------------
-- notes & activity history
-- -----------------------------------------------------------------------------
create table public.internal_notes (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('order', 'customer', 'product', 'production_job', 'printer')),
  entity_id uuid not null,
  body text not null check (length(trim(body)) > 0),
  author_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index internal_notes_entity_idx on public.internal_notes (entity_type, entity_id, created_at desc);

-- Append-only, audit-friendly activity history.
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid,
  order_id uuid references public.orders (id) on delete cascade,
  action text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_label text,                    -- e.g. "Etsy sync" for system actions
  created_at timestamptz not null default now()
);
create index activity_log_entity_idx on public.activity_log (entity_type, entity_id, created_at desc);
create index activity_log_order_idx on public.activity_log (order_id, created_at desc);
create index activity_log_created_idx on public.activity_log (created_at desc);

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'business_settings', 'customers', 'customer_addresses', 'printers',
    'filament_stock', 'products', 'product_listings', 'orders', 'order_items',
    'production_jobs', 'print_queue', 'print_runs', 'shipments', 'integrations',
    'integration_credentials', 'internal_notes'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end;
$$;
