-- Cloud-first Study for the web workspace. Library notes already live in
-- readable_library_documents; these tables keep deck/card scheduling normalized
-- while retaining an optional source_path back to the originating note.

create table public.study_decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  source_path text check (source_path is null or char_length(source_path) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.study_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  deck_id uuid not null,
  front text not null check (char_length(front) between 1 and 12000),
  back text not null check (char_length(back) between 1 and 20000),
  source_path text check (source_path is null or char_length(source_path) <= 500),
  due_at timestamptz not null default now(),
  interval_days integer not null default 0 check (interval_days between 0 and 36500),
  repetitions integer not null default 0 check (repetitions >= 0),
  lapses integer not null default 0 check (lapses >= 0),
  suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint study_cards_owned_deck_fkey foreign key (deck_id, user_id)
    references public.study_decks(id, user_id) on delete cascade
);

create table public.study_review_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  card_id uuid not null,
  grade text not null check (grade in ('again', 'hard', 'good', 'easy')),
  previous_due timestamptz not null,
  next_due timestamptz not null,
  interval_days integer not null check (interval_days between 1 and 36500),
  reviewed_at timestamptz not null default now(),
  constraint study_review_logs_owned_card_fkey foreign key (card_id, user_id)
    references public.study_cards(id, user_id) on delete cascade
);

create index study_decks_user_updated_idx on public.study_decks(user_id, updated_at desc);
create index study_cards_user_deck_due_idx on public.study_cards(user_id, deck_id, due_at) where not suspended;
create index study_review_logs_user_reviewed_idx on public.study_review_logs(user_id, reviewed_at desc);

create or replace function public.study_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger study_decks_touch before update on public.study_decks
for each row execute function public.study_touch_updated_at();
create trigger study_cards_touch before update on public.study_cards
for each row execute function public.study_touch_updated_at();

alter table public.study_decks enable row level security;
alter table public.study_cards enable row level security;
alter table public.study_review_logs enable row level security;

create policy study_decks_owner on public.study_decks for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy study_cards_owner on public.study_cards for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy study_review_logs_owner on public.study_review_logs for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.study_decks, public.study_cards, public.study_review_logs from anon;
grant select, insert, update, delete on public.study_decks, public.study_cards, public.study_review_logs to authenticated;

-- One atomic grade operation: locks the owned card, advances its initial
-- adaptive interval, and appends the audit/history row in the same transaction.
create or replace function public.grade_study_card(p_card_id uuid, p_grade text)
returns table(card_id uuid, next_due timestamptz, interval_days integer, repetitions integer, lapses integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_card public.study_cards%rowtype;
  next_interval integer;
begin
  if p_grade not in ('again', 'hard', 'good', 'easy') then
    raise exception 'invalid study grade';
  end if;

  select * into current_card
  from public.study_cards
  where id = p_card_id and user_id = (select auth.uid()) and not suspended
  for update;
  if not found then raise exception 'study card not found'; end if;

  next_interval := case p_grade
    when 'again' then 1
    when 'hard' then greatest(1, ceil(greatest(current_card.interval_days, 1) * 1.2)::integer)
    when 'good' then case when current_card.repetitions = 0 then 1 else greatest(2, ceil(current_card.interval_days * 2.5)::integer) end
    when 'easy' then case when current_card.repetitions = 0 then 4 else greatest(4, ceil(current_card.interval_days * 3.5)::integer) end
  end;

  update public.study_cards as card
  set due_at = now() + make_interval(days => next_interval),
      interval_days = next_interval,
      repetitions = current_card.repetitions + 1,
      lapses = current_card.lapses + case when p_grade = 'again' then 1 else 0 end
  where card.id = current_card.id and card.user_id = current_card.user_id
  returning card.id, card.due_at, card.interval_days, card.repetitions, card.lapses
  into card_id, next_due, interval_days, repetitions, lapses;

  insert into public.study_review_logs(user_id, card_id, grade, previous_due, next_due, interval_days)
  values (current_card.user_id, current_card.id, p_grade, current_card.due_at, next_due, interval_days);
  return next;
end;
$$;

revoke all on function public.grade_study_card(uuid, text) from public, anon;
grant execute on function public.grade_study_card(uuid, text) to authenticated;
