-- Product import from marketplace listings, without duplicates.
--
-- import_marketplace_listing applies ONE reviewed decision for ONE listing:
--   * already linked (any variant)  → refresh the listing's title/link/active flag only
--   * 'link'   → link the listing to an existing product (fills only BLANK product fields)
--   * 'create' → create a product (listing SKU if free, else a generated SKU) and link it
--   * 'skip'   → nothing
-- A per-listing advisory lock makes concurrent/double imports safe, and the
-- unique (source, external_listing_id, external_variant_id) index is the final
-- guard. Existing order lines for the listing that had no product are linked.
-- Additive only: no existing rows are changed except blank fields on a product
-- the user chose to link to, and unmapped order lines/jobs.

create or replace function public.import_marketplace_listing(
  p_source public.integration_provider,
  p_listing jsonb,
  p_action text,
  p_product_id uuid default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_ext text := nullif(trim(p_listing ->> 'external_listing_id'), '');
  v_title text := left(coalesce(nullif(trim(p_listing ->> 'title'), ''), 'Untitled listing'), 200);
  v_url text := nullif(trim(p_listing ->> 'url'), '');
  v_active boolean := coalesce((p_listing ->> 'is_active')::boolean, true);
  v_price numeric := nullif(p_listing ->> 'price', '')::numeric;
  v_desc text := nullif(trim(p_listing ->> 'description'), '');
  v_category text := nullif(trim(p_listing ->> 'category'), '');
  v_first_sku text := nullif(trim(p_listing -> 'skus' ->> 0), '');
  v_product uuid;
  v_sku text;
  v_base text;
  v_n int := 1;
  v_result text;
  v_lines int := 0;
  v_label text := case p_source::text when 'etsy' then 'Etsy' when 'shopify' then 'Shopify' else initcap(p_source::text) end;
begin
  perform public.assert_can_write();
  if v_ext is null then raise exception 'This listing has no marketplace ID'; end if;
  if p_action not in ('link', 'create', 'skip', 'keep') then raise exception 'Unknown import action: %', p_action; end if;
  if v_price is not null and v_price < 0 then v_price := null; end if;

  perform pg_advisory_xact_lock(hashtextextended('listing:' || p_source::text || ':' || v_ext, 0));

  -- Already linked: refresh listing details only. Product details are never overwritten.
  select pl.product_id into v_product
  from public.product_listings pl
  where pl.source = p_source and pl.external_listing_id = v_ext
  order by (pl.external_variant_id is null) desc
  limit 1;

  if v_product is not null then
    update public.product_listings
    set title = v_title, url = coalesce(v_url, url), is_active = v_active
    where source = p_source and external_listing_id = v_ext
      and (title is distinct from v_title or url is distinct from coalesce(v_url, url) or is_active is distinct from v_active);
    v_result := 'already_linked';
  elsif p_action in ('skip', 'keep') then
    return jsonb_build_object('result', 'skipped', 'product_id', null);
  elsif p_action = 'link' then
    select id into v_product from public.products where id = p_product_id;
    if v_product is null then raise exception 'The product chosen for "%" no longer exists', v_title; end if;
    update public.products
    set description = coalesce(description, v_desc),
        base_price = coalesce(base_price, v_price),
        category = coalesce(category, v_category)
    where id = v_product and (description is null or base_price is null or category is null);
    v_result := 'linked';
  else
    -- create: use a listing SKU nobody else has, otherwise generate one.
    select s into v_sku
    from jsonb_array_elements_text(coalesce(p_listing -> 'skus', '[]'::jsonb)) s
    where nullif(trim(s), '') is not null
      and not exists (select 1 from public.products p where lower(p.sku) = lower(trim(s)))
    limit 1;
    if v_sku is null then
      v_base := upper(p_source::text) || '-' || regexp_replace(v_ext, '^.*/', '');
      v_sku := v_base;
      while exists (select 1 from public.products p where lower(p.sku) = lower(v_sku)) loop
        v_n := v_n + 1;
        v_sku := v_base || '-' || v_n;
      end loop;
    end if;
    insert into public.products (name, sku, description, base_price, category, is_active)
    values (v_title, trim(v_sku), v_desc, v_price, v_category, v_active)
    returning id into v_product;
    v_result := 'created';
  end if;

  if v_result in ('linked', 'created') then
    insert into public.product_listings (product_id, source, external_listing_id, external_variant_id, external_sku, title, url, is_active)
    values (v_product, p_source, v_ext, null, v_first_sku, v_title, v_url, v_active)
    on conflict do nothing;

    insert into public.activity_log (entity_type, entity_id, action, message, metadata, actor_id)
    values ('product', v_product, 'product.' || v_result || '_from_listing',
      case v_result when 'created' then 'Created from ' || v_label || ' listing “' || v_title || '”'
                    else 'Linked to ' || v_label || ' listing “' || v_title || '”' end,
      jsonb_build_object('source', p_source, 'external_listing_id', v_ext),
      (select auth.uid()));
  end if;

  -- Order lines already imported for this listing without a product.
  update public.order_items oi
  set product_id = v_product
  from public.orders o
  where o.id = oi.order_id and o.source::text = p_source::text
    and oi.product_id is null and oi.external_listing_id = v_ext;
  get diagnostics v_lines = row_count;
  if v_lines > 0 then
    update public.production_jobs j
    set product_id = v_product
    from public.order_items oi
    where j.order_item_id = oi.id and oi.product_id = v_product and j.product_id is null;
  end if;

  return jsonb_build_object(
    'result', v_result,
    'product_id', v_product,
    'order_lines_linked', v_lines,
    'needs_image', (select image_path is null from public.products where id = v_product)
  );
end;
$$;

revoke execute on function public.import_marketplace_listing(public.integration_provider, jsonb, text, uuid) from public, anon;
grant execute on function public.import_marketplace_listing(public.integration_provider, jsonb, text, uuid) to authenticated, service_role;
