-- Concurrency-safe Nemesis LLM metering.
--
-- The Edge Function previously read `used`, then wrote `used + spent` with an
-- upsert. Two simultaneous completions for the same user could both read 100
-- and both write 150, losing one charge. At scale that under-counts provider
-- spend and makes quota enforcement unreliable. Keep both counters and the
-- audit event in one database transaction, using `used = used + excluded.used`
-- so Postgres serializes contending updates on the primary-key row.

create or replace function public.record_nemesis_llm_usage(
  p_user_id uuid,
  p_daily_period date,
  p_month_period date,
  p_spent integer,
  p_daily_limit integer,
  p_monthly_limit integer,
  p_cost_credits integer,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_daily_used integer;
  v_monthly_used integer;
begin
  if p_user_id is null or p_spent is null or p_spent <= 0 then
    raise exception 'invalid usage charge';
  end if;

  insert into public.usage_counters (
    user_id,
    counter_key,
    period_start,
    period_end,
    used,
    limit_snapshot,
    updated_at
  )
  values (
    p_user_id,
    'nemesis_llm_tokens',
    p_daily_period,
    p_daily_period,
    p_spent,
    p_daily_limit,
    now()
  )
  on conflict (user_id, counter_key, period_start) do update
    set used = public.usage_counters.used + excluded.used,
        limit_snapshot = excluded.limit_snapshot,
        period_end = excluded.period_end,
        updated_at = now()
  returning used into v_daily_used;

  insert into public.usage_counters (
    user_id,
    counter_key,
    period_start,
    period_end,
    used,
    limit_snapshot,
    updated_at
  )
  values (
    p_user_id,
    'nemesis_llm_tokens_month',
    p_month_period,
    p_month_period,
    p_spent,
    p_monthly_limit,
    now()
  )
  on conflict (user_id, counter_key, period_start) do update
    set used = public.usage_counters.used + excluded.used,
        limit_snapshot = excluded.limit_snapshot,
        period_end = excluded.period_end,
        updated_at = now()
  returning used into v_monthly_used;

  insert into public.usage_events (
    user_id,
    event_type,
    counter_key,
    cost_credits,
    metadata,
    period_start
  )
  values (
    p_user_id,
    'nemesis_llm_completion',
    'nemesis_llm_tokens',
    greatest(1, p_cost_credits),
    coalesce(p_metadata, '{}'::jsonb),
    p_daily_period
  );

  return jsonb_build_object(
    'daily_used', v_daily_used,
    'monthly_used', v_monthly_used
  );
end;
$$;

revoke all on function public.record_nemesis_llm_usage(
  uuid,
  date,
  date,
  integer,
  integer,
  integer,
  integer,
  jsonb
) from public, anon, authenticated;

grant execute on function public.record_nemesis_llm_usage(
  uuid,
  date,
  date,
  integer,
  integer,
  integer,
  integer,
  jsonb
) to service_role;

comment on function public.record_nemesis_llm_usage(
  uuid,
  date,
  date,
  integer,
  integer,
  integer,
  integer,
  jsonb
) is
  'Service-role-only atomic daily/monthly Nemesis LLM metering plus usage audit event.';
