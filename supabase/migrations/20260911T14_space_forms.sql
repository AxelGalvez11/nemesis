-- Space, M4 part five (docs/space/PLAN.md): anyone who can open a database can fill in its forms.
--
-- ws_submit_form(view, answers) adds one row to the form's database for a caller who may only read the page, which
-- ws_apply would refuse. It keeps only the form's own questions, and only answers that fit their property (an option
-- the property offers, a number, a YYYY-MM-DD date, a true or false, people's ids, text up to 2,000 characters); the rest
-- is dropped. The row goes at the end of the database's `rows` list and both records are broadcast on the page channel
-- the way ws_apply sends them, so open pages show the response at once. At most 60 responses an hour per person.

create or replace function public.ws_submit_form(p_view uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
  v_view public.ws_records%rowtype;
  v_page public.ws_records%rowtype;
  v_coll public.ws_records%rowtype;
  v_row public.ws_records%rowtype;
  v_props jsonb := '{}'::jsonb;
  v_pid text;
  v_prop jsonb;
  v_type text;
  v_val jsonb;
  v_text text;
  v_rows jsonb;
  v_version bigint;
begin
  if v_uid is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if jsonb_typeof(p_answers) is distinct from 'object' then raise exception 'answers must be an object' using errcode = '22023'; end if;
  if pg_column_size(p_answers) > 100000 then raise exception 'that response is too large' using errcode = '54000'; end if;

  select * into v_view from public.ws_records where id = p_view and kind = 'view' and alive;
  if not found or v_view.type <> 'form' then raise exception 'no such form' using errcode = '22023'; end if;
  select * into v_page from public.ws_records where id = v_view.page_id and kind = 'page';
  if not found or public.ws_role_rank(public.ws_page_role(v_uid, v_page.id)) < 1 then
    raise exception 'you cannot open this form' using errcode = '42501';
  end if;
  if exists (select 1 from public.ws_records a where a.id = any(v_page.path) and not a.alive) then
    raise exception 'this form is in the trash' using errcode = '42501';
  end if;
  select * into v_coll from public.ws_records
  where kind = 'collection' and alive and page_id = v_page.id
    and (id::text = v_page.props ->> 'collection' or v_page.props ->> 'collection' is null)
  order by (id::text = v_page.props ->> 'collection') desc nulls last
  limit 1;
  if not found then raise exception 'this form has no database' using errcode = '22023'; end if;

  if not coalesce((public.consume_rate_limit('ws_submit_form', v_uid::text, 60, 3600) ->> 'allowed')::boolean, false) then
    raise exception 'that is a lot of responses for one hour; try again later' using errcode = '54000';
  end if;

  for v_pid in
    select q #>> '{}' from jsonb_array_elements(case when jsonb_typeof(v_view.props #> '{form,questions}') = 'array' then v_view.props #> '{form,questions}' else '[]'::jsonb end) as t(q)
    where jsonb_typeof(q) = 'string'
  loop
    v_prop := v_coll.props -> ('s:' || v_pid);
    continue when jsonb_typeof(v_prop) is distinct from 'object' or not (p_answers ? v_pid);
    v_type := v_prop ->> 'type';
    v_val := p_answers -> v_pid;
    if v_type in ('title', 'text', 'url', 'email', 'phone_number') then
      continue when jsonb_typeof(v_val) <> 'string';
      v_text := btrim(v_val #>> '{}');
      continue when v_text = '' or char_length(v_text) > 2000;
      v_props := jsonb_set(v_props, array[v_pid], to_jsonb(v_text), true);
    elsif v_type = 'number' then
      if jsonb_typeof(v_val) = 'number' then
        v_props := jsonb_set(v_props, array[v_pid], v_val, true);
      elsif jsonb_typeof(v_val) = 'string' and btrim(v_val #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?$' and char_length(btrim(v_val #>> '{}')) <= 30 then
        v_props := jsonb_set(v_props, array[v_pid], to_jsonb((btrim(v_val #>> '{}'))::numeric), true);
      end if;
    elsif v_type in ('select', 'status') then
      continue when jsonb_typeof(v_val) <> 'string';
      if exists (select 1 from jsonb_array_elements(case when jsonb_typeof(v_prop -> 'options') = 'array' then v_prop -> 'options' else '[]'::jsonb end) as o
                 where o ->> 'value' = v_val #>> '{}') then
        v_props := jsonb_set(v_props, array[v_pid], v_val, true);
      end if;
    elsif v_type = 'multi_select' then
      continue when jsonb_typeof(v_val) <> 'array';
      v_props := jsonb_set(v_props, array[v_pid], coalesce((
        select jsonb_agg(distinct e) from jsonb_array_elements(v_val) with ordinality as t(e, o)
        where jsonb_typeof(e) = 'string' and o <= 50
          and exists (select 1 from jsonb_array_elements(case when jsonb_typeof(v_prop -> 'options') = 'array' then v_prop -> 'options' else '[]'::jsonb end) as op
                      where op ->> 'value' = e #>> '{}')
      ), '[]'::jsonb), true);
      if v_props -> v_pid = '[]'::jsonb then v_props := v_props - v_pid; end if;
    elsif v_type = 'date' then
      if jsonb_typeof(v_val) = 'string' and (v_val #>> '{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        v_props := jsonb_set(v_props, array[v_pid], v_val, true);
      end if;
    elsif v_type = 'checkbox' then
      if jsonb_typeof(v_val) = 'boolean' then
        v_props := jsonb_set(v_props, array[v_pid], v_val, true);
      end if;
    elsif v_type = 'person' then
      continue when jsonb_typeof(v_val) <> 'array';
      v_props := jsonb_set(v_props, array[v_pid], coalesce((
        select jsonb_agg(distinct e) from jsonb_array_elements(v_val) with ordinality as t(e, o)
        where jsonb_typeof(e) = 'string' and o <= 20
          and (e #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      ), '[]'::jsonb), true);
      if v_props -> v_pid = '[]'::jsonb then v_props := v_props - v_pid; end if;
    end if;
  end loop;

  insert into public.ws_records (id, space_id, kind, type, parent_id, page_id, path, props, created_by, edited_by)
  values (gen_random_uuid(), v_coll.space_id, 'row', '', v_coll.id, v_coll.page_id, v_coll.path, v_props, v_uid, v_uid)
  returning * into v_row;

  v_rows := public.ws_list_apply(v_coll.props -> 'rows', jsonb_build_object('ins', jsonb_build_array(jsonb_build_array(v_row.id::text,
    case when jsonb_typeof(v_coll.props -> 'rows') = 'array' and jsonb_array_length(v_coll.props -> 'rows') > 0 then v_coll.props -> 'rows' -> -1 else 'null'::jsonb end))));
  v_version := v_coll.version + 1;
  update public.ws_records
  set props = jsonb_set(props, '{rows}', v_rows, true),
      fv = jsonb_set(fv, '{rows}', to_jsonb(v_version), true),
      version = v_version, edited_by = v_uid, edited_at = now()
  where id = v_coll.id;

  perform public.ws_send(jsonb_build_object('by', v_uid, 'client', null, 'page', v_coll.page_id, 'records', jsonb_build_array(
    public.ws_record_json(v_row) || jsonb_build_object('created', true),
    jsonb_build_object('id', v_coll.id, 'kind', 'collection', 'type', v_coll.type, 'page_id', v_coll.page_id,
      'parent_id', v_coll.parent_id, 'path', to_jsonb(v_coll.path), 'v', v_version, 'set', jsonb_build_object('rows', v_rows))
  )), 'tx', 'ws:page:' || v_coll.page_id);

  return jsonb_build_object('ok', true, 'row', v_row.id);
end;
$fn$;

revoke execute on function public.ws_submit_form(uuid, jsonb) from public, anon;

grant execute on function public.ws_submit_form(uuid, jsonb) to authenticated;
