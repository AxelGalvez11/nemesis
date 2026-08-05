-- REGRESSION: adding source embeddings must not change note search.
--
-- 🔴 THIS TEST CANNOT BE A MOCK. The claim is about a SQL function running under
-- RLS against a shared HNSW index. A TypeScript double that returns whatever it
-- was told to return proves nothing about any of those three things — it would
-- pass against a function that had never been written. So this runs against a
-- REAL Postgres, as a REAL `authenticated` role, through the REAL RPC.
--
-- SAFETY: everything happens inside one transaction that always ends in
-- ROLLBACK. It creates a throwaway auth user rather than borrowing a real one,
-- so even a failure that skipped the rollback would leave one orphan account and
-- no real account touched.
--
-- THE ADVERSARIAL BIT: the source chunks are planted CLOSER to the query vector
-- than every note. If the note RPC leaked them they would not merely appear —
-- they would take every slot, and the assertion could not miss it. A test that
-- planted them further away would pass against a broken function.
--
-- RUN:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/origin_retrieval_regression.sql
-- Prints one NOTICE per assertion. Any failure raises and aborts.

begin;

-- A 1024-dim vector whose direction is set by its first two components. Cosine
-- similarity to `v(1,0)` is a/sqrt(a^2+b^2), so the fixtures below can be placed
-- at exact, hand-checkable distances without a pile of literals.
create function pg_temp.v(a float8, b float8) returns extensions.vector
language sql immutable as $fn$
  select ('[' || a || ',' || b || repeat(',0', 1022) || ']')::extensions.vector;
$fn$;

do $test$
declare
  uid uuid := gen_random_uuid();
  note_id uuid;
  parse_id uuid;
  place_a uuid;
  place_b uuid;
  q extensions.vector := pg_temp.v(1, 0);
  before_json jsonb;
  after_json jsonb;
  n int;
  txt text;
begin
  -- ── Fixtures ──────────────────────────────────────────────────────────────
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'origin-regression-' || uid || '@example.invalid', '', now(), now());

  insert into public.readable_library_documents (user_id, path, kind, title, content)
  values (uid, 'Notes/Regression.md', 'note', 'Regression note', 'note body')
  returning id into note_id;

  -- Three note chunks, at cosine similarity 0.894 / 0.819 / 0.707 to the query.
  insert into public.library_chunks (user_id, document_id, path, title, chunk_index, content, embedding)
  values
    (uid, note_id, 'Notes/Regression.md', 'Regression note', 0, 'note chunk zero',  pg_temp.v(1, 0.5)),
    (uid, note_id, 'Notes/Regression.md', 'Regression note', 1, 'note chunk one',   pg_temp.v(1, 0.7)),
    (uid, note_id, 'Notes/Regression.md', 'Regression note', 2, 'note chunk two',   pg_temp.v(1, 1.0));

  -- ── 1. Snapshot note search BEFORE any source chunk exists ────────────────
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);

  select coalesce(jsonb_agg(to_jsonb(r) order by ord), '[]'::jsonb)
    into before_json
  from (
    select row_number() over () as ord, m.*
    from public.match_library_chunks(q, 8, 0.35) m
  ) r;

  reset role;
  perform set_config('request.jwt.claims', '', true);

  if jsonb_array_length(before_json) <> 3 then
    raise exception 'setup: expected 3 note hits before sources, got %', jsonb_array_length(before_json);
  end if;
  raise notice 'PASS  baseline: note search returns 3 note chunks';

  -- ── 2. Index an original document, planted CLOSER than every note ─────────
  insert into public.parsed_documents (user_id, content_hash, doc_kind, parser_version, state, unit_count, table_count)
  values (uid, repeat('a', 64), 'xlsx', 'xlsx-test', 'ready', 2, 1)
  returning id into parse_id;

  -- The same parse filed in TWO folders: one parse, one chunk set, two placements.
  insert into public.library_sources (user_id, folder_path, file_name, storage_path, bucket, mime_type, content_hash, parsed_document_id)
  values (uid, 'Inbox', 'Budget.xlsx', 'u/' || uid || '/budget.xlsx', 'library-sources',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', repeat('a', 64), parse_id)
  returning id into place_a;
  insert into public.library_sources (user_id, folder_path, file_name, storage_path, bucket, mime_type, content_hash, parsed_document_id)
  values (uid, 'Finance/2026', 'Budget.xlsx', 'u/' || uid || '/budget.xlsx', 'library-sources',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', repeat('a', 64), parse_id)
  returning id into place_b;

  -- Similarity ~0.9987 — nearer the query than any note. A leak is unmissable.
  insert into public.library_chunks (
    user_id, origin_type, parsed_document_id, document_id, path, title, chunk_index, content,
    unit_kind, unit_index, unit_label, cell_range, heading_path,
    parser_version, chunker_version, embedding_version, embedding)
  select
    uid, 'source', parse_id, null, '', 'Budget', i, 'source chunk ' || i,
    'sheet', 2, 'Forecast', 'B12:F19', array['Finance', 'Outlook'],
    'xlsx-test', 'chunk-1', 'voyage-3-large@1024', pg_temp.v(1, 0.05)
  from generate_series(0, 199) i;

  -- ── 3. Note search AFTER: byte-identical rows, identical order ────────────
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);

  select coalesce(jsonb_agg(to_jsonb(r) order by ord), '[]'::jsonb)
    into after_json
  from (
    select row_number() over () as ord, m.*
    from public.match_library_chunks(q, 8, 0.35) m
  ) r;

  if after_json is distinct from before_json then
    raise exception E'REGRESSION: note search changed once source chunks were embedded.\nbefore: %\nafter:  %', before_json, after_json;
  end if;
  raise notice 'PASS  note search unchanged by 200 embedded source chunks (rows AND order identical)';

  -- Belt and braces: no source text can be reached through the note RPC at all,
  -- at any threshold or limit.
  select count(*) into n
  from public.match_library_chunks(q, 500, -1.0) m
  where m.content like 'source chunk%';
  if n <> 0 then
    raise exception 'LEAK: % source chunks reachable through match_library_chunks', n;
  end if;
  raise notice 'PASS  no source chunk reachable through note search at limit 500, threshold -1';

  -- ── 4. Source search: measured locators and every live placement ──────────
  select count(*) into n from public.match_source_chunks(q, 8, 0.35);
  if n <> 8 then
    raise exception 'source search returned % rows, expected 8', n;
  end if;

  select count(*) into n
  from public.match_source_chunks(q, 8, 0.35) s
  where s.unit_kind = 'sheet'
    and s.unit_label = 'Forecast'
    and s.cell_range = 'B12:F19'
    and s.heading_path = array['Finance', 'Outlook']
    and s.doc_kind = 'xlsx'
    and s.parsed_document_id = parse_id
    and s.content_hash = repeat('a', 64)
    and jsonb_array_length(s.placements) = 2;
  if n <> 8 then
    raise exception 'source provenance incomplete on % of 8 rows', 8 - n;
  end if;
  raise notice 'PASS  source search carries measured locator (sheet/Forecast/B12:F19), parse identity and BOTH placements';

  -- ── 5. Combined: opt-in, discriminated, and no empty-path rows ────────────
  --
  -- 🔴 THIS ASSERTION WAS WRONG THE FIRST TIME AND THE FUNCTION WAS RIGHT. It
  -- originally demanded a note row at limit 8. Every source chunk here sits at
  -- similarity 0.9987 and the best note at 0.894, so eight sources ARE the eight
  -- nearest passages and returning them is correct ranking, not crowding-out. A
  -- quota that reserved slots for notes would be a ranking policy, which this
  -- layer deliberately does not hold. What is worth asserting is the honest
  -- pair: pure distance order at a tight limit, and both origins reachable when
  -- the limit is wide enough to hold them.
  select count(*) into n from public.match_library_all(q, 8, 0.35) where origin_type = 'source';
  if n <> 8 then
    raise exception 'combined search at limit 8 returned % source rows; the 8 nearest passages are all sources', n;
  end if;
  raise notice 'PASS  combined search ranks by distance alone -- one origin may take every slot';

  -- 🔴 AND THE SECOND VERSION WAS WRONG TOO, for a reason worth recording: the
  -- per-arm LIMIT is `match_count` as well, so asking for 11 gives the source arm
  -- 11 candidates, all nearer than any note. Notes do not appear at limit 11
  -- either. There is NO representation guarantee at any limit below the number of
  -- source hits, and pretending otherwise in a comment would have been the second
  -- overclaim in one function. What the per-arm limit really buys is that each
  -- arm scans its OWN index and neither is starved of candidates — reachability,
  -- not a share of the result.
  select count(*) into n from public.match_library_all(q, 203, 0.35) where origin_type = 'note';
  if n <> 3 then raise exception 'combined search at limit 203 returned % note rows, expected 3', n; end if;
  select count(*) into n from public.match_library_all(q, 203, 0.35) where origin_type = 'source';
  if n <> 200 then raise exception 'combined search at limit 203 returned % source rows, expected 200', n; end if;
  raise notice 'PASS  both origins are genuinely reachable: at limit 203, all 200 source + all 3 note chunks';

  -- THE REAL PROOF THAT NEITHER ORIGIN IS PRIVILEGED: aim the query at the notes
  -- instead. `v(1,1)` is note chunk two exactly (similarity 1.0) and puts all
  -- three notes above every source (0.74), so the same function at the same limit
  -- now leads with notes. Distance decides, and nothing else does.
  select count(*) into n from public.match_library_all(pg_temp.v(1, 1), 8, 0.35) where origin_type = 'note';
  if n <> 3 then raise exception 'note-shaped query returned % note rows, expected 3', n; end if;
  select origin_type into txt from public.match_library_all(pg_temp.v(1, 1), 8, 0.35) limit 1;
  if txt <> 'note' then raise exception 'note-shaped query led with a % row', txt; end if;
  raise notice 'PASS  a note-shaped query leads with notes -- ranking is distance, not origin';

  select count(*) into n from public.match_library_all(pg_temp.v(1, 1), 8, 0.35) where origin_type = 'note' and path is null;
  if n <> 0 then raise exception '% note rows came back without a path', n; end if;
  raise notice 'PASS  every note row in combined search still carries its path';

  select count(*) into n from public.match_library_all(q, 200, 0.35) where path = '';
  if n <> 0 then
    raise exception 'MALFORMED: % combined rows have an empty-string path', n;
  end if;
  select count(*) into n from public.match_library_all(q, 200, 0.35) where origin_type = 'source' and path is not null;
  if n <> 0 then
    raise exception '% source rows carry a path they cannot have', n;
  end if;
  raise notice 'PASS  no empty-path rows: a source row''s path is NULL and origin_type says why';

  -- ── 6. Deleting a placement hides the source, and destroys nothing ────────
  reset role;
  perform set_config('request.jwt.claims', '', true);
  update public.library_sources set deleted = true where id in (place_a, place_b);

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);

  select count(*) into n from public.match_source_chunks(q, 8, 0.35);
  if n <> 0 then
    raise exception 'deleted-from-Library material is still retrievable: % rows', n;
  end if;

  select coalesce(jsonb_agg(to_jsonb(r) order by ord), '[]'::jsonb) into after_json
  from (select row_number() over () as ord, m.* from public.match_library_chunks(q, 8, 0.35) m) r;
  if after_json is distinct from before_json then
    raise exception 'deleting a SOURCE placement changed NOTE search';
  end if;
  raise notice 'PASS  deleting every placement hides the source immediately and leaves note search untouched';

  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- The chunks themselves must still be there: hiding is not deleting, and a
  -- Library action must never destroy retrieval data.
  select count(*) into n from public.library_chunks where parsed_document_id = parse_id;
  if n <> 200 then
    raise exception 'DATA LOSS: deleting placements removed % of 200 source chunks', 200 - n;
  end if;
  select count(*) into n from public.parsed_documents where id = parse_id;
  if n <> 1 then raise exception 'DATA LOSS: deleting placements removed the parse'; end if;
  raise notice 'PASS  the parse and all 200 chunks survive the delete (hidden, not destroyed)';

  -- ── 7. Undeleting one placement brings it straight back ───────────────────
  update public.library_sources set deleted = false where id = place_b;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select count(*) into n from public.match_source_chunks(q, 8, 0.35);
  if n <> 8 then raise exception 'undelete did not restore retrieval: % rows', n; end if;
  select jsonb_array_length(s.placements) into n from public.match_source_chunks(q, 1, 0.35) s;
  if n <> 1 then raise exception 'expected 1 live placement after undeleting one of two, got %', n; end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  raise notice 'PASS  undelete restores retrieval with the surviving placement only';

  -- ── 8. Cross-account: another user sees none of it ────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.match_source_chunks(q, 200, -1.0);
  if n <> 0 then raise exception 'CROSS-ACCOUNT LEAK: another user saw % source chunks', n; end if;
  select count(*) into n from public.match_library_all(q, 200, -1.0);
  if n <> 0 then raise exception 'CROSS-ACCOUNT LEAK: another user saw % combined rows', n; end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  raise notice 'PASS  a different account retrieves nothing from either new function';

  txt := 'ALL ASSERTIONS PASSED';
  raise notice '%', txt;
end
$test$;

rollback;
