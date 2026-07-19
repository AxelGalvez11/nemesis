-- Cover the composite ownership foreign keys in their declared column order.
create index if not exists study_cards_deck_owner_idx
  on public.study_cards(deck_id, user_id);
create index if not exists study_review_logs_card_owner_idx
  on public.study_review_logs(card_id, user_id);
