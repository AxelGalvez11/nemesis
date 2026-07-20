"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import { useAuth } from "@/components/AuthProvider";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import { supabase } from "@/lib/supabase";

import { scheduleStudyCard, type StudyGrade } from "./study-scheduler";

export interface StudyDeck {
  id: string;
  name: string;
  description: string;
  sourcePath: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StudyCard {
  id: string;
  deckId: string;
  front: string;
  back: string;
  cardType: StudyCardType;
  sourcePath: string | null;
  dueAt: string;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  suspended: boolean;
  createdAt: string;
  updatedAt: string;
}

export type StudyCardType = "basic" | "reversed" | "cloze" | "image_occlusion";

export interface StudyReview {
  id: string;
  cardId: string;
  grade: StudyGrade;
  reviewedAt: string;
}

export type StudyArtifactKind = "test" | "mindmap";

export interface StudyArtifact {
  id: string;
  kind: StudyArtifactKind;
  groupName: string;
  title: string;
  status: "draft" | "ready" | "archived";
  createdAt: string;
  updatedAt: string;
}

export type StudyLoadStatus = "idle" | "loading" | "loaded" | "error";

interface StoreState {
  status: StudyLoadStatus;
  error: string | null;
  decks: StudyDeck[];
  cards: StudyCard[];
  reviews: StudyReview[];
  artifacts: StudyArtifact[];
  selectedDeckId: string | null;
}

const now = new Date().toISOString();
const PREVIEW_DECKS: StudyDeck[] = [
  {
    id: "preview-cardiovascular",
    name: "Cardiovascular pharmacology",
    description: "Core mechanisms, adverse effects, and counseling points.",
    sourcePath: "Pharmacology/Cardiovascular/ACE inhibitors.md",
    createdAt: now,
    updatedAt: now,
  },
];
const PREVIEW_CARDS: StudyCard[] = [
  {
    id: "preview-card-ace",
    deckId: "preview-cardiovascular",
    front: "What is the principal mechanism of ACE inhibitors?",
    back: "They inhibit angiotensin-converting enzyme, reducing angiotensin II and aldosterone while increasing bradykinin.",
    cardType: "basic",
    sourcePath: "Pharmacology/Cardiovascular/ACE inhibitors.md",
    dueAt: now,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    suspended: false,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "preview-card-cough",
    deckId: "preview-cardiovascular",
    front: "Which classic ACE inhibitor adverse effect is mediated by bradykinin?",
    back: "A persistent dry cough.",
    cardType: "basic",
    sourcePath: "Pharmacology/Cardiovascular/ACE inhibitors.md",
    dueAt: now,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    suspended: false,
    createdAt: now,
    updatedAt: now,
  },
];
const PREVIEW_ARTIFACTS: StudyArtifact[] = [
  { id: "preview-test", kind: "test", groupName: "Cardiovascular pharmacology", title: "ACE inhibitor practice test", status: "draft", createdAt: now, updatedAt: now },
  { id: "preview-map", kind: "mindmap", groupName: "Cardiovascular pharmacology", title: "RAAS pathway", status: "draft", createdAt: now, updatedAt: now },
];

const EMPTY_STATE: StoreState = {
  status: "idle",
  error: null,
  decks: [],
  cards: [],
  reviews: [],
  artifacts: [],
  selectedDeckId: null,
};
let state: StoreState = EMPTY_STATE;
let loadedForUserId: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setState(next: StoreState) {
  state = next;
  emit();
}

function getSnapshot() {
  return state;
}

function getServerSnapshot() {
  return EMPTY_STATE;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function cardType(value: unknown): StudyCardType {
  return value === "reversed" || value === "cloze" || value === "image_occlusion" ? value : "basic";
}

function toDeck(raw: unknown): StudyDeck | null {
  if (!isObject(raw) || typeof raw.id !== "string" || typeof raw.name !== "string") return null;
  return {
    id: raw.id,
    name: raw.name,
    description: text(raw.description),
    sourcePath: typeof raw.source_path === "string" ? raw.source_path : null,
    createdAt: text(raw.created_at),
    updatedAt: text(raw.updated_at),
  };
}

function toCard(raw: unknown): StudyCard | null {
  if (!isObject(raw) || typeof raw.id !== "string" || typeof raw.deck_id !== "string") return null;
  return {
    id: raw.id,
    deckId: raw.deck_id,
    front: text(raw.front),
    back: text(raw.back),
    cardType: cardType(raw.card_type),
    sourcePath: typeof raw.source_path === "string" ? raw.source_path : null,
    dueAt: text(raw.due_at),
    intervalDays: number(raw.interval_days),
    repetitions: number(raw.repetitions),
    lapses: number(raw.lapses),
    suspended: raw.suspended === true,
    createdAt: text(raw.created_at),
    updatedAt: text(raw.updated_at),
  };
}

function toReview(raw: unknown): StudyReview | null {
  if (!isObject(raw) || typeof raw.id !== "string" || typeof raw.card_id !== "string") return null;
  const grade = raw.grade;
  if (grade !== "again" && grade !== "hard" && grade !== "good" && grade !== "easy") return null;
  return { id: raw.id, cardId: raw.card_id, grade, reviewedAt: text(raw.reviewed_at) };
}

function toArtifact(raw: unknown): StudyArtifact | null {
  if (!isObject(raw) || typeof raw.id !== "string" || (raw.kind !== "test" && raw.kind !== "mindmap") || typeof raw.title !== "string") return null;
  const status = raw.status === "ready" || raw.status === "archived" ? raw.status : "draft";
  return { id: raw.id, kind: raw.kind, groupName: text(raw.group_name), title: raw.title, status, createdAt: text(raw.created_at), updatedAt: text(raw.updated_at) };
}

async function loadStudy(userId: string) {
  loadedForUserId = userId;
  setState({ ...EMPTY_STATE, status: "loading" });
  try {
    const reviewFloor = new Date();
    reviewFloor.setFullYear(reviewFloor.getFullYear() - 1);
    const [deckResult, cardResult, reviewResult, artifactResult] = await Promise.all([
      supabase
        .from("study_decks")
        .select("id,name,description,source_path,created_at,updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false }),
      supabase
        .from("study_cards")
        .select("id,deck_id,front,back,card_type,source_path,due_at,interval_days,repetitions,lapses,suspended,created_at,updated_at")
        .eq("user_id", userId)
        .order("due_at", { ascending: true }),
      supabase
        .from("study_review_logs")
        .select("id,card_id,grade,reviewed_at")
        .eq("user_id", userId)
        .gte("reviewed_at", reviewFloor.toISOString())
        .order("reviewed_at", { ascending: false }),
      supabase
        .from("study_artifacts")
        .select("id,kind,group_name,title,status,created_at,updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false }),
    ]);
    if (deckResult.error) throw new Error(deckResult.error.message);
    if (cardResult.error) throw new Error(cardResult.error.message);
    if (reviewResult.error) throw new Error(reviewResult.error.message);
    if (artifactResult.error) throw new Error(artifactResult.error.message);

    const decks = (deckResult.data ?? []).flatMap((row) => {
      const deck = toDeck(row);
      return deck ? [deck] : [];
    });
    const cards = (cardResult.data ?? []).flatMap((row) => {
      const card = toCard(row);
      return card ? [card] : [];
    });
    const reviews = (reviewResult.data ?? []).flatMap((row) => {
      const review = toReview(row);
      return review ? [review] : [];
    });
    const artifacts = (artifactResult.data ?? []).flatMap((row) => {
      const artifact = toArtifact(row);
      return artifact ? [artifact] : [];
    });
    setState({ status: "loaded", error: null, decks, cards, reviews, artifacts, selectedDeckId: decks[0]?.id ?? null });
  } catch (cause) {
    setState({
      ...EMPTY_STATE,
      status: "error",
      error: cause instanceof Error ? cause.message : "Couldn't load your study decks.",
    });
  }
}

function reset() {
  loadedForUserId = null;
  setState(EMPTY_STATE);
}

export interface CreateDeckInput {
  name: string;
  description?: string;
  sourcePath?: string | null;
}

export interface CreateCardInput {
  deckId: string;
  front: string;
  back: string;
  cardType?: StudyCardType;
  sourcePath?: string | null;
}

export interface UpdateCardInput {
  id: string;
  front: string;
  back: string;
  cardType: StudyCardType;
}

export interface CreateArtifactInput {
  kind: StudyArtifactKind;
  groupName?: string;
  title: string;
}

export interface UseCloudStudyApi extends StoreState {
  selectDeck: (deckId: string | null) => void;
  reload: () => void;
  createDeck: (input: CreateDeckInput) => Promise<StudyDeck>;
  createCard: (input: CreateCardInput) => Promise<StudyCard>;
  updateCard: (input: UpdateCardInput) => Promise<StudyCard>;
  createArtifact: (input: CreateArtifactInput) => Promise<StudyArtifact>;
  gradeCard: (cardId: string, grade: StudyGrade) => Promise<StudyCard>;
  moveDeck: (deckId: string, targetGroup: string) => Promise<void>;
  moveDeckGroup: (sourceGroup: string, targetGroup: string) => Promise<void>;
  deleteDeck: (deckId: string) => Promise<void>;
  deleteArtifact: (artifactId: string) => Promise<void>;
}

export function isCardDue(card: StudyCard, at = new Date()): boolean {
  return !card.suspended && new Date(card.dueAt).getTime() <= at.getTime();
}

export function useCloudStudy(): UseCloudStudyApi {
  const { session } = useAuth();
  const preview = useWorkspacePreview();
  const userId = session?.user.id ?? null;
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (preview) {
      if (loadedForUserId !== "__preview__" || state.status !== "loaded") {
        loadedForUserId = "__preview__";
        setState({
          status: "loaded",
          error: null,
          decks: PREVIEW_DECKS,
          cards: PREVIEW_CARDS,
          reviews: [],
          artifacts: PREVIEW_ARTIFACTS,
          selectedDeckId: PREVIEW_DECKS[0]?.id ?? null,
        });
      }
      return;
    }
    if (!userId) {
      if (loadedForUserId) reset();
      return;
    }
    if (loadedForUserId !== userId) void loadStudy(userId);
  }, [preview, userId]);

  const reload = useCallback(() => {
    if (preview) {
      loadedForUserId = null;
      setState(EMPTY_STATE);
    } else if (userId) {
      void loadStudy(userId);
    }
  }, [preview, userId]);

  const createDeck = useCallback(async (input: CreateDeckInput) => {
    const name = input.name.trim();
    if (!name) throw new Error("Enter a deck name.");
    const timestamp = new Date().toISOString();
    if (preview) {
      const deck: StudyDeck = {
        id: `preview-${crypto.randomUUID()}`,
        name,
        description: input.description?.trim() ?? "",
        sourcePath: input.sourcePath?.trim() || null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      setState({ ...state, decks: [deck, ...state.decks], selectedDeckId: deck.id });
      return deck;
    }
    if (!userId) throw new Error("Sign in to create a deck.");
    const { data, error } = await supabase
      .from("study_decks")
      .insert({
        user_id: userId,
        name,
        description: input.description?.trim() ?? "",
        source_path: input.sourcePath?.trim() || null,
      })
      .select("id,name,description,source_path,created_at,updated_at")
      .single();
    if (error) throw new Error(error.message);
    const deck = toDeck(data);
    if (!deck) throw new Error("The deck was saved but returned an invalid response.");
    setState({ ...state, decks: [deck, ...state.decks], selectedDeckId: deck.id });
    return deck;
  }, [preview, userId]);

  const createCard = useCallback(async (input: CreateCardInput) => {
    const front = input.front.trim();
    const back = input.back.trim();
    if (!front || !back) throw new Error("Add both a prompt and an answer.");
    const timestamp = new Date().toISOString();
    if (preview) {
      const card: StudyCard = {
        id: `preview-${crypto.randomUUID()}`,
        deckId: input.deckId,
        front,
        back,
        cardType: input.cardType ?? "basic",
        sourcePath: input.sourcePath?.trim() || null,
        dueAt: timestamp,
        intervalDays: 0,
        repetitions: 0,
        lapses: 0,
        suspended: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      setState({ ...state, cards: [card, ...state.cards], selectedDeckId: card.deckId });
      return card;
    }
    if (!userId) throw new Error("Sign in to create a card.");
    const { data, error } = await supabase
      .from("study_cards")
      .insert({ user_id: userId, deck_id: input.deckId, front, back, card_type: input.cardType ?? "basic", source_path: input.sourcePath?.trim() || null })
      .select("id,deck_id,front,back,card_type,source_path,due_at,interval_days,repetitions,lapses,suspended,created_at,updated_at")
      .single();
    if (error) throw new Error(error.message);
    const card = toCard(data);
    if (!card) throw new Error("The card was saved but returned an invalid response.");
    setState({ ...state, cards: [card, ...state.cards], selectedDeckId: card.deckId });
    return card;
  }, [preview, userId]);

  const updateCard = useCallback(async (input: UpdateCardInput) => {
    const existing = state.cards.find((item) => item.id === input.id);
    if (!existing) throw new Error("That card is no longer available.");
    const front = input.front.trim();
    const back = input.back.trim();
    if (!front || !back) throw new Error("Add both a prompt and an answer.");
    const updatedAt = new Date().toISOString();
    let next: StudyCard = { ...existing, front, back, cardType: input.cardType, updatedAt };
    if (!preview) {
      if (!userId) throw new Error("Sign in to edit a card.");
      const { data, error } = await supabase
        .from("study_cards")
        .update({ front, back, card_type: input.cardType, updated_at: updatedAt })
        .eq("id", input.id)
        .eq("user_id", userId)
        .select("id,deck_id,front,back,card_type,source_path,due_at,interval_days,repetitions,lapses,suspended,created_at,updated_at")
        .single();
      if (error) throw new Error(error.message);
      const saved = toCard(data);
      if (!saved) throw new Error("The card was updated but returned an invalid response.");
      next = saved;
    }
    setState({ ...state, cards: state.cards.map((item) => item.id === next.id ? next : item) });
    return next;
  }, [preview, userId]);

  const createArtifact = useCallback(async (input: CreateArtifactInput) => {
    const title = input.title.trim();
    const groupName = input.groupName?.trim() ?? "";
    if (!title) throw new Error("Enter a title.");
    const timestamp = new Date().toISOString();
    if (preview) {
      const artifact: StudyArtifact = { id: `preview-${crypto.randomUUID()}`, kind: input.kind, groupName, title, status: "draft", createdAt: timestamp, updatedAt: timestamp };
      setState({ ...state, artifacts: [artifact, ...state.artifacts] });
      return artifact;
    }
    if (!userId) throw new Error("Sign in to create study material.");
    const { data, error } = await supabase
      .from("study_artifacts")
      .insert({ user_id: userId, kind: input.kind, group_name: groupName, title })
      .select("id,kind,group_name,title,status,created_at,updated_at")
      .single();
    if (error) throw new Error(error.message);
    const artifact = toArtifact(data);
    if (!artifact) throw new Error("The study item was saved but returned an invalid response.");
    setState({ ...state, artifacts: [artifact, ...state.artifacts] });
    return artifact;
  }, [preview, userId]);

  const gradeCard = useCallback(async (cardId: string, grade: StudyGrade) => {
    const card = state.cards.find((item) => item.id === cardId);
    if (!card) throw new Error("That card is no longer available.");
    const reviewedAt = new Date();
    let nextCard: StudyCard;
    if (preview) {
      const schedule = scheduleStudyCard(card, grade);
      const due = new Date(reviewedAt);
      due.setDate(due.getDate() + schedule.intervalDays);
      nextCard = { ...card, ...schedule, dueAt: due.toISOString(), updatedAt: reviewedAt.toISOString() };
    } else {
      if (!userId) throw new Error("Sign in to review cards.");
      const { data, error } = await supabase.rpc("grade_study_card", { p_card_id: cardId, p_grade: grade });
      if (error) throw new Error(error.message);
      const result = Array.isArray(data) ? data[0] : data;
      if (!isObject(result) || typeof result.next_due !== "string") throw new Error("The review returned an invalid response.");
      nextCard = {
        ...card,
        dueAt: result.next_due,
        intervalDays: number(result.interval_days),
        repetitions: number(result.repetitions),
        lapses: number(result.lapses),
        updatedAt: reviewedAt.toISOString(),
      };
    }
    const review: StudyReview = {
      id: `local-${crypto.randomUUID()}`,
      cardId,
      grade,
      reviewedAt: reviewedAt.toISOString(),
    };
    setState({
      ...state,
      cards: state.cards.map((item) => (item.id === cardId ? nextCard : item)),
      reviews: [review, ...state.reviews],
    });
    return nextCard;
  }, [preview, userId]);

  const moveDeck = useCallback(async (deckId: string, rawTargetGroup: string) => {
    const deck = state.decks.find((item) => item.id === deckId);
    if (!deck) return;
    const targetGroup = rawTargetGroup.split("::").map((part) => part.trim()).filter(Boolean).join("::");
    const leaf = deck.name.split("::").pop()?.trim() || deck.name;
    const name = targetGroup ? `${targetGroup}::${leaf}` : leaf;
    if (name === deck.name) return;
    if (state.decks.some((item) => item.id !== deckId && item.name.toLowerCase() === name.toLowerCase())) {
      throw new Error("A deck with that name already exists in this group.");
    }
    if (!preview) {
      if (!userId) throw new Error("Sign in to move a deck.");
      const { error } = await supabase.from("study_decks").update({ name }).eq("id", deckId).eq("user_id", userId);
      if (error) throw new Error(error.message);
    }
    setState({ ...state, decks: state.decks.map((item) => item.id === deckId ? { ...item, name, updatedAt: new Date().toISOString() } : item) });
  }, [preview, userId]);

  const moveDeckGroup = useCallback(async (rawSourceGroup: string, rawTargetGroup: string) => {
    const sourceGroup = rawSourceGroup.split("::").map((part) => part.trim()).filter(Boolean).join("::");
    const targetGroup = rawTargetGroup.split("::").map((part) => part.trim()).filter(Boolean).join("::");
    if (!sourceGroup || sourceGroup === targetGroup || targetGroup.startsWith(`${sourceGroup}::`)) return;
    const groupLeaf = sourceGroup.split("::").pop() ?? sourceGroup;
    const destination = targetGroup ? `${targetGroup}::${groupLeaf}` : groupLeaf;
    const moving = state.decks.filter((deck) => deck.name.startsWith(`${sourceGroup}::`));
    if (moving.length === 0) return;
    const renamed = moving.map((deck) => ({ deck, name: `${destination}${deck.name.slice(sourceGroup.length)}` }));
    if (!preview) {
      if (!userId) throw new Error("Sign in to move a deck group.");
      const results = await Promise.all(renamed.map(({ deck, name }) => supabase.from("study_decks").update({ name }).eq("id", deck.id).eq("user_id", userId)));
      const failure = results.find((result) => result.error)?.error;
      if (failure) throw new Error(failure.message);
    }
    const names = new Map(renamed.map(({ deck, name }) => [deck.id, name]));
    setState({ ...state, decks: state.decks.map((deck) => names.has(deck.id) ? { ...deck, name: names.get(deck.id)!, updatedAt: new Date().toISOString() } : deck) });
  }, [preview, userId]);

  const deleteDeck = useCallback(async (deckId: string) => {
    if (!preview) {
      if (!userId) throw new Error("Sign in to delete a deck.");
      const { error } = await supabase.from("study_decks").delete().eq("id", deckId).eq("user_id", userId);
      if (error) throw new Error(error.message);
    }
    const decks = state.decks.filter((deck) => deck.id !== deckId);
    setState({
      ...state,
      decks,
      cards: state.cards.filter((card) => card.deckId !== deckId),
      selectedDeckId: state.selectedDeckId === deckId ? (decks[0]?.id ?? null) : state.selectedDeckId,
    });
  }, [preview, userId]);

  const deleteArtifact = useCallback(async (artifactId: string) => {
    if (!preview) {
      if (!userId) throw new Error("Sign in to delete study material.");
      const { error } = await supabase.from("study_artifacts").delete().eq("id", artifactId).eq("user_id", userId);
      if (error) throw new Error(error.message);
    }
    setState({ ...state, artifacts: state.artifacts.filter((artifact) => artifact.id !== artifactId) });
  }, [preview, userId]);

  return {
    ...snapshot,
    selectDeck: useCallback((deckId: string | null) => setState({ ...state, selectedDeckId: deckId }), []),
    reload,
    createDeck,
    createCard,
    updateCard,
    createArtifact,
    gradeCard,
    moveDeck,
    moveDeckGroup,
    deleteDeck,
    deleteArtifact,
  };
}
