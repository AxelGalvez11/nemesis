-- A parse that is happening somewhere else.
--
-- Everything the document worker does today finishes inside one invocation: it
-- claims a row, reads the bytes, parses on a thread, writes the result. The
-- Docling lane cannot always do that. The service is a separate container and
-- its measured distribution over 154 real course PDFs is median 12.8 s, p90 65 s,
-- p99 145 s, slowest 297 s — against a function that must abort itself at 240 s.
--
-- 🔴 THE FILES THAT MISS THE DEADLINE ARE NOT A RANDOM TAIL. The 297 s document
-- is 17 pages carrying 15 tables, and table detection is the entire cost. Our own
-- PDF lane finds ZERO tables across all 164 corpus PDFs. So "wait, give up, fall
-- back to ours" would systematically lose exactly the documents the Docling lane
-- exists to read properly. Losing them quietly would be worse than not routing
-- them at all.
--
-- So the worker submits the conversion, keeps the task id here, and lets the NEXT
-- attempt resume the same task instead of paying for it a second time. Two
-- columns and one setter; nothing about leases, backoff, attempt limits or
-- idempotency changes.
--
-- 🔴 THIS MIGRATION IS OPTIONAL BY DESIGN. `claim_document_parses` returns `s.*`,
-- so the columns reach the worker automatically once they exist and are simply
-- absent until then. A deployment without this migration still routes to Docling
-- and still parses correctly — it just cannot resume a task across attempts, and
-- long documents fall back to the built-in parser. The worker treats a missing
-- column and a missing function as "resume unavailable", never as an error.

alter table public.library_sources
  -- docling-serve's task id. Opaque to us: we never parse it, only hand it back.
  add column if not exists parse_external_task_id text,
  -- When the task was handed over. This is what bounds a resumed task's life —
  -- without it, an id that never completes would be resumed forever.
  add column if not exists parse_external_started_at timestamptz;

comment on column public.library_sources.parse_external_task_id is
  'docling-serve task id for a conversion still running outside this deployment. Null when no external parse is in flight.';
comment on column public.library_sources.parse_external_started_at is
  'When the external conversion was submitted. Bounds how long a resumed task may be waited on across attempts.';

/**
 * Attach, or detach, the external task id — only if the caller still holds the
 * lease.
 *
 * 🔴 THE TOKEN IS IN THE WHERE CLAUSE, for the same reason it is in every other
 * write on this row. A worker whose lease was reclaimed mid-parse must not be
 * able to point the new owner at a task it no longer controls.
 *
 * Passing null clears both columns, which is what the worker does the moment it
 * has the result in hand or gives the document up. A stale id left behind would
 * make the next parse of the same source resume a conversion of the OLD bytes.
 */
create or replace function public.set_document_parse_task(
  p_source_id uuid,
  p_token uuid,
  p_task_id text
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_rows int;
begin
  update public.library_sources
     set parse_external_task_id    = p_task_id,
         -- clock_timestamp(), NOT now(): now() is transaction_timestamp() and is
         -- frozen for the whole transaction, which is the wrong clock for a fact
         -- about how long something has been running in another process.
         parse_external_started_at = case when p_task_id is null then null else clock_timestamp() end
   where id = p_source_id
     and parse_lease_token = p_token;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

revoke execute on function public.set_document_parse_task(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.set_document_parse_task(uuid, uuid, text) to service_role;
