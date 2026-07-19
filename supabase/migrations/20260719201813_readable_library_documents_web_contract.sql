-- Capture the existing cloud-readable Library contract in repository history.
-- The live project already has this table; IF NOT EXISTS keeps this migration
-- safe there while allowing a fresh environment to support the web Library.
create table if not exists public.readable_library_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  path text not null,
  kind text not null default 'note',
  title text not null default '',
  content text,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (user_id, path)
);

create index if not exists readable_library_documents_user_updated_idx
  on public.readable_library_documents(user_id, updated_at desc);

create or replace function public.readable_library_documents_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists readable_library_documents_touch on public.readable_library_documents;
create trigger readable_library_documents_touch
before insert or update on public.readable_library_documents
for each row execute function public.readable_library_documents_touch();

alter table public.readable_library_documents enable row level security;
drop policy if exists readable_library_documents_owner_all on public.readable_library_documents;
create policy readable_library_documents_owner_all
on public.readable_library_documents for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on public.readable_library_documents from anon, authenticated;
grant select, insert, update, delete on public.readable_library_documents to authenticated;
