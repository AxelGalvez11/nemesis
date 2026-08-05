-- The upload ceiling goes to 200 MiB, and spreadsheets become storable at all.
--
-- WHY THE CEILING MOVED. A real PHCY lecture — 37 slides, ordinary content — weighs
-- 118.1 MiB, and the reason is not exotic:
--
--   * 57 embedded TIFFs hold 29.7 megapixels of RGBA at 4.01 bytes per pixel, i.e.
--     completely uncompressed pixels; and
--   * all 68 entries under ppt/media are STORED in the zip (method 0), so the
--     package never compressed them either.
--
-- Uncompressed twice over. Simply re-deflating the same bytes takes the package to
-- 24.0 MiB with every pixel bit-identical. But a derivative can only be built from
-- an original we were allowed to keep, and at a 50 MiB ceiling this lecture was
-- refused by storage before any Nemesis code ran. The owner's rule is that the
-- original stays the canonical artifact, so the ceiling has to clear the original,
-- not the derivative.
--
-- 200 MiB is deliberate: it clears this lecture with real headroom for a longer
-- deck built the same careless way, and still refuses a runaway file outright.
--
-- 🔴 THIS IS NOT A LICENCE TO PUSH 200 MiB THROUGH A REQUEST BODY. The transport
-- shape is unchanged and must stay unchanged: the browser uploads straight to
-- storage under its own RLS session and POSTs a reference, and the server reads the
-- bytes back from storage. MAX_INLINE_UPLOAD_BYTES stays at 4 MiB because that is a
-- PLATFORM limit — Vercel refuses a larger body at the edge as plain text, before
-- any handler runs. Raising this number changes what may be STORED. It changes
-- nothing about what may be POSTED, and nothing downstream may start buffering a
-- whole 200 MiB file in memory because this line moved.
--   packages/shared/src/upload-limits.ts carries the same warning next to the
--   constant, which is imported by every surface rather than retyped.

update storage.buckets
   set file_size_limit = 209715200
 where id = 'library-sources';

-- Spreadsheets could not be stored AT ALL.
--
-- The allowlist was written when Library import accepted documents, slides, photos
-- and recordings. The XLSX parser has since become the most heavily validated
-- parser in the codebase — 13 real files across Microsoft Excel, LibreOffice Calc
-- and Google Sheets — and a student still could not upload a spreadsheet, because
-- the bucket would have rejected the object even after the picker, the route and
-- the parser all said yes. A format is only supported when EVERY layer agrees; this
-- was the layer nobody checked.
update storage.buckets
   set allowed_mime_types = (
         select array_agg(distinct m order by m)
           from unnest(
             allowed_mime_types
             || array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
           ) as m
       )
 where id = 'library-sources'
   and not (
     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
     = any(allowed_mime_types)
   );
