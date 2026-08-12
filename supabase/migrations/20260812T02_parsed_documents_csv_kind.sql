-- A delimited text file is a document kind the database will accept.
--
-- 🔴 THIS MIGRATION MUST BE APPLIED BEFORE THE CODE THAT WRITES 'csv' DEPLOYS.
--
-- `doc_kind` carries a CHECK constraint listing every allowed value, and
-- `ParsedDocKind` in apps/web/lib/notebooks/parse-record.ts is that list written
-- a second time in TypeScript. The two are a pair, and they fail in the nastiest
-- possible place: not at build time, not at parse time, but at INSERT — after
-- the file was fetched, read, modelled and measured. Every CSV upload would do
-- all its work and then lose it, and the error would name a constraint rather
-- than a format.
--
-- The reverse order is safe: this constraint accepting a value nothing yet
-- writes costs nothing, which is why the migration goes first and the code
-- follows. `csv-kind-contract.test.ts` reads this file and compares it to the
-- TypeScript union, so the pair cannot drift again silently.

alter table public.parsed_documents drop constraint if exists parsed_documents_doc_kind_check;
alter table public.parsed_documents add constraint parsed_documents_doc_kind_check
  check (doc_kind in ('pdf', 'pptx', 'docx', 'xlsx', 'csv', 'image', 'text', 'html'));
