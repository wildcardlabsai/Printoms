-- =============================================================================
-- PrintFlow — Phase 2: production quantities & physical unit tracking
-- -----------------------------------------------------------------------------
-- Distinguishes three things that were previously one:
--   production_jobs  = the production REQUIREMENT for one order line
--                      (quantity = how many physical items are needed)
--   print_runs       = one go on a printer; may contain several units
--   production_units = the PHYSICAL items (one row per unit), each with its own
--                      status, failure count and the personalisation it was
--                      printed with
--   print_run_units  = which units were on which run, and the outcome
--
-- Additive only. Existing jobs/runs are backfilled from their current state;
-- no existing row is deleted. Numbered after 20261119000001 so it sorts after
-- the Phase 1 migration.
-- =============================================================================

create type public.unit_status as enum ('pending', 'printing', 'printed', 'passed', 'cancelled', 'surplus');

-- ---- Job columns -------------------------------------------------------------
alter table public.production_jobs
  -- Denormalised unit counts (maintained by trigger) for fast boards/lists.
  add column quantity_printed integer not null default 0,   -- printed + passed QC
  add column quantity_passed integer not null default 0,
  add column quantity_pending integer not null default 0,   -- still to print
  add column quantity_printing integer not null default 0,
  add column quantity_surplus integer not null default 0,   -- printed but no longer needed
  add column units_failed integer not null default 0,       -- cumulative failed unit attempts
  -- A job closed because its order/line was cancelled. Kept for history.
  add column cancelled_at timestamptz,
  add column cancellation_reason text;

-- ---- Units ------------------------------------------------------------------
create table public.production_units (
  id uuid primary key default gen_random_uuid(),
  production_job_id uuid not null references public.production_jobs (id) on delete cascade,
  unit_number integer not null check (unit_number > 0),
  status public.unit_status not null default 'pending',
  failed_attempts integer not null default 0,
  last_print_run_id uuid references public.print_runs (id) on delete set null,
  -- What was physically printed (snapshot at print start) so later marketplace
  -- changes to personalisation/variants can be detected against real items.
  printed_personalisation text,
  printed_variant text,
  printed_at timestamptz,
  passed_at timestamptz,
  completed_without_print boolean not null default false,
  status_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (production_job_id, unit_number)
);
create index production_units_job_idx on public.production_units (production_job_id, status);

create trigger production_units_set_updated_at
  before update on public.production_units
  for each row execute function public.set_updated_at();

create table public.print_run_units (
  print_run_id uuid not null references public.print_runs (id) on delete cascade,
  unit_id uuid not null references public.production_units (id) on delete cascade,
  outcome text not null default 'printing' check (outcome in ('printing', 'succeeded', 'failed')),
  created_at timestamptz not null default now(),
  primary key (print_run_id, unit_id)
);
create index print_run_units_unit_idx on public.print_run_units (unit_id);

alter table public.print_runs
  add column quantity_succeeded integer check (quantity_succeeded >= 0),
  add column quantity_failed integer check (quantity_failed >= 0);

alter table public.production_units enable row level security;
alter table public.print_run_units enable row level security;
create policy production_units_select on public.production_units for select to authenticated using (public.is_team_member());
create policy production_units_write on public.production_units for all to authenticated using (public.can_write()) with check (public.can_write());
create policy print_run_units_select on public.print_run_units for select to authenticated using (public.is_team_member());
create policy print_run_units_write on public.print_run_units for all to authenticated using (public.can_write()) with check (public.can_write());

-- ---- Counter maintenance -------------------------------------------------------
create or replace function public.refresh_job_unit_counts(p_job_id uuid)
returns void
language sql
as $$
  update public.production_jobs j set
    quantity_printed = c.printed,
    quantity_passed = c.passed,
    quantity_pending = c.pending,
    quantity_printing = c.printing,
    quantity_surplus = c.surplus,
    units_failed = c.failed
  from (
    select
      count(*) filter (where status in ('printed', 'passed')) as printed,
      count(*) filter (where status = 'passed') as passed,
      count(*) filter (where status = 'pending') as pending,
      count(*) filter (where status = 'printing') as printing,
      count(*) filter (where status = 'surplus') as surplus,
      coalesce(sum(failed_attempts), 0) as failed
    from public.production_units where production_job_id = p_job_id
  ) c
  where j.id = p_job_id
    and (j.quantity_printed, j.quantity_passed, j.quantity_pending, j.quantity_printing, j.quantity_surplus, j.units_failed)
        is distinct from (c.printed::int, c.passed::int, c.pending::int, c.printing::int, c.surplus::int, c.failed::int);
$$;

create or replace function public.production_units_after_write()
returns trigger
language plpgsql
as $$
begin
  perform public.refresh_job_unit_counts(coalesce(new.production_job_id, old.production_job_id));
  return null;
end;
$$;

create trigger production_units_after_write
  after insert or update or delete on public.production_units
  for each row execute function public.production_units_after_write();

-- Make the active units (pending/printing/printed/passed) match job.quantity.
-- Never touches units that are printing. Excess is removed from pending units
-- first (→ cancelled), then printed units become surplus (they physically exist).
create or replace function public.sync_job_units(p_job_id uuid, p_reason text default null)
returns jsonb
language plpgsql
as $$
declare
  v_qty integer;
  v_active integer;
  v_next integer;
  v_added integer := 0;
  v_cancelled integer := 0;
  v_surplus integer := 0;
  v_excess integer;
begin
  select quantity into v_qty from public.production_jobs where id = p_job_id;
  if v_qty is null then return '{}'::jsonb; end if;

  select count(*) into v_active from public.production_units
  where production_job_id = p_job_id and status in ('pending', 'printing', 'printed', 'passed');

  if v_active < v_qty then
    select coalesce(max(unit_number), 0) into v_next from public.production_units where production_job_id = p_job_id;
    insert into public.production_units (production_job_id, unit_number)
    select p_job_id, v_next + g from generate_series(1, v_qty - v_active) g;
    v_added := v_qty - v_active;
  elsif v_active > v_qty then
    v_excess := v_active - v_qty;
    with picked as (
      select id from public.production_units
      where production_job_id = p_job_id and status = 'pending'
      order by unit_number desc limit v_excess
    )
    update public.production_units u set status = 'cancelled', status_reason = coalesce(p_reason, 'Quantity reduced')
    from picked where u.id = picked.id;
    get diagnostics v_cancelled = row_count;
    v_excess := v_excess - v_cancelled;
    if v_excess > 0 then
      with picked as (
        select id from public.production_units
        where production_job_id = p_job_id and status in ('printed', 'passed')
        order by (status = 'passed'), unit_number desc limit v_excess
      )
      update public.production_units u set status = 'surplus', status_reason = coalesce(p_reason, 'Quantity reduced after printing')
      from picked where u.id = picked.id;
      get diagnostics v_surplus = row_count;
    end if;
  end if;
  return jsonb_build_object('added', v_added, 'cancelled', v_cancelled, 'surplus', v_surplus);
end;
$$;

create or replace function public.production_jobs_sync_units()
returns trigger
language plpgsql
as $$
begin
  perform public.sync_job_units(new.id);
  return null;
end;
$$;

create trigger production_jobs_sync_units_insert
  after insert on public.production_jobs
  for each row execute function public.production_jobs_sync_units();
create trigger production_jobs_sync_units_quantity
  after update of quantity on public.production_jobs
  for each row when (old.quantity is distinct from new.quantity)
  execute function public.production_jobs_sync_units();

-- When a job is moved to Ready to Pack / Dispatched / Completed, its printed
-- units are treated as passed. Units that were never printed (e.g. supplied
-- from stock) are flagged completed_without_print so history stays honest.
create or replace function public.production_jobs_complete_units()
returns trigger
language plpgsql
as $$
begin
  if new.stage in ('ready_to_pack', 'dispatched', 'completed')
     and old.stage not in ('ready_to_pack', 'dispatched', 'completed') then
    update public.production_units set
      completed_without_print = (status = 'pending'),
      status = 'passed',
      passed_at = coalesce(passed_at, now())
    where production_job_id = new.id and status in ('pending', 'printed');
  end if;
  return null;
end;
$$;

create trigger production_jobs_complete_units
  after update of stage on public.production_jobs
  for each row when (old.stage is distinct from new.stage)
  execute function public.production_jobs_complete_units();

-- ---- Backfill existing jobs & runs (derived from current state) ----------------
-- Insert units without firing the per-row counter trigger thousands of times.
alter table public.production_units disable trigger production_units_after_write;

insert into public.production_units (production_job_id, unit_number, status, printed_at, passed_at, last_print_run_id)
select
  j.id,
  g,
  case
    when coalesce(case when j.stage = 'on_hold' then j.stage_before_hold end, j.stage) = 'printing' then 'printing'::public.unit_status
    when coalesce(case when j.stage = 'on_hold' then j.stage_before_hold end, j.stage) = 'quality_check' then 'printed'::public.unit_status
    when coalesce(case when j.stage = 'on_hold' then j.stage_before_hold end, j.stage) in ('ready_to_pack', 'dispatched', 'completed') then 'passed'::public.unit_status
    else 'pending'::public.unit_status
  end,
  case when j.stage in ('quality_check', 'ready_to_pack', 'dispatched', 'completed') then coalesce(j.completed_at, j.updated_at) end,
  case when j.stage in ('ready_to_pack', 'dispatched', 'completed') then coalesce(j.completed_at, j.updated_at) end,
  (select r.id from public.print_runs r where r.production_job_id = j.id order by r.started_at desc limit 1)
from public.production_jobs j
cross join lateral generate_series(1, j.quantity) g
where not exists (select 1 from public.production_units u where u.production_job_id = j.id);

alter table public.production_units enable trigger production_units_after_write;

-- Historical runs keep their record; link them to the job's units.
insert into public.print_run_units (print_run_id, unit_id, outcome)
select r.id, u.id,
  case r.status when 'printing' then 'printing' when 'failed' then 'failed' else 'succeeded' end
from public.print_runs r
join public.production_units u on u.production_job_id = r.production_job_id and u.unit_number <= r.quantity
where r.status in ('printing', 'succeeded', 'failed')
on conflict do nothing;

update public.print_runs set
  quantity_succeeded = case status when 'succeeded' then quantity when 'failed' then 0 end,
  quantity_failed = case status when 'failed' then quantity when 'succeeded' then 0 end
where status in ('succeeded', 'failed') and quantity_succeeded is null;

select public.refresh_job_unit_counts(id) from public.production_jobs;

-- ---- Print workflow (replaces previous versions; old calls still work) -------
drop function if exists public.start_print_run(uuid, uuid, integer);

create or replace function public.start_print_run(
  p_job_id uuid,
  p_printer_id uuid,
  p_quantity integer default null,
  p_unit_ids uuid[] default null
)
returns uuid
language plpgsql
as $$
declare
  v_job record;
  v_item record;
  v_printer record;
  v_run_id uuid;
  v_minutes integer;
  v_units uuid[];
  v_n integer;
begin
  perform public.assert_can_write();
  select * into v_job from public.production_jobs where id = p_job_id for update;
  if v_job.id is null then raise exception 'Production job not found'; end if;
  if v_job.cancelled_at is not null then
    raise exception 'This job was closed because the order or item was cancelled';
  end if;
  if v_job.stage in ('dispatched', 'completed', 'on_hold') then
    raise exception 'Job is %, it cannot be printed', public.stage_label(v_job.stage);
  end if;
  if p_quantity is not null and p_quantity < 1 then raise exception 'Choose at least one unit to print'; end if;

  select * into v_printer from public.printers where id = p_printer_id and is_active for update;
  if v_printer.id is null then raise exception 'Printer not found'; end if;
  if v_printer.status in ('printing', 'paused') and v_printer.current_print_run_id is not null then
    raise exception '% is already running a print', v_printer.name;
  end if;
  if v_printer.status in ('maintenance', 'offline') then
    raise exception '% is %', v_printer.name, v_printer.status;
  end if;

  -- Which physical units go on this plate.
  if p_unit_ids is not null then
    select array_agg(id order by unit_number) into v_units
    from public.production_units
    where production_job_id = p_job_id and id = any(p_unit_ids) and status = 'pending';
    if coalesce(array_length(v_units, 1), 0) <> coalesce(array_length(p_unit_ids, 1), 0) then
      raise exception 'Only units waiting to be printed can be added to a print';
    end if;
  else
    select array_agg(id order by unit_number) into v_units from (
      select id, unit_number from public.production_units
      where production_job_id = p_job_id and status = 'pending'
      order by unit_number
      limit coalesce(p_quantity, 2147483647)
    ) s;
  end if;
  v_n := coalesce(array_length(v_units, 1), 0);
  if v_n = 0 then raise exception 'Nothing left to print — every unit of this job has been printed'; end if;

  select personalisation, variant_title into v_item from public.order_items where id = v_job.order_item_id;
  -- Scale the estimate to the units on this plate.
  v_minutes := case when v_job.estimated_print_minutes is not null and v_job.quantity > 0
                    then ceil(v_job.estimated_print_minutes::numeric * v_n / v_job.quantity)::int end;

  insert into public.print_runs (production_job_id, printer_id, attempt_number, quantity, estimated_minutes, started_by)
  values (p_job_id, p_printer_id, v_job.attempt_count + 1, v_n, v_minutes, (select auth.uid()))
  returning id into v_run_id;

  update public.production_units set
    status = 'printing', last_print_run_id = v_run_id,
    printed_personalisation = v_item.personalisation, printed_variant = v_item.variant_title
  where id = any(v_units);
  insert into public.print_run_units (print_run_id, unit_id) select v_run_id, unnest(v_units);

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
    insert into public.print_queue (printer_id, production_job_id, status) values (p_printer_id, p_job_id, 'active')
    on conflict do nothing;
  end if;

  perform public.log_activity('production_job', p_job_id, v_job.order_id, 'print.started',
    v_job.job_number || ' started on ' || v_printer.name || ' (attempt ' || (v_job.attempt_count + 1) || ', '
      || v_n || case when v_n = 1 then ' unit' else ' units' end || ')',
    jsonb_build_object('print_run_id', v_run_id, 'printer_id', p_printer_id, 'units', v_n));
  return v_run_id;
end;
$$;

drop function if exists public.finish_print_run(uuid, boolean, text, text, boolean);

-- Record the outcome of a print run. Supports partial plates: pass the failed
-- unit ids (or a count) when only some units failed.
create or replace function public.finish_print_run(
  p_run_id uuid,
  p_succeeded boolean,
  p_failure_reason text default null,
  p_notes text default null,
  p_requeue boolean default true,
  p_failed_unit_ids uuid[] default null,
  p_failed_count integer default null
)
returns void
language plpgsql
as $$
declare
  v_run record;
  v_job record;
  v_printer_name text;
  v_run_units uuid[];
  v_failed uuid[];
  v_n integer;
  v_failed_n integer;
  v_ok_n integer;
  v_remaining integer;
begin
  perform public.assert_can_write();
  select * into v_run from public.print_runs where id = p_run_id for update;
  if v_run.id is null then raise exception 'Print run not found'; end if;
  if v_run.status <> 'printing' then raise exception 'This print run has already finished'; end if;

  select * into v_job from public.production_jobs where id = v_run.production_job_id for update;
  select name into v_printer_name from public.printers where id = v_run.printer_id;

  select array_agg(pru.unit_id order by u.unit_number) into v_run_units
  from public.print_run_units pru join public.production_units u on u.id = pru.unit_id
  where pru.print_run_id = p_run_id;
  v_n := coalesce(array_length(v_run_units, 1), 0);

  -- Which units failed?
  if p_failed_unit_ids is not null then
    select array_agg(x) into v_failed from unnest(p_failed_unit_ids) x where x = any(v_run_units);
    if coalesce(array_length(v_failed, 1), 0) <> coalesce(array_length(p_failed_unit_ids, 1), 0) then
      raise exception 'Some selected units were not on this print';
    end if;
  elsif p_failed_count is not null then
    if p_failed_count < 0 or p_failed_count > v_n then raise exception 'Failed units must be between 0 and %', v_n; end if;
    v_failed := v_run_units[greatest(v_n - p_failed_count + 1, 1):v_n];
    if p_failed_count = 0 then v_failed := '{}'; end if;
  elsif p_succeeded then
    v_failed := '{}';
  else
    v_failed := v_run_units;
  end if;
  v_failed := coalesce(v_failed, '{}');
  v_failed_n := coalesce(array_length(v_failed, 1), 0);
  v_ok_n := v_n - v_failed_n;
  if v_n = 0 then
    -- Legacy run with no unit links: fall back to the all-or-nothing outcome.
    v_failed_n := case when p_succeeded then 0 else v_run.quantity end;
    v_ok_n := v_run.quantity - v_failed_n;
  end if;

  if v_failed_n > 0 and coalesce(trim(p_failure_reason), '') = '' then
    raise exception 'A failure reason is required';
  end if;

  update public.print_runs
  set status = case when v_ok_n = 0 then 'failed'::public.print_run_status else 'succeeded'::public.print_run_status end,
      ended_at = now(),
      quantity_succeeded = v_ok_n,
      quantity_failed = v_failed_n,
      failure_reason = case when v_failed_n > 0 then trim(p_failure_reason) end,
      notes = coalesce(nullif(trim(p_notes), ''), notes),
      ended_by = (select auth.uid())
  where id = p_run_id;

  update public.print_run_units set outcome = case when unit_id = any(v_failed) then 'failed' else 'succeeded' end
  where print_run_id = p_run_id;

  -- Succeeded units become printed; failed units go back to pending for a reprint.
  update public.production_units set status = 'printed', printed_at = now()
  where id = any(v_run_units) and not (id = any(v_failed)) and status = 'printing';
  update public.production_units set status = 'pending', failed_attempts = failed_attempts + 1, status_reason = trim(p_failure_reason)
  where id = any(v_failed) and status = 'printing';
  if v_n = 0 and v_failed_n = 0 then
    update public.production_units set status = 'printed', printed_at = now()
    where production_job_id = v_job.id and status in ('pending', 'printing');
  end if;

  update public.printers
  set status = 'available', current_job_id = null, current_print_run_id = null, estimated_completion_at = null
  where id = v_run.printer_id and current_print_run_id = p_run_id;

  select count(*) into v_remaining from public.production_units
  where production_job_id = v_job.id and status in ('pending', 'printing');

  if v_failed_n > 0 then
    update public.production_jobs set failed_attempts = failed_attempts + 1 where id = v_job.id;
  end if;

  if v_remaining = 0 then
    -- Everything printed → quality check (a job already further along stays put).
    if v_job.stage in ('printing', 'ready_to_print', 'awaiting_preparation', 'new_order') then
      update public.production_jobs set stage = 'quality_check' where id = v_job.id;
    end if;
    update public.print_queue set status = 'done' where production_job_id = v_job.id and status = 'active';
  else
    -- Units still to print: back to Ready to Print (a reprint of the SAME job).
    if v_job.stage = 'printing' then
      update public.production_jobs set stage = 'ready_to_print' where id = v_job.id;
    end if;
    if p_requeue and v_run.printer_id is not null then
      update public.print_queue set status = 'queued', position = 0
      where production_job_id = v_job.id and status = 'active';
    else
      update public.print_queue set status = 'removed' where production_job_id = v_job.id and status = 'active';
    end if;
  end if;

  perform public.log_activity('production_job', v_job.id, v_job.order_id,
    case when v_failed_n = 0 then 'print.succeeded' when v_ok_n = 0 then 'print.failed' else 'print.partial' end,
    v_job.job_number || ' on ' || coalesce(v_printer_name, 'printer') || ': ' ||
      case
        when v_failed_n = 0 then v_ok_n || ' of ' || greatest(v_n, v_ok_n) || ' printed successfully'
        when v_ok_n = 0 then 'print failed — ' || trim(p_failure_reason)
        else v_ok_n || ' printed, ' || v_failed_n || ' failed — ' || trim(p_failure_reason)
      end ||
      case when v_remaining > 0 then ' (' || v_remaining || ' still to print)' else '' end,
    jsonb_build_object('print_run_id', p_run_id, 'succeeded', v_ok_n, 'failed', v_failed_n, 'remaining', v_remaining,
                       'reason', nullif(trim(coalesce(p_failure_reason, '')), '')));
end;
$$;

-- Quality-check failure for specific printed units (or a count): they go back
-- to pending for a reprint and the job returns to Ready to Print. Human action.
create or replace function public.record_qc_failure(
  p_job_id uuid,
  p_reason text,
  p_unit_ids uuid[] default null,
  p_count integer default null
)
returns integer
language plpgsql
as $$
declare
  v_job record;
  v_units uuid[];
  v_n integer;
begin
  perform public.assert_can_write();
  if coalesce(trim(p_reason), '') = '' then raise exception 'Describe why the unit failed quality check'; end if;
  select * into v_job from public.production_jobs where id = p_job_id for update;
  if v_job.id is null then raise exception 'Production job not found'; end if;

  if p_unit_ids is not null then
    select array_agg(id) into v_units from public.production_units
    where production_job_id = p_job_id and id = any(p_unit_ids) and status in ('printed', 'passed');
  else
    select array_agg(id) into v_units from (
      select id from public.production_units where production_job_id = p_job_id and status in ('printed', 'passed')
      order by unit_number desc limit coalesce(p_count, 1)
    ) s;
  end if;
  v_n := coalesce(array_length(v_units, 1), 0);
  if v_n = 0 then raise exception 'No printed units to fail'; end if;

  update public.production_units
  set status = 'pending', failed_attempts = failed_attempts + 1, status_reason = 'QC: ' || trim(p_reason), passed_at = null
  where id = any(v_units);

  if v_job.stage in ('quality_check', 'ready_to_pack') then
    update public.production_jobs set stage = 'ready_to_print' where id = p_job_id;
  end if;

  perform public.log_activity('production_job', p_job_id, v_job.order_id, 'qc.failed',
    v_job.job_number || ': ' || v_n || case when v_n = 1 then ' unit' else ' units' end || ' failed quality check — ' || trim(p_reason),
    jsonb_build_object('units', v_n, 'reason', trim(p_reason)));
  return v_n;
end;
$$;

-- Read-only helper for the UI: units still to print for a job.
create or replace function public.job_outstanding_units(p_job_id uuid)
returns integer
language sql
stable
as $$
  select count(*)::int from public.production_units where production_job_id = p_job_id and status in ('pending', 'printing');
$$;
