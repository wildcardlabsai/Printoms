-- =============================================================================
-- PrintFlow — Phase 2: reliable fulfilment submissions & failed-order management
-- Additive only.
-- =============================================================================

-- ---- Fulfilment submissions (every attempt to send tracking to a marketplace)
create table public.fulfilment_submissions (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  provider public.integration_provider not null,
  attempt integer not null check (attempt >= 1),
  status text not null default 'in_progress'
    check (status in ('in_progress', 'succeeded', 'already_fulfilled', 'failed')),
  error_category text
    check (error_category in ('validation', 'credentials', 'rate_limited', 'marketplace_rejected', 'marketplace_error', 'network', 'unknown')),
  retryable boolean,
  http_status integer,
  request jsonb,            -- what was sent (no secrets)
  response jsonb,           -- what came back (trimmed)
  error_message text,
  external_fulfilment_id text,
  submitted_by uuid references public.profiles (id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index fulfilment_submissions_shipment_idx on public.fulfilment_submissions (shipment_id, started_at desc);
-- Only one submission per shipment may be in flight → no concurrent duplicates.
create unique index fulfilment_submissions_one_in_flight on public.fulfilment_submissions (shipment_id) where status = 'in_progress';

alter table public.fulfilment_submissions enable row level security;
create policy fulfilment_submissions_select on public.fulfilment_submissions for select to authenticated using (public.is_team_member());

alter table public.shipments
  add column marketplace_push_attempts integer not null default 0,
  add column marketplace_push_error_category text,
  add column marketplace_push_last_attempt_at timestamptz;

-- Claim the right to submit (service role). Refuses if already sent or in flight.
-- A submission stuck in_progress for over 10 minutes (crashed run) is closed as
-- an unknown outcome; the next attempt checks the marketplace first.
create or replace function public.begin_fulfilment_submission(
  p_shipment_id uuid,
  p_provider public.integration_provider,
  p_request jsonb,
  p_user uuid
)
returns jsonb
language plpgsql
as $$
declare
  v_shipment record;
  v_id uuid;
  v_attempt integer;
begin
  select s.*, o.id as o_id into v_shipment
  from public.shipments s join public.orders o on o.id = s.order_id
  where s.id = p_shipment_id for update of s;
  if v_shipment.id is null then raise exception 'Shipment not found'; end if;
  if v_shipment.marketplace_push_status = 'sent' then
    raise exception 'Tracking has already been sent to the marketplace for this shipment';
  end if;

  update public.fulfilment_submissions
  set status = 'failed', error_category = 'unknown', retryable = true, finished_at = now(),
      error_message = 'Submission did not finish (interrupted). The marketplace is checked before retrying.'
  where shipment_id = p_shipment_id and status = 'in_progress' and started_at < now() - interval '10 minutes';

  select coalesce(max(attempt), 0) + 1 into v_attempt from public.fulfilment_submissions where shipment_id = p_shipment_id;
  begin
    insert into public.fulfilment_submissions (shipment_id, order_id, provider, attempt, request, submitted_by)
    values (p_shipment_id, v_shipment.o_id, p_provider, v_attempt, p_request, p_user)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'A submission for this shipment is already in progress';
  end;
  update public.shipments set marketplace_push_attempts = v_attempt, marketplace_push_last_attempt_at = now()
  where id = p_shipment_id;
  return jsonb_build_object('submission_id', v_id, 'attempt', v_attempt);
end;
$$;

create or replace function public.finish_fulfilment_submission(
  p_submission_id uuid,
  p_status text,
  p_error_category text default null,
  p_retryable boolean default null,
  p_http_status integer default null,
  p_response jsonb default null,
  p_error_message text default null,
  p_external_id text default null
)
returns void
language plpgsql
as $$
declare
  v_sub record;
  v_label text;
begin
  update public.fulfilment_submissions set
    status = p_status, error_category = p_error_category, retryable = p_retryable, http_status = p_http_status,
    response = p_response, error_message = left(p_error_message, 2000), external_fulfilment_id = p_external_id,
    finished_at = now()
  where id = p_submission_id and status = 'in_progress'
  returning * into v_sub;
  if v_sub.id is null then raise exception 'Submission not found or already finished'; end if;
  v_label := initcap(v_sub.provider::text);

  if p_status in ('succeeded', 'already_fulfilled') then
    update public.shipments set
      marketplace_push_status = 'sent', marketplace_pushed_at = now(), marketplace_push_error = null,
      marketplace_push_error_category = null,
      external_fulfilment_id = coalesce(p_external_id, external_fulfilment_id)
    where id = v_sub.shipment_id;
    perform public.log_activity('order', v_sub.order_id, v_sub.order_id, 'fulfilment.pushed',
      case when p_status = 'already_fulfilled'
        then 'Tracking was already on ' || v_label || ' — recorded as sent without submitting again'
        else 'Tracking sent to ' || v_label end,
      jsonb_build_object('submission_id', v_sub.id, 'attempt', v_sub.attempt), 'Marketplace update');
  else
    update public.shipments set
      marketplace_push_status = 'failed', marketplace_push_error = left(p_error_message, 2000),
      marketplace_push_error_category = p_error_category
    where id = v_sub.shipment_id;
    perform public.log_activity('order', v_sub.order_id, v_sub.order_id, 'fulfilment.failed',
      'Sending tracking to ' || v_label || ' failed (attempt ' || v_sub.attempt || '): ' || coalesce(p_error_message, 'unknown error'),
      jsonb_build_object('submission_id', v_sub.id, 'category', p_error_category, 'retryable', p_retryable), 'Marketplace update');
  end if;
end;
$$;

revoke execute on function public.begin_fulfilment_submission(uuid, public.integration_provider, jsonb, uuid) from public, anon, authenticated;
revoke execute on function public.finish_fulfilment_submission(uuid, text, text, boolean, integer, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.begin_fulfilment_submission(uuid, public.integration_provider, jsonb, uuid) to service_role;
grant execute on function public.finish_fulfilment_submission(uuid, text, text, boolean, integer, jsonb, text, text) to service_role;

-- ---- Failed order management ---------------------------------------------------
alter table public.sync_failures
  add column dismissed_at timestamptz,
  add column dismissed_by uuid references public.profiles (id) on delete set null,
  add column dismiss_reason text,
  add column reopened_at timestamptz,
  add column reopened_by uuid references public.profiles (id) on delete set null;

-- Full history of every failure, retry, dismissal and reopening.
create table public.sync_failure_events (
  id uuid primary key default gen_random_uuid(),
  failure_id uuid not null references public.sync_failures (id) on delete cascade,
  event text not null check (event in ('failed', 'failed_while_dismissed', 'retried', 'resolved', 'dismissed', 'reopened')),
  error text,
  note text,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_label text,
  sync_log_id uuid references public.sync_logs (id) on delete set null,
  created_at timestamptz not null default now()
);
create index sync_failure_events_failure_idx on public.sync_failure_events (failure_id, created_at desc);
alter table public.sync_failure_events enable row level security;
create policy sync_failure_events_select on public.sync_failure_events for select to authenticated using (public.is_team_member());

-- Backfill an initial event for existing failures so their history starts somewhere.
insert into public.sync_failure_events (failure_id, event, error, created_at, actor_label)
select id, 'failed', last_error, first_failed_at, 'Sync' from public.sync_failures
where not exists (select 1 from public.sync_failure_events e where e.failure_id = sync_failures.id);

drop function if exists public.record_sync_failure(public.integration_provider, text, timestamptz, jsonb, text, uuid);

-- Record a failure. A dismissed failure stays dismissed (it never silently
-- reappears) but the new error is still kept in its history.
create or replace function public.record_sync_failure(
  p_provider public.integration_provider,
  p_external_order_id text,
  p_marketplace_updated_at timestamptz,
  p_payload jsonb,
  p_error text,
  p_sync_log_id uuid,
  p_actor_id uuid default null,
  p_actor_label text default 'Sync'
)
returns jsonb
language plpgsql
as $$
declare
  v_row record;
begin
  insert into public.sync_failures (
    integration_id, provider, external_order_id, marketplace_updated_at, payload, last_error, last_sync_log_id
  ) values (
    (select id from public.integrations where provider = p_provider),
    p_provider, p_external_order_id, p_marketplace_updated_at, p_payload, left(p_error, 2000), p_sync_log_id
  )
  on conflict (provider, external_order_id) do update set
    attempts = case when public.sync_failures.resolved_at is null then public.sync_failures.attempts + 1 else 1 end,
    first_failed_at = case when public.sync_failures.resolved_at is null then public.sync_failures.first_failed_at else now() end,
    marketplace_updated_at = greatest(public.sync_failures.marketplace_updated_at, excluded.marketplace_updated_at),
    payload = case
      when public.sync_failures.marketplace_updated_at is null
        or excluded.marketplace_updated_at >= public.sync_failures.marketplace_updated_at then excluded.payload
      else public.sync_failures.payload end,
    last_error = excluded.last_error,
    last_failed_at = now(),
    last_sync_log_id = excluded.last_sync_log_id,
    -- A previously resolved order failing again is a new problem: reopen it.
    -- A dismissed one stays dismissed.
    resolved_at = null,
    resolved_sync_log_id = null,
    dismissed_at = case when public.sync_failures.resolved_at is not null then null else public.sync_failures.dismissed_at end
  returning id, attempts, dismissed_at into v_row;

  insert into public.sync_failure_events (failure_id, event, error, actor_id, actor_label, sync_log_id)
  values (v_row.id, case when v_row.dismissed_at is null then 'failed' else 'failed_while_dismissed' end,
          left(p_error, 2000), p_actor_id, p_actor_label, p_sync_log_id);

  return jsonb_build_object('attempts', v_row.attempts, 'dismissed', v_row.dismissed_at is not null, 'failure_id', v_row.id);
end;
$$;

drop function if exists public.resolve_sync_failure(public.integration_provider, text, uuid);

create or replace function public.resolve_sync_failure(
  p_provider public.integration_provider,
  p_external_order_id text,
  p_sync_log_id uuid,
  p_actor_id uuid default null,
  p_actor_label text default 'Sync'
)
returns boolean
language plpgsql
as $$
declare
  v_id uuid;
begin
  update public.sync_failures
  set resolved_at = now(), resolved_sync_log_id = p_sync_log_id
  where provider = p_provider and external_order_id = p_external_order_id and resolved_at is null
  returning id into v_id;
  if v_id is null then return false; end if;
  insert into public.sync_failure_events (failure_id, event, actor_id, actor_label, sync_log_id)
  values (v_id, 'resolved', p_actor_id, p_actor_label, p_sync_log_id);
  return true;
end;
$$;

revoke execute on function public.record_sync_failure(public.integration_provider, text, timestamptz, jsonb, text, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.resolve_sync_failure(public.integration_provider, text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.record_sync_failure(public.integration_provider, text, timestamptz, jsonb, text, uuid, uuid, text) to service_role;
grant execute on function public.resolve_sync_failure(public.integration_provider, text, uuid, uuid, text) to service_role;

-- Admin actions (security definer with explicit admin check: sync_failures has
-- no write policies for normal users).
create or replace function public.dismiss_sync_failure(p_failure_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Only owners and admins can dismiss failed orders' using errcode = '42501'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason for dismissing this failure'; end if;
  update public.sync_failures
  set dismissed_at = now(), dismissed_by = (select auth.uid()), dismiss_reason = trim(p_reason)
  where id = p_failure_id and resolved_at is null and dismissed_at is null;
  if not found then raise exception 'Only open failures can be dismissed'; end if;
  insert into public.sync_failure_events (failure_id, event, note, actor_id)
  values (p_failure_id, 'dismissed', trim(p_reason), (select auth.uid()));
end;
$$;

create or replace function public.reopen_sync_failure(p_failure_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Only owners and admins can reopen failed orders' using errcode = '42501'; end if;
  update public.sync_failures
  set dismissed_at = null, reopened_at = now(), reopened_by = (select auth.uid())
  where id = p_failure_id and dismissed_at is not null and resolved_at is null;
  if not found then raise exception 'Only dismissed failures can be reopened'; end if;
  insert into public.sync_failure_events (failure_id, event, note, actor_id)
  values (p_failure_id, 'reopened', nullif(trim(coalesce(p_note, '')), ''), (select auth.uid()));
end;
$$;

revoke execute on function public.dismiss_sync_failure(uuid, text) from public, anon;
revoke execute on function public.reopen_sync_failure(uuid, text) from public, anon;
grant execute on function public.dismiss_sync_failure(uuid, text) to authenticated, service_role;
grant execute on function public.reopen_sync_failure(uuid, text) to authenticated, service_role;
