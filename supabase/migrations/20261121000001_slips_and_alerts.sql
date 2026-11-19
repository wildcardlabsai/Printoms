-- Packing slips, job tickets and new-order email alerts. Additive only:
-- new nullable/defaulted columns; no existing row is changed.

alter table public.business_settings
  add column if not exists return_address text,
  add column if not exists contact_email text,
  add column if not exists logo_path text,
  add column if not exists slip_message text not null default 'Thank you for your order — we hope you love it! If anything isn’t right, just get in touch and we’ll sort it.',
  add column if not exists slip_show_prices boolean not null default false,
  add column if not exists new_order_alerts_enabled boolean not null default false,
  add column if not exists new_order_alert_email text,
  -- Only orders imported after alerts were switched on are ever alerted.
  add column if not exists new_order_alerts_since timestamptz;

alter table public.business_settings drop constraint if exists business_settings_alert_email_check;
alter table public.business_settings add constraint business_settings_alert_email_check
  check (new_order_alert_email is null or new_order_alert_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
alter table public.business_settings drop constraint if exists business_settings_contact_email_check;
alter table public.business_settings add constraint business_settings_contact_email_check
  check (contact_email is null or contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');

-- When the alert for this order was sent (claimed). Null for every existing order;
-- existing orders are excluded by new_order_alerts_since instead.
alter table public.orders add column if not exists new_order_alert_sent_at timestamptz;
create index if not exists orders_new_order_alert_idx on public.orders (created_at) where new_order_alert_sent_at is null;

-- Claim up to p_limit orders that still need a new-order alert, exactly once.
-- An order qualifies when: alerts are on, it came from a marketplace, it is a
-- real (non-sample) open order, it was imported after alerts were switched on,
-- and it was placed in the last 3 days (so a first import of history never
-- floods the inbox). Concurrent callers never claim the same order.
create or replace function public.claim_new_order_alerts(p_limit int default 50)
returns setof uuid
language plpgsql
as $$
declare
  s record;
begin
  select new_order_alerts_enabled, new_order_alert_email, new_order_alerts_since into s from public.business_settings limit 1;
  if not coalesce(s.new_order_alerts_enabled, false) or s.new_order_alert_email is null or s.new_order_alerts_since is null then
    return;
  end if;
  return query
  update public.orders o
  set new_order_alert_sent_at = now()
  where o.id in (
    select x.id from public.orders x
    where x.new_order_alert_sent_at is null
      and x.source in ('etsy', 'shopify', 'vinted')
      and not x.is_sample
      and x.status not in ('cancelled', 'dispatched', 'completed')
      and x.created_at >= s.new_order_alerts_since
      and x.order_date >= now() - interval '3 days'
    order by x.order_date
    limit greatest(1, least(p_limit, 200))
    for update skip locked
  )
  returning o.id;
end;
$$;

-- Put claimed orders back if the email could not be sent (retried next sync).
create or replace function public.release_new_order_alerts(p_order_ids uuid[])
returns void
language sql
as $$
  update public.orders set new_order_alert_sent_at = null where id = any(p_order_ids);
$$;

revoke execute on function public.claim_new_order_alerts(int) from public, anon, authenticated;
revoke execute on function public.release_new_order_alerts(uuid[]) from public, anon, authenticated;
grant execute on function public.claim_new_order_alerts(int) to service_role;
grant execute on function public.release_new_order_alerts(uuid[]) to service_role;
