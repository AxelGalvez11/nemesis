alter table public.readable_library_documents
  add column if not exists created_at timestamptz not null default now();

comment on column public.readable_library_documents.created_at is
  'Immutable creation timestamp used by Library date-added sorting.';
