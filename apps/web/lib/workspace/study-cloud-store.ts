"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import { useAuth } from "@/components/AuthProvider";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import { supabase } from "@/lib/supabase";

import { hasCloze } from "./study-cloze";
import { normalizeStudyFlag } from "./study-flags";
import {
  occlusionCardFront,
  parseOcclusionPayload,
  type OcclusionMode,
  type OcclusionPayload,
  type OcclusionShape,
} from "./study-occlusion";
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
  /** Anki-style colored flag — 0 none, 1-7 per STUDY_FLAG_COLORS. */
  flag: number;
  tags: string[];
  /** Present only on image-occlusion cards; everything else stores null. */
  payload: OcclusionPayload | null;
  createdAt: string;
  updatedAt: string;
}

export type StudyCardType = "basic" | "reversed" | "cloze" | "image_occlusion";

const CARD_COLUMNS =
  "id,deck_id,front,back,card_type,source_path,due_at,interval_days,repetitions,lapses,suspended,flag,tags,payload,created_at,updated_at";

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
  /** Raw jsonb payload — parse with study-artifact-content.ts (test
   *  questions/attempts or a mindmap outline). Null for legacy shells. */
  content: unknown;
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
// A self-contained sample diagram so /dev-preview can exercise occlusion
// rendering with no storage round-trip: the image itself is an inline SVG.
const PREVIEW_OCCLUSION_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" viewBox="0 0 480 300"><rect width="480" height="300" fill="#fafafa"/><text x="24" y="42" font-family="Helvetica, Arial, sans-serif" font-size="19" font-weight="700" fill="#18181b">Cardiac conduction system</text><path d="M150 96 C 210 70 268 84 292 128 C 312 176 276 232 210 248 C 148 236 112 188 118 142 C 122 116 132 104 150 96 Z" fill="#fee2e2" stroke="#fca5a5" stroke-width="2"/><circle cx="196" cy="126" r="7" fill="#dc2626"/><circle cx="216" cy="176" r="7" fill="#dc2626"/><circle cx="196" cy="222" r="6" fill="#dc2626"/><line x1="203" y1="126" x2="318" y2="112" stroke="#a1a1aa" stroke-width="1.5"/><line x1="223" y1="176" x2="318" y2="172" stroke="#a1a1aa" stroke-width="1.5"/><line x1="202" y1="222" x2="318" y2="232" stroke="#a1a1aa" stroke-width="1.5"/><rect x="322" y="98" width="128" height="28" rx="6" fill="#ffffff" stroke="#d4d4d8"/><text x="334" y="117" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#18181b">SA node</text><rect x="322" y="158" width="128" height="28" rx="6" fill="#ffffff" stroke="#d4d4d8"/><text x="334" y="177" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#18181b">AV node</text><rect x="322" y="218" width="128" height="28" rx="6" fill="#ffffff" stroke="#d4d4d8"/><text x="334" y="237" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#18181b">Purkinje fibers</text></svg>`;
const PREVIEW_OCCLUSION_PAYLOAD: OcclusionPayload = {
  kind: "occlusion",
  image: `data:image/svg+xml;utf8,${encodeURIComponent(PREVIEW_OCCLUSION_SVG)}`,
  width: 480,
  height: 300,
  mode: "hide-all",
  shapes: [
    { id: "sa", x: 322, y: 98, w: 128, h: 28, label: "SA node" },
    { id: "av", x: 322, y: 158, w: 128, h: 28, label: "AV node" },
    { id: "purkinje", x: 322, y: 218, w: 128, h: 28, label: "Purkinje fibers" },
  ],
  targetId: "sa",
};
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
    flag: 1,
    tags: ["pharmacology", "mechanisms"],
    payload: null,
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
    repetitions: 11,
    // Failed enough times to trip the leech radar in /dev-preview.
    lapses: 9,
    suspended: false,
    flag: 0,
    tags: ["adverse-effects"],
    payload: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "preview-card-cloze",
    deckId: "preview-cardiovascular",
    front: "{{c1::Beta blockers}} lower heart rate by blocking {{c2::beta-1::receptor subtype}} receptors in the {{c3::sinoatrial node}}.",
    back: "Cardioselective agents such as metoprolol and atenolol prefer beta-1 at usual doses.",
    cardType: "cloze",
    sourcePath: null,
    dueAt: now,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    suspended: false,
    flag: 0,
    tags: ["pharmacology"],
    payload: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "preview-card-suspended",
    deckId: "preview-cardiovascular",
    front: "Which ACE inhibitor is NOT a prodrug?",
    back: "Lisinopril (and captopril) — the rest are prodrugs.",
    cardType: "basic",
    sourcePath: null,
    dueAt: now,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    suspended: true,
    flag: 0,
    tags: ["pharmacology"],
    payload: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "preview-card-occlusion",
    deckId: "preview-cardiovascular",
    front: "SA node",
    back: "The sinoatrial node is the heart's pacemaker — it fires first and sets the rate.",
    cardType: "image_occlusion",
    sourcePath: null,
    dueAt: now,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    suspended: false,
    flag: 0,
    tags: ["anatomy"],
    payload: PREVIEW_OCCLUSION_PAYLOAD,
    createdAt: now,
    updatedAt: now,
  },
];
const PREVIEW_TEST_CONTENT = {
  attempts: [],
  questions: [
    {
      answer: 1,
      options: ["Vasoconstriction", "A dry cough", "Hyperglycemia", "Tachycardia"],
      q: "Which classic side effect is bradykinin-mediated with ACE inhibitors?",
      why: "ACE also degrades bradykinin - blocking it lets bradykinin build up in the airways.",
    },
    {
      answer: 0,
      options: ["Lisinopril", "Enalapril", "Ramipril", "Fosinopril"],
      q: "Which ACE inhibitor is NOT a prodrug?",
      why: "Lisinopril (and captopril) are active as given; the rest need hepatic activation.",
    },
    {
      answer: 2,
      options: ["Potassium loss", "Neutropenia", "Angioedema", "QT prolongation"],
      q: "Which rare but dangerous reaction contraindicates future ACE inhibitor use?",
      why: "Angioedema can be airway-threatening and recurs on rechallenge.",
    },
  ],
};
const PREVIEW_MAP_CONTENT = {
  outline: "# RAAS pathway\n- Renin release\n  - Juxtaglomerular cells\n  - Triggered by low perfusion\n- Angiotensin II\n  - Vasoconstriction\n  - Aldosterone release\n- Drug targets\n  - ACE inhibitors\n  - ARBs",
};
const PREVIEW_ARTIFACTS: StudyArtifact[] = [
  { id: "preview-test", kind: "test", groupName: "Cardiovascular pharmacology", title: "ACE inhibitor practice test", status: "ready", content: PREVIEW_TEST_CONTENT, createdAt: now, updatedAt: now },
  { id: "preview-map", kind: "mindmap", groupName: "Cardiovascular pharmacology", title: "RAAS pathway", status: "ready", content: PREVIEW_MAP_CONTENT, createdAt: now, updatedAt: now },
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

export function normalizeStudyTags(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim().replace(/^#+/, "").toLowerCase()).filter(Boolean)));
}

/** Import never merges into an existing deck (re-imports would double every
 *  card) — collisions get an "(imported)" suffix instead. Mutates `taken`. */
function availableDeckName(base: string, taken: Set<string>): string {
  const trimmed = base.trim() || "Imported deck";
  if (!taken.has(trimmed.toLowerCase())) {
    taken.add(trimmed.toLowerCase());
    return trimmed;
  }
  for (let suffix = 1; ; suffix += 1) {
    const candidate = suffix === 1 ? `${trimmed} (imported)` : `${trimmed} (imported ${suffix})`;
    if (!taken.has(candidate.toLowerCase())) {
      taken.add(candidate.toLowerCase());
      return candidate;
    }
  }
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
    flag: normalizeStudyFlag(raw.flag),
    tags: Array.isArray(raw.tags) ? normalizeStudyTags(raw.tags.filter((value): value is string => typeof value === "string")) : [],
    payload: parseOcclusionPayload(raw.payload),
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
  return { id: raw.id, kind: raw.kind, groupName: text(raw.group_name), title: raw.title, status, content: "content" in raw ? raw.content : null, createdAt: text(raw.created_at), updatedAt: text(raw.updated_at) };
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
        .select(CARD_COLUMNS)
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
        .select("id,kind,group_name,title,status,content,created_at,updated_at")
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
  tags?: string[];
}

/** Card scheduling fields captured before a grade so the grade can be undone. */
export interface StudyScheduleSnapshot {
  dueAt: string;
  intervalDays: number;
  repetitions: number;
  lapses: number;
}

/** Cloze and occlusion cards carry the answer in the front, so the back is optional. */
function requiresBack(front: string, type: StudyCardType | undefined): boolean {
  return type !== "cloze" && type !== "image_occlusion" && !hasCloze(front);
}

export interface UpdateCardInput {
  id: string;
  front: string;
  back: string;
  cardType: StudyCardType;
  flag: number;
  tags: string[];
}

export interface CreateOcclusionInput {
  deckId: string;
  /** The chosen image file — required in cloud mode, unused in preview. */
  file: File | null;
  /** Inline data URL of the same image, used directly in preview mode. */
  dataUrl: string;
  width: number;
  height: number;
  mode: OcclusionMode;
  shapes: OcclusionShape[];
  /** Optional notes shown after reveal on every card in the batch. */
  notes: string;
  tags?: string[];
  sourcePath?: string | null;
}

// Signed URLs for the private study-images bucket, cached until shortly
// before they expire so a review session never re-signs per card flip.
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

/** Resolves an occlusion payload image (storage path or inline URL) to something renderable. */
export async function resolveStudyImageUrl(image: string): Promise<string> {
  if (/^(data:|blob:|https?:)/.test(image)) return image;
  const cached = signedUrlCache.get(image);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  const { data, error } = await supabase.storage.from("study-images").createSignedUrl(image, 3600);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "Couldn't load the card image.");
  signedUrlCache.set(image, { url: data.signedUrl, expiresAt: Date.now() + 3_300_000 });
  return data.signedUrl;
}

export interface CreateArtifactInput {
  kind: StudyArtifactKind;
  groupName?: string;
  title: string;
  content?: unknown;
  status?: "draft" | "ready";
}

export interface ImportDeckInput {
  name: string;
  cards: { front: string; back: string; cardType: StudyCardType; tags: string[] }[];
}

export interface ImportDecksSummary {
  deckCount: number;
  cardCount: number;
}

export interface UseCloudStudyApi extends StoreState {
  selectDeck: (deckId: string | null) => void;
  reload: () => void;
  createDeck: (input: CreateDeckInput) => Promise<StudyDeck>;
  createCard: (input: CreateCardInput) => Promise<StudyCard>;
  createOcclusionCards: (input: CreateOcclusionInput) => Promise<StudyCard[]>;
  importAnkiDecks: (decks: ImportDeckInput[], onProgress?: (done: number, total: number) => void) => Promise<ImportDecksSummary>;
  updateCard: (input: UpdateCardInput) => Promise<StudyCard>;
  createArtifact: (input: CreateArtifactInput) => Promise<StudyArtifact>;
  updateArtifact: (artifactId: string, patch: { title?: string; content?: unknown; status?: "draft" | "ready" | "archived" }) => Promise<void>;
  deleteArtifact: (artifactId: string) => Promise<void>;
  gradeCard: (cardId: string, grade: StudyGrade) => Promise<StudyCard>;
  undoGrade: (cardId: string, snapshot: StudyScheduleSnapshot) => Promise<StudyCard>;
  setCardSuspended: (cardId: string, suspended: boolean) => Promise<StudyCard>;
  setCardFlag: (cardId: string, flag: number) => Promise<StudyCard>;
  /** Record a session-only learning press in stats (no scheduling change). */
  logStudyPress: (cardId: string, grade: StudyGrade) => void;
  moveDeck: (deckId: string, targetGroup: string) => Promise<void>;
  moveDeckGroup: (sourceGroup: string, targetGroup: string) => Promise<void>;
  deleteDeck: (deckId: string) => Promise<void>;
  /** Signed-in user id (null in preview / signed-out) — the AI card helpers
   *  need it for the metered completion call. */
  userId: string | null;
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
    if (!front || (!back && requiresBack(front, input.cardType))) throw new Error("Add both a prompt and an answer.");
    const tags = normalizeStudyTags(input.tags ?? []);
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
        flag: 0,
        tags,
        payload: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      setState({ ...state, cards: [card, ...state.cards], selectedDeckId: card.deckId });
      return card;
    }
    if (!userId) throw new Error("Sign in to create a card.");
    const { data, error } = await supabase
      .from("study_cards")
      .insert({ user_id: userId, deck_id: input.deckId, front, back, card_type: input.cardType ?? "basic", source_path: input.sourcePath?.trim() || null, tags })
      .select(CARD_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    const card = toCard(data);
    if (!card) throw new Error("The card was saved but returned an invalid response.");
    setState({ ...state, cards: [card, ...state.cards], selectedDeckId: card.deckId });
    return card;
  }, [preview, userId]);

  // One image, many cards: the image uploads once and every mask becomes its
  // own card pointing at that mask, so masks schedule independently.
  const createOcclusionCards = useCallback(async (input: CreateOcclusionInput) => {
    if (input.shapes.length === 0) throw new Error("Draw at least one mask over the image.");
    if (!(input.width > 0) || !(input.height > 0)) throw new Error("The image failed to load — try another file.");
    const tags = normalizeStudyTags(input.tags ?? []);
    const notes = input.notes.trim();
    const sourcePath = input.sourcePath?.trim() || null;
    const timestamp = new Date().toISOString();
    const base = { kind: "occlusion" as const, width: input.width, height: input.height, mode: input.mode, shapes: input.shapes };
    if (preview) {
      const cards: StudyCard[] = input.shapes.map((shape, index) => ({
        id: `preview-${crypto.randomUUID()}`,
        deckId: input.deckId,
        front: occlusionCardFront(shape.label, index),
        back: notes,
        cardType: "image_occlusion",
        sourcePath,
        dueAt: timestamp,
        intervalDays: 0,
        repetitions: 0,
        lapses: 0,
        suspended: false,
        flag: 0,
        tags,
        payload: { ...base, image: input.dataUrl, targetId: shape.id },
        createdAt: timestamp,
        updatedAt: timestamp,
      }));
      setState({ ...state, cards: [...cards, ...state.cards], selectedDeckId: input.deckId });
      return cards;
    }
    if (!userId) throw new Error("Sign in to create cards.");
    if (!input.file) throw new Error("Choose an image first.");
    const extension =
      input.file.type === "image/png" ? "png" : input.file.type === "image/webp" ? "webp" : input.file.type === "image/gif" ? "gif" : "jpg";
    const path = `${userId}/${crypto.randomUUID()}.${extension}`;
    const uploaded = await supabase.storage
      .from("study-images")
      .upload(path, input.file, { contentType: input.file.type || "image/jpeg", upsert: false });
    if (uploaded.error) throw new Error(uploaded.error.message);
    const rows = input.shapes.map((shape, index) => ({
      user_id: userId,
      deck_id: input.deckId,
      front: occlusionCardFront(shape.label, index),
      back: notes,
      card_type: "image_occlusion",
      source_path: sourcePath,
      tags,
      payload: { ...base, image: path, targetId: shape.id },
    }));
    const { data, error } = await supabase.from("study_cards").insert(rows).select(CARD_COLUMNS);
    if (error) throw new Error(error.message);
    const cards = (data ?? []).flatMap((row) => {
      const card = toCard(row);
      return card ? [card] : [];
    });
    if (cards.length === 0) throw new Error("The cards were saved but returned an invalid response.");
    setState({ ...state, cards: [...cards, ...state.cards], selectedDeckId: input.deckId });
    return cards;
  }, [preview, userId]);

  // Anki import lands whole decks at once: rows insert in chunks and the
  // store updates once at the end. If a chunk fails partway, whatever already
  // saved still merges into state before the error surfaces, so the UI never
  // hides cards that made it to the database.
  const importAnkiDecks = useCallback(async (input: ImportDeckInput[], onProgress?: (done: number, total: number) => void) => {
    const total = input.reduce((sum, deck) => sum + deck.cards.length, 0);
    if (total === 0) throw new Error("There are no cards to import.");
    if (!preview && !userId) throw new Error("Sign in to import decks.");
    const taken = new Set(state.decks.map((deck) => deck.name.toLowerCase()));
    const timestamp = new Date().toISOString();
    const newDecks: StudyDeck[] = [];
    const newCards: StudyCard[] = [];
    let done = 0;
    const commit = () => {
      if (newDecks.length === 0) return;
      setState({
        ...state,
        decks: [...newDecks, ...state.decks],
        cards: [...newCards, ...state.cards],
        selectedDeckId: newDecks[0]?.id ?? state.selectedDeckId,
      });
    };
    try {
      for (const deck of input) {
        const name = availableDeckName(deck.name, taken);
        if (preview) {
          const created: StudyDeck = { id: `preview-${crypto.randomUUID()}`, name, description: "Imported from Anki", sourcePath: null, createdAt: timestamp, updatedAt: timestamp };
          newDecks.push(created);
          for (const card of deck.cards) {
            newCards.push({
              id: `preview-${crypto.randomUUID()}`,
              deckId: created.id,
              front: card.front,
              back: card.back,
              cardType: card.cardType,
              sourcePath: null,
              dueAt: timestamp,
              intervalDays: 0,
              repetitions: 0,
              lapses: 0,
              suspended: false,
              flag: 0,
              tags: normalizeStudyTags(card.tags),
              payload: null,
              createdAt: timestamp,
              updatedAt: timestamp,
            });
          }
          done += deck.cards.length;
          onProgress?.(done, total);
          continue;
        }
        const { data, error } = await supabase
          .from("study_decks")
          .insert({ user_id: userId, name, description: "Imported from Anki", source_path: null })
          .select("id,name,description,source_path,created_at,updated_at")
          .single();
        if (error) throw new Error(error.message);
        const created = toDeck(data);
        if (!created) throw new Error("The deck was saved but returned an invalid response.");
        newDecks.push(created);
        const CHUNK = 100;
        for (let index = 0; index < deck.cards.length; index += CHUNK) {
          const rows = deck.cards.slice(index, index + CHUNK).map((card) => ({
            user_id: userId,
            deck_id: created.id,
            front: card.front,
            back: card.back,
            card_type: card.cardType,
            source_path: null,
            tags: normalizeStudyTags(card.tags),
          }));
          const inserted = await supabase.from("study_cards").insert(rows).select(CARD_COLUMNS);
          if (inserted.error) throw new Error(inserted.error.message);
          newCards.push(...(inserted.data ?? []).flatMap((row) => {
            const card = toCard(row);
            return card ? [card] : [];
          }));
          done += rows.length;
          onProgress?.(done, total);
        }
      }
    } catch (cause) {
      commit();
      throw cause instanceof Error ? cause : new Error("The import stopped partway.");
    }
    commit();
    return { cardCount: newCards.length, deckCount: newDecks.length };
  }, [preview, userId]);

  const updateCard = useCallback(async (input: UpdateCardInput) => {
    const existing = state.cards.find((item) => item.id === input.id);
    if (!existing) throw new Error("That card is no longer available.");
    const front = input.front.trim();
    const back = input.back.trim();
    if (!front || (!back && requiresBack(front, input.cardType))) throw new Error("Add both a prompt and an answer.");
    const updatedAt = new Date().toISOString();
    const tags = normalizeStudyTags(input.tags);
    let next: StudyCard = { ...existing, front, back, cardType: input.cardType, flag: input.flag, tags, updatedAt };
    if (!preview) {
      if (!userId) throw new Error("Sign in to edit a card.");
      const { data, error } = await supabase
        .from("study_cards")
        .update({ front, back, card_type: input.cardType, flag: input.flag, flagged: input.flag > 0, tags, updated_at: updatedAt })
        .eq("id", input.id)
        .eq("user_id", userId)
        .select(CARD_COLUMNS)
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
      const artifact: StudyArtifact = { id: `preview-${crypto.randomUUID()}`, kind: input.kind, groupName, title, status: input.status ?? "draft", content: input.content ?? null, createdAt: timestamp, updatedAt: timestamp };
      setState({ ...state, artifacts: [artifact, ...state.artifacts] });
      return artifact;
    }
    if (!userId) throw new Error("Sign in to create study material.");
    const { data, error } = await supabase
      .from("study_artifacts")
      .insert({ user_id: userId, kind: input.kind, group_name: groupName, title, content: input.content ?? null, status: input.status ?? "draft" })
      .select("id,kind,group_name,title,status,content,created_at,updated_at")
      .single();
    if (error) throw new Error(error.message);
    const artifact = toArtifact(data);
    if (!artifact) throw new Error("The study item was saved but returned an invalid response.");
    setState({ ...state, artifacts: [artifact, ...state.artifacts] });
    return artifact;
  }, [preview, userId]);

  const updateArtifact = useCallback(async (artifactId: string, patch: { title?: string; content?: unknown; status?: "draft" | "ready" | "archived" }) => {
    const timestamp = new Date().toISOString();
    const apply = (artifact: StudyArtifact): StudyArtifact => ({
      ...artifact,
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.content !== undefined ? { content: patch.content } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      updatedAt: timestamp,
    });
    if (preview) {
      setState({ ...state, artifacts: state.artifacts.map((artifact) => (artifact.id === artifactId ? apply(artifact) : artifact)) });
      return;
    }
    if (!userId) throw new Error("Sign in to update study material.");
    const row: Record<string, unknown> = {};
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.content !== undefined) row.content = patch.content;
    if (patch.status !== undefined) row.status = patch.status;
    const { error } = await supabase.from("study_artifacts").update(row).eq("id", artifactId).eq("user_id", userId);
    if (error) throw new Error(error.message);
    setState({ ...state, artifacts: state.artifacts.map((artifact) => (artifact.id === artifactId ? apply(artifact) : artifact)) });
  }, [preview, state, userId]);

  const deleteArtifact = useCallback(async (artifactId: string) => {
    if (!preview) {
      if (!userId) throw new Error("Sign in to delete study material.");
      const { error } = await supabase.from("study_artifacts").delete().eq("id", artifactId).eq("user_id", userId);
      if (error) throw new Error(error.message);
    }
    setState({ ...state, artifacts: state.artifacts.filter((artifact) => artifact.id !== artifactId) });
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

  // Restores the pre-grade schedule. The review-log row from the undone grade
  // stays (the client can only insert logs by design), which at worst counts
  // one extra review in stats — the card itself is fully restored.
  const undoGrade = useCallback(async (cardId: string, snapshot: StudyScheduleSnapshot) => {
    const card = state.cards.find((item) => item.id === cardId);
    if (!card) throw new Error("That card is no longer available.");
    const updatedAt = new Date().toISOString();
    if (!preview) {
      if (!userId) throw new Error("Sign in to review cards.");
      const { error } = await supabase
        .from("study_cards")
        .update({ due_at: snapshot.dueAt, interval_days: snapshot.intervalDays, repetitions: snapshot.repetitions, lapses: snapshot.lapses, updated_at: updatedAt })
        .eq("id", cardId)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
    }
    const restored: StudyCard = { ...card, ...snapshot, updatedAt };
    const reviews = [...state.reviews];
    const latest = reviews.findIndex((review) => review.cardId === cardId && review.id.startsWith("local-"));
    if (latest !== -1) reviews.splice(latest, 1);
    setState({ ...state, cards: state.cards.map((item) => (item.id === cardId ? restored : item)), reviews });
    return restored;
  }, [preview, userId]);

  const setCardSuspended = useCallback(async (cardId: string, suspended: boolean) => {
    const card = state.cards.find((item) => item.id === cardId);
    if (!card) throw new Error("That card is no longer available.");
    if (card.suspended === suspended) return card;
    const updatedAt = new Date().toISOString();
    if (!preview) {
      if (!userId) throw new Error("Sign in to edit a card.");
      const { error } = await supabase
        .from("study_cards")
        .update({ suspended, updated_at: updatedAt })
        .eq("id", cardId)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
    }
    const next: StudyCard = { ...card, suspended, updatedAt };
    setState({ ...state, cards: state.cards.map((item) => (item.id === cardId ? next : item)) });
    return next;
  }, [preview, userId]);

  const setCardFlag = useCallback(async (cardId: string, flag: number) => {
    const card = state.cards.find((item) => item.id === cardId);
    if (!card) throw new Error("That card is no longer available.");
    if (card.flag === flag) return card;
    const updatedAt = new Date().toISOString();
    if (!preview) {
      if (!userId) throw new Error("Sign in to edit a card.");
      const { error } = await supabase
        .from("study_cards")
        .update({ flag, flagged: flag > 0, updated_at: updatedAt })
        .eq("id", cardId)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
    }
    const next: StudyCard = { ...card, flag, updatedAt };
    setState({ ...state, cards: state.cards.map((item) => (item.id === cardId ? next : item)) });
    return next;
  }, [preview, userId]);

  // Session-only learning presses (no scheduler write) still count in stats —
  // Anki logs every answer. Best-effort by design: a lost row only
  // under-counts the heatmap, so a failure never interrupts the review.
  const logStudyPress = useCallback((cardId: string, grade: StudyGrade) => {
    const card = state.cards.find((item) => item.id === cardId);
    if (!card) return;
    const review: StudyReview = { id: `local-${crypto.randomUUID()}`, cardId, grade, reviewedAt: new Date().toISOString() };
    setState({ ...state, reviews: [review, ...state.reviews] });
    if (preview || !userId) return;
    void supabase
      .from("study_review_logs")
      .insert({
        user_id: userId,
        card_id: cardId,
        grade,
        previous_due: card.dueAt,
        next_due: card.dueAt,
        interval_days: Math.min(36500, Math.max(1, Math.round(card.intervalDays))),
      })
      .then(({ error }) => {
        if (error) console.warn("Study press log skipped:", error.message);
      });
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

  return {
    ...snapshot,
    selectDeck: useCallback((deckId: string | null) => setState({ ...state, selectedDeckId: deckId }), []),
    reload,
    createDeck,
    createCard,
    createOcclusionCards,
    importAnkiDecks,
    updateCard,
    createArtifact,
    updateArtifact,
    deleteArtifact,
    userId,
    gradeCard,
    undoGrade,
    setCardSuspended,
    setCardFlag,
    logStudyPress,
    moveDeck,
    moveDeckGroup,
    deleteDeck,
  };
}
