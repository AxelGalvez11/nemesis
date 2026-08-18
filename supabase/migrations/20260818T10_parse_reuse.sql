-- 20260818T10 — parse once, reuse for ever.
--
-- 🔴🔴 THE REUSE MACHINERY EXISTED AND WAS NEVER CONSULTED BEFORE SPENDING.
-- `parsed_documents` has been keyed `(user_id, content_hash, parser_version)`
-- since the day it was created, with a comment above the index that says exactly
-- what it is for: *"Re-importing an unchanged file finds this row instead of
-- paying to parse and embed again."* But nothing ever looked. `record_parsed_document`
-- consults the key at WRITE time, which deduplicates the ROW and not the WORK:
-- the file has already been fetched, parsed, sent to a vendor and looked at by a
-- vision model by the time that upsert runs.
--
-- Measured on production the day this was written: 21 sources carry a content
-- hash and 19 of those hashes are distinct. Two files have already been paid for
-- twice, in a library of twenty-one — roughly one upload in ten, before the
-- product has a second cohort of students, before anyone has shared a reading
-- list, and before a single course has run twice.
--
-- 🔴 PER USER, AND DELIBERATELY NOT ACROSS USERS. Two students uploading the same
-- lecture is the obvious next saving and it is NOT taken here. The key would have
-- to drop `user_id`, and then one person's parse — including anything their copy
-- of the file contained that another's did not, including a document they may
-- later delete — becomes the answer served to somebody else. That is a change to
-- what user data is, not an optimisation, and the owner's brief lists new
-- user-data sharing behaviour as something to escalate rather than decide. The
-- same-user case has no such question: it is the same person's own file.
--
-- Additive and reversible. One function, no column dropped, no row rewritten,
-- and nothing changes until a caller invokes it.

-- ── Linking a placement to a parse that already exists ──────────────────────
--
-- 🔴 IT PROVES THE LEASE, EXACTLY AS `finish_document_parse` DOES, AND FOR THE
-- SAME REASON. This is a finishing move: it releases the lease and marks the job
-- done. A version that skipped the token check would let a worker whose lease had
-- expired — because it was slow, or because the platform paused it — overwrite
-- the result of the newer worker that replaced it.
--
-- 🔴 AND IT PROVES THE PARSE BELONGS TO THIS USER. The service role bypasses row
-- level security, so this predicate is the only thing standing between a
-- caller-supplied id and somebody else's document. It is checked in SQL rather
-- than in the caller because a check in the caller is a check somebody can forget.
create or replace function public.reuse_document_parse(
  p_source_id uuid,
  p_token uuid,
  p_user_id uuid,
  p_parsed_document_id uuid,
  p_content_hash text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_rows int;
begin
  -- The lease, first, and everything after it is in the same transaction.
  perform 1 from public.library_sources
   where id = p_source_id and parse_lease_token = p_token and user_id = p_user_id
   for update;
  if not found then
    return null;
  end if;

  -- The parse must exist, belong to this user, and be ABOUT THESE BYTES. The
  -- hash check is not redundant with the id: a caller that looked the row up by
  -- a stale hash would otherwise link a placement to a parse of a different file,
  -- and every citation in it would resolve to real text from the wrong document.
  perform 1 from public.parsed_documents
   where id = p_parsed_document_id
     and user_id = p_user_id
     and content_hash = p_content_hash;
  if not found then
    return null;
  end if;

  -- Something points at it again, so it is no longer collectable. Mirrors what
  -- `record_parsed_document` does on its own conflict path.
  update public.parsed_documents
     set unreferenced_at = null, updated_at = now()
   where id = p_parsed_document_id;

  update public.library_sources
     set parsed_document_id = p_parsed_document_id,
         content_hash       = p_content_hash,
         parse_error        = null,
         -- 🔴 ZERO IS THE TRUTH HERE AND IS WORTH RECORDING. This placement cost
         -- no parse time and no memory. A row showing the ORIGINAL parse's
         -- milliseconds would make reuse invisible in exactly the table someone
         -- would look at to find out whether it is working.
         parse_ms           = 0,
         parse_peak_rss_mb  = 0,
         parse_leased_until = '-infinity',
         parse_lease_token  = null
   where id = p_source_id
     and parse_lease_token = p_token;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'lease lost for source % during reuse', p_source_id;
  end if;

  return p_parsed_document_id;
end;
$$;

revoke execute on function public.reuse_document_parse(uuid, uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.reuse_document_parse(uuid, uuid, uuid, uuid, text)
  to service_role;

comment on function public.reuse_document_parse(uuid, uuid, uuid, uuid, text) is
  'Point a placement at a parse of the same bytes that this user already has, releasing the lease. Never crosses users.';

-- ── Finding one cheaply ────────────────────────────────────────────────────
--
-- The identity index is (user_id, content_hash, parser_version), so a lookup on
-- its first two columns already uses it. No new index is created: adding one
-- would be a second thing to maintain for a prefix scan Postgres already serves.
