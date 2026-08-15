-- Asking for a document to be READ AGAIN, without taking the one it already has away.
--
-- 🔴 WHY A COLUMN RATHER THAN CLEARING `parsed_document_id`. Reprocessing "obviously" means
-- unlinking the parse and letting the existing queue pick the row up again. That is the
-- destructive backfill this project has been declining for a reason: a learner who opens their
-- canvas during the window gets `outcome: "failed"` ("unknown is not empty"), the trust gate
-- refuses to produce knowledge, and they are asked nothing at all. Their material is still there
-- and Nemesis has gone quiet about it.
--
-- So the parse stays linked and serving every reader for the whole reprocess, and
-- `finish_document_parse` swaps in the replacement in one statement. A reader either sees the old
-- parse or the new one; there is no moment where a document has none.
--
-- 🔴 PURELY ADDITIVE. One nullable column defaulting to NULL, and two function bodies whose
-- behaviour on every existing row is byte-identical because every existing row has NULL in it.
-- Nothing is dropped, nothing is altered, nothing is backfilled. Measured read-only against
-- production before writing this: today's claim predicate matches 0 rows even with the reprocess
-- columns simulated, and the widened one matches exactly the single source that asked.

alter table public.library_sources
  add column if not exists parse_reprocess_target text;

comment on column public.library_sources.parse_reprocess_target is
  'The parser version this source has been explicitly asked to be re-read under, or NULL when no '
  'reprocess is pending. Written only by `decideEnqueue`''s `reprocess` action; cleared by whichever '
  'writer records the resulting parse. It is the IDEMPOTENCE: a second ask sees its own value '
  'already here and writes nothing, so asking twice charges once.';

-- 🔴 THE ONE CHANGED LINE IS THE `or`. Everything else is the predicate exactly as it stood.
-- Without it every column above is inert: `parsed_document_id is null` means a source that has
-- ever been parsed can never be claimed again, so a reprocess request would set columns nothing
-- ever reads. A trigger that looks wired and does nothing is worse than no trigger.
create or replace function public.claim_document_parses(p_limit integer, p_lease_seconds integer, p_owner text)
returns setof public.library_sources
language sql
set search_path to 'public'
as $function$
  update public.library_sources s
     set parse_lease_owner     = p_owner,
         parse_lease_token     = gen_random_uuid(),
         parse_leased_until    = clock_timestamp() + make_interval(secs => greatest(p_lease_seconds, 5)),
         parse_attempts        = s.parse_attempts + 1
   where s.id in (
     select c.id
       from public.library_sources c
      where c.parse_enqueued_at is not null
        and (c.parsed_document_id is null or c.parse_reprocess_target is not null)
        and c.parse_failed_at is null
        and not c.deleted
        and c.storage_path is not null
        and c.parse_next_attempt_at <= clock_timestamp()
        and c.parse_leased_until < clock_timestamp()
        and c.parse_attempts < public.document_parse_max_attempts()
      order by c.parse_next_attempt_at
      for update skip locked
      limit greatest(p_limit, 0)
   )
  returning s.*;
$function$;

-- 🔴 THE REQUEST IS CLEARED BY THE PARSE THAT ANSWERS IT, AND THAT IS WHAT BOUNDS THE SPEND.
-- Left set, the row stays claimable for ever and the cron re-reads it on every pass — "repeatedly
-- pay to discover the same result", built by the mechanism meant to stop it.
--
-- 🔴 CLEARED UNCONDITIONALLY, NOT ONLY WHEN THE VERSION MATCHES. An earlier draft made the request
-- self-clearing by comparing the target against the parse that landed. That breaks the moment a
-- vendor reads the file: the worker stores the vendor's own string (`readBy`), it never equals the
-- target we asked for, and the row loops. A completed parse ends the request whatever produced it.
create or replace function public.finish_document_parse(
  p_source_id uuid, p_token uuid, p_user_id uuid, p_content_hash text, p_doc_kind text,
  p_parser_version text, p_structure jsonb, p_coverage jsonb, p_unit_count integer,
  p_visual_count integer, p_parse_ms integer, p_peak_rss_mb integer
)
returns uuid
language plpgsql
set search_path to 'public'
as $function$
declare
  v_parsed uuid;
  v_rows int;
begin
  perform 1 from public.library_sources
   where id = p_source_id and parse_lease_token = p_token and user_id = p_user_id
   for update;
  if not found then
    return null;
  end if;

  v_parsed := public.record_parsed_document(
    p_content_hash  => p_content_hash,
    p_coverage      => p_coverage,
    p_doc_kind      => p_doc_kind,
    p_error         => null,
    p_parser_version=> p_parser_version,
    p_structure     => p_structure,
    p_unit_count    => p_unit_count,
    p_user_id       => p_user_id,
    p_visual_count  => p_visual_count
  );

  update public.library_sources
     set parsed_document_id = v_parsed,
         content_hash       = p_content_hash,
         parse_error        = null,
         parse_ms           = p_parse_ms,
         parse_peak_rss_mb  = p_peak_rss_mb,
         parse_leased_until = '-infinity',
         parse_lease_token  = null,
         -- The request has been answered.
         parse_reprocess_target = null
   where id = p_source_id
     and parse_lease_token = p_token;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'lease lost for source % during finish', p_source_id;
  end if;

  return v_parsed;
end;
$function$;

-- 🔴 THE SECOND WRITER, AND MISSING IT WOULD HAVE LEFT A HOLE THAT ONLY APPEARS UNDER LOAD.
-- `parsed_document_id` has TWO writers: the worker's `finish_document_parse` above, and the upload
-- lane's `persistParse`, which links the row straight from a request. A file re-uploaded while a
-- reprocess was pending would take the second path, get a fresh parse, and leave the target set —
-- claimable for ever. This trigger makes "a parse was linked" clear the request whichever door it
-- came through, so no future writer has to remember.
create or replace function public.clear_parse_reprocess_target()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.parsed_document_id is distinct from old.parsed_document_id
     and new.parsed_document_id is not null
     -- Only when the statement did not already speak for itself, so
     -- `finish_document_parse` above stays the plain and readable version.
     and new.parse_reprocess_target is not distinct from old.parse_reprocess_target then
    new.parse_reprocess_target := null;
  end if;
  return new;
end;
$function$;

drop trigger if exists library_sources_clear_reprocess_target on public.library_sources;
create trigger library_sources_clear_reprocess_target
  before update on public.library_sources
  for each row
  execute function public.clear_parse_reprocess_target();
