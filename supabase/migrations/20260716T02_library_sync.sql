-- 20260716T02_library_sync.sql
-- Phone read-only library sync (Phase 1): the Mac publishes END-TO-END ENCRYPTED
-- copies of vault text files; phones pull + decrypt with a key the server never
-- sees. Server-side this is opaque: path_hash is an HMAC (unreadable), payload is
-- AES-256-GCM ciphertext. One row per (user, document). RLS own-rows everywhere.
-- Format contract: docs/design/nemesis-phone-sync-format-v1.md (main repo).

create table public.library_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- hex HMAC-SHA256 of the vault-relative path, keyed by the user's vault key.
  path_hash text not null check (char_length(path_hash) = 64),
  -- base64(nonce || ciphertext || tag); null exactly when this is a tombstone.
  payload text check (char_length(payload) <= 400000),
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (user_id, path_hash),
  check ((deleted and payload is null) or (not deleted and payload is not null))
);

create index library_documents_user_updated_idx
  on public.library_documents (user_id, updated_at desc);

-- Server clock stamps every write so the phone's incremental "since" cursor can't
-- be skewed by a wrong Mac clock.
create or replace function public.library_documents_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger library_documents_touch
  before insert or update on public.library_documents
  for each row execute function public.library_documents_touch();

alter table public.library_documents enable row level security;

create policy library_documents_own on public.library_documents
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Belt and braces on top of RLS: the anon role has no business here at all.
revoke all on public.library_documents from anon;

-- Phone live-updates while the agent writes.
alter publication supabase_realtime add table public.library_documents;
