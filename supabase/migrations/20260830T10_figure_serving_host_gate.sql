-- Serve a figure only when its PIXELS sit on a host the licence claim actually covers.
--
-- The shelf's licence gate ran per BOOK: catalogue said CC BY, the book's own metadata agreed,
-- and a CHECK constraint refuses rows outside four licence families. But a book's author may
-- embed an image they used under permission or local fair dealing - measured in the shelf:
-- Khan Academy and CK-12 CDN images (both CC BY-NC upstream) and smarthistory.org (CC BY-NC-SA)
-- ride inside CC BY books. The book's grant does not transfer to those files, so pixels are
-- served only from hosts that publish the harvested books themselves (where book and images are
-- one CC-licensed publication) plus Wikimedia's file store, where non-free licences are banned
-- by site policy. 3,101 of 21,393 rows stop being servable; they stay stored, because the rule
-- lives here and can be revisited without re-harvesting.
--
-- commons.wikimedia.org is named OFF the list: it is the wiki PAGE host (some books carry it as
-- their book_url), not a file store - pixels live on upload.wikimedia.org.
--
-- The TypeScript mirror of this rule is REFERENCE_ASSET_HOSTS in
-- apps/web/lib/learn/reference-images.ts - stored visual blocks are re-validated there long
-- after this function ran, so the two lists must move together.
--
-- Applied to project qyjmivntajbigjswhahb on 2026-08-30 (figure_serving_host_gate, then
-- figure_serving_host_gate_no_page_host); this file records the final state.
create or replace function public.match_textbook_figures(
  query_embedding vector,
  match_count integer default 4,
  match_threshold double precision default 0.30,
  book_filter text default null::text
)
returns table(
  id uuid, image_url text, caption text, alt text, book_title text, book_url text,
  attribution text, licence text, chapter_title text, similarity double precision
)
language sql stable security definer
set search_path to 'public', 'extensions'
as $function$
  with serving_hosts as (
    select distinct split_part(g.book_url, '/', 3) as host from public.textbook_figures g
    where split_part(g.book_url, '/', 3) <> 'commons.wikimedia.org'
    union select 'upload.wikimedia.org'
  )
  select
    f.id,
    f.image_url,
    f.caption,
    f.alt,
    f.book_title,
    f.book_url,
    f.attribution,
    f.licence,
    f.chapter_title,
    1 - (f.embedding <=> query_embedding) as similarity
  from public.textbook_figures f
  where f.embedding is not null
    and (1 - (f.embedding <=> query_embedding)) > match_threshold
    and (book_filter is null or f.book_title = book_filter)
    and split_part(f.image_url, '/', 3) in (select host from serving_hosts)
  order by f.embedding <=> query_embedding asc
  limit greatest(match_count, 1);
$function$;
