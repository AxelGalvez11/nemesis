-- Enhance-transcript metering: reserve + finalize RPCs cloned from the
-- live-audio reservation pattern (same plan resolution, usage_counters
-- ledger, advisory-lock serialization). Called only by the web server's
-- service role — clients never touch these directly.

create or replace function public.reserve_transcription_seconds(
  p_user_id uuid,
  p_job_id uuid,
  p_seconds integer,
  p_storage_path text
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_plan text;
  v_limit integer;
  v_used integer := 0;
  v_reserved integer;
  v_month_start date := date_trunc('month', current_date)::date;
  v_month_end date := (date_trunc('month', current_date) + interval '1 month')::date;
  v_counter_key text := 'transcription_seconds_month';
begin
  if p_user_id is null or p_job_id is null then
    raise exception 'user and job id are required';
  end if;
  if p_storage_path is null or btrim(p_storage_path) = '' then
    raise exception 'storage path is required';
  end if;
  if position(p_user_id::text || '/' in p_storage_path) <> 1 then
    raise exception 'storage path must belong to the user';
  end if;

  v_plan := public.resolve_user_plan(p_user_id);
  v_limit := public.plan_entitlement_int(v_plan, 'transcription_seconds_month_limit');
  if v_limit is null then
    return jsonb_build_object(
      'allowed', false, 'reason', 'missing_entitlement', 'plan', v_plan,
      'used', 0, 'limit', null
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtext(p_user_id::text),
    hashtext(v_counter_key || ':' || v_month_start::text)
  );

  select coalesce(used, 0)
    into v_used
  from public.usage_counters
  where user_id = p_user_id
    and counter_key = v_counter_key
    and period_start = v_month_start;

  v_reserved := greatest(coalesce(p_seconds, 0), 15);
  if coalesce(v_used, 0) + v_reserved > v_limit then
    insert into public.entitlement_checks (
      user_id, entitlement_key, allowed, reason, plan, used, limit_value
    ) values (
      p_user_id, 'transcription_seconds_month_limit', false, 'quota_exceeded',
      v_plan, coalesce(v_used, 0), v_limit
    );
    return jsonb_build_object(
      'allowed', false, 'reason', 'quota_exceeded', 'plan', v_plan,
      'used', coalesce(v_used, 0), 'limit', v_limit
    );
  end if;

  insert into public.usage_counters (
    user_id, counter_key, period_start, period_end, used, limit_snapshot
  ) values (
    p_user_id, v_counter_key, v_month_start, v_month_end, v_reserved, v_limit
  )
  on conflict (user_id, counter_key, period_start) do update
  set used = public.usage_counters.used + excluded.used,
      limit_snapshot = excluded.limit_snapshot,
      period_end = excluded.period_end,
      updated_at = now();

  insert into public.transcription_jobs (id, user_id, storage_path, provider, status, audio_seconds)
  values (p_job_id, p_user_id, p_storage_path, 'assemblyai', 'pending', v_reserved);

  insert into public.entitlement_checks (
    user_id, entitlement_key, allowed, reason, plan, used, limit_value
  ) values (
    p_user_id, 'transcription_seconds_month_limit', true, 'reserved',
    v_plan, coalesce(v_used, 0) + v_reserved, v_limit
  );

  return jsonb_build_object(
    'allowed', true, 'reason', 'reserved', 'plan', v_plan,
    'used', coalesce(v_used, 0) + v_reserved, 'limit', v_limit, 'job_id', p_job_id
  );
end;
$$;

-- Reconcile the reservation to the provider-measured duration and settle the
-- job row. done + actual seconds adjusts the counter by the difference, so a
-- 40-minute reservation that turns out to be 31 minutes gives 9 back.
create or replace function public.finalize_transcription_job(
  p_job_id uuid,
  p_status text,
  p_actual_seconds integer default null,
  p_provider_job_id text default null,
  p_error text default null
) returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_job public.transcription_jobs%rowtype;
  v_delta integer;
  v_month_start date;
begin
  if p_status not in ('processing', 'done', 'error') then
    raise exception 'invalid transcription job status';
  end if;
  select * into v_job from public.transcription_jobs where id = p_job_id for update;
  if not found then
    raise exception 'unknown transcription job';
  end if;

  if p_status = 'done' and p_actual_seconds is not null then
    v_delta := greatest(p_actual_seconds, 0) - v_job.audio_seconds;
    v_month_start := date_trunc('month', v_job.created_at)::date;
    update public.usage_counters
      set used = greatest(used + v_delta, 0), updated_at = now()
      where user_id = v_job.user_id
        and counter_key = 'transcription_seconds_month'
        and period_start = v_month_start;
    update public.transcription_jobs
      set status = 'done',
          audio_seconds = greatest(p_actual_seconds, 0),
          provider_job_id = coalesce(p_provider_job_id, provider_job_id),
          error = null,
          updated_at = now()
      where id = p_job_id;
  else
    update public.transcription_jobs
      set status = p_status,
          provider_job_id = coalesce(p_provider_job_id, provider_job_id),
          error = p_error,
          updated_at = now()
      where id = p_job_id;
  end if;
end;
$$;

-- Server-only: strip the default PUBLIC execute grant and re-grant to the
-- service role alone.
revoke all on function public.reserve_transcription_seconds(uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.finalize_transcription_job(uuid, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.reserve_transcription_seconds(uuid, uuid, integer, text) to service_role;
grant execute on function public.finalize_transcription_job(uuid, text, integer, text, text) to service_role;

-- The phone swaps in the enhanced transcript on its own artifact rows
-- (insert + select existed; update did not).
drop policy if exists chat_recording_artifacts_update on public.chat_recording_artifacts;
create policy chat_recording_artifacts_update on public.chat_recording_artifacts
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
