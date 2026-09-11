-- A workspace source says which filed document it came from, so an answer can retrieve from it and cite it.
--
-- 🔴 WITHOUT THIS THE ANSWER READS RAW TEXT AND NOTHING ELSE. `boardMaterialContext` retrieves the passages a question
-- needs from `library_chunks` by the source's filed id, and falls back to the whole text when there is none. That
-- fallback is right for one lecture and wrong for a term of them: everything would go into the packet and the budget
-- would quietly decide what the answer saw. Handing the filed id through lets retrieval do its job for the person who
-- uploaded the file, and the fallback still covers a classmate, whose session cannot read the uploader's chunks.
create or replace function public.ws_source_bodies(p_page uuid, p_ids uuid[] default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if public.ws_role_rank(public.ws_page_role(v_uid, p_page)) < public.ws_role_rank('read') then return '[]'::jsonb; end if;
  return coalesce(
    (select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'mime', s.mime, 'library', s.library_source, 'body', s.body) order by s.created_at)
     from public.ws_sources s
     where s.page_id = p_page
       and s.status = 'ready'
       and (p_ids is null or s.id = any(p_ids))),
    '[]'::jsonb
  );
end;
$$;
