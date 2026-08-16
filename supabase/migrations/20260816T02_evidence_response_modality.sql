-- Preserve how a learner produced an answer. This is an append-only observation, not a judgement:
-- projections must not treat handwriting, speech, or typing as stronger or weaker evidence.

alter table public.learner_evidence
  add column if not exists response_modality text
    check (response_modality is null or response_modality in ('typed', 'spoken', 'written'));

comment on column public.learner_evidence.response_modality is
  'Observed input provenance: typed, spoken, or written. Null means the legacy writer did not capture it; never an ability score.';
