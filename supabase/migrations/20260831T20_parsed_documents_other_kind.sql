-- `other`: a document read by the extraction vendor because Nemesis has no reader of its own.
--
-- WHY THIS KIND EXISTS AT ALL. Legacy Office (.doc/.ppt/.xls), Apple iWork (.pages/.key/.numbers),
-- OpenDocument, RTF, EPUB, saved HTML and the image formats no vision model accepts were all a 415
-- at the upload door. A 415 stores NOTHING — no source row, no parse record, no counter — so the
-- product had no way to know how often a student was turned away, and the student had no way to
-- make it work. `VENDOR_ONLY_EXTENSIONS` in lib/notebooks/parse-document.ts now resolves them to
-- this kind and sends them to LlamaParse, which documents support for every one.
--
-- WHY IT IS ONE KIND AND NOT SEVENTEEN. `doc_kind` answers "which reader produced this structure",
-- not "what was the file called". Every one of these took the same lane and came back in the same
-- shape, so seventeen values would be seventeen ways to say "the vendor read it" — and each would
-- have to be added to ParsedDocKind, to DocFormat, to the envelope's FORMATS set and to this CHECK
-- (see parse-document.ts's header on the four lists that have drifted before). The original file
-- name is already on `library_sources.file_name` for anyone who needs to know it was a Keynote.
--
-- The CHECK is replaced rather than extended because Postgres has no ADD VALUE for a table CHECK;
-- this repeats the shape of 20260812T02_parsed_documents_csv_kind.sql, which did the same for csv.
alter table public.parsed_documents drop constraint if exists parsed_documents_doc_kind_check;

alter table public.parsed_documents add constraint parsed_documents_doc_kind_check
  check (doc_kind in ('pdf', 'pptx', 'docx', 'xlsx', 'csv', 'image', 'text', 'html', 'other'));
