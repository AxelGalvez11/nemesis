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
} from "@nemesis/shared";
import { scheduleStudyCard, type StudyGrade } from "./study-scheduler";
import { fetchAllRows } from "./supabase-paging";
import { decksInGroup, isWithinGroup, normalizeGroupPath, planGroupDissolve, renamedGroupPath, rewriteGroupPrefix } from "./study-tree";

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
// Deliberately not a medical diagram — see the field-agnostic rule in CLAUDE.md.
const PREVIEW_OCCLUSION_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" viewBox="0 0 480 300"><rect width="480" height="300" fill="#fafafa"/><text x="24" y="42" font-family="Helvetica, Arial, sans-serif" font-size="19" font-weight="700" fill="#18181b">I-beam cross-section</text><rect x="140" y="92" width="150" height="22" fill="#e4e4e7" stroke="#a1a1aa" stroke-width="2"/><rect x="196" y="114" width="38" height="96" fill="#e4e4e7" stroke="#a1a1aa" stroke-width="2"/><rect x="140" y="210" width="150" height="22" fill="#e4e4e7" stroke="#a1a1aa" stroke-width="2"/><line x1="130" y1="162" x2="300" y2="162" stroke="#dc2626" stroke-width="2" stroke-dasharray="6 4"/><line x1="290" y1="103" x2="318" y2="112" stroke="#a1a1aa" stroke-width="1.5"/><line x1="300" y1="162" x2="318" y2="172" stroke="#a1a1aa" stroke-width="1.5"/><line x1="290" y1="221" x2="318" y2="232" stroke="#a1a1aa" stroke-width="1.5"/><rect x="322" y="98" width="128" height="28" rx="6" fill="#ffffff" stroke="#d4d4d8"/><text x="334" y="117" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#18181b">Top flange</text><rect x="322" y="158" width="128" height="28" rx="6" fill="#ffffff" stroke="#d4d4d8"/><text x="334" y="177" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#18181b">Neutral axis</text><rect x="322" y="218" width="128" height="28" rx="6" fill="#ffffff" stroke="#d4d4d8"/><text x="334" y="237" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#18181b">Bottom flange</text></svg>`;
const PREVIEW_OCCLUSION_PAYLOAD: OcclusionPayload = {
  kind: "occlusion",
  image: `data:image/svg+xml;utf8,${encodeURIComponent(PREVIEW_OCCLUSION_SVG)}`,
  width: 480,
  height: 300,
  mode: "hide-all",
  shapes: [
    { id: "top", x: 322, y: 98, w: 128, h: 28, label: "Top flange" },
    { id: "mid", x: 322, y: 158, w: 128, h: 28, label: "Neutral axis" },
    { id: "bottom", x: 322, y: 218, w: 128, h: 28, label: "Bottom flange" },
  ],
  targetId: "top",
};
// Several decks from unrelated fields: one deck cannot show what the review table looks
// like in use, and a single-subject list would imply Nemesis is for that subject.
const PREVIEW_DECKS: StudyDeck[] = [
  {
    id: "preview-constitutional",
    name: "Constitutional law",
    description: "Doctrinal tests, leading cases, and the language examiners quote.",
    sourcePath: "Constitutional law/Commerce power/The commerce clause.md",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "preview-mechanics",
    name: "Statics and dynamics",
    description: "Free-body diagrams, equilibrium, and bending stress.",
    sourcePath: "Structural engineering/Mechanics/Bending stress.md",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "preview-baroque-deck",
    name: "Baroque painting",
    description: "Attribution, lighting arguments, and the major commissions.",
    sourcePath: "Art history/01 Intro to the Baroque.md",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "preview-spanish",
    name: "Spanish, unit 4",
    description: "The subjunctive, and the verbs that always trigger it.",
    sourcePath: null,
    createdAt: now,
    updatedAt: now,
  },
];

/** Compact filler card — the review table only reads deckId and scheduling state. */
const previewCard = (id: string, deckId: string, front: string, back: string, over: Partial<StudyCard> = {}): StudyCard => ({
  id,
  deckId,
  front,
  back,
  cardType: "basic",
  sourcePath: null,
  dueAt: now,
  intervalDays: 0,
  repetitions: 0,
  lapses: 0,
  suspended: false,
  flag: 0,
  tags: [],
  payload: null,
  createdAt: now,
  updatedAt: now,
  ...over,
});
const PREVIEW_CARDS: StudyCard[] = [
  {
    id: "preview-card-ace",
    deckId: "preview-constitutional",
    front: "What three categories may Congress regulate under the commerce power?",
    back: "The channels of interstate commerce, its instrumentalities, and activities that substantially affect it.",
    cardType: "basic",
    sourcePath: "Constitutional law/Commerce power/The commerce clause.md",
    dueAt: now,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    suspended: false,
    flag: 1,
    tags: ["doctrine", "tests"],
    payload: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "preview-card-cough",
    deckId: "preview-constitutional",
    front: "Which test applies to an even-handed law that only incidentally burdens interstate commerce?",
    back: "Pike balancing.",
    cardType: "basic",
    sourcePath: "Constitutional law/Commerce power/The commerce clause.md",
    dueAt: now,
    intervalDays: 0,
    repetitions: 11,
    // Failed enough times to trip the leech radar in /dev-preview.
    lapses: 9,
    suspended: false,
    flag: 0,
    tags: ["balancing"],
    payload: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "preview-card-cloze",
    deckId: "preview-constitutional",
    front: "{{c1::Pike balancing}} asks whether the burden is {{c2::clearly excessive::the threshold}} next to the {{c3::local benefit}}.",
    back: "Pike v. Bruce Church supplies the language most answers quote.",
    cardType: "cloze",
    sourcePath: null,
    dueAt: now,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    suspended: false,
    flag: 0,
    tags: ["doctrine"],
    payload: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "preview-card-suspended",
    deckId: "preview-constitutional",
    front: "Which case supplies the aggregation principle?",
    back: "Wickard v. Filburn — small local acts count once aggregated.",
    cardType: "basic",
    sourcePath: null,
    dueAt: now,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    suspended: true,
    flag: 0,
    tags: ["doctrine"],
    payload: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "preview-card-occlusion",
    deckId: "preview-constitutional",
    front: "Neutral axis",
    back: "The line through a bent section where bending stress is zero; stress grows linearly away from it.",
    cardType: "image_occlusion",
    sourcePath: null,
    dueAt: now,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    suspended: false,
    flag: 0,
    tags: ["mechanics"],
    payload: PREVIEW_OCCLUSION_PAYLOAD,
    createdAt: now,
    updatedAt: now,
  },
];
const PREVIEW_TEST_CONTENT = {
  // Two sittings of the same test, so /dev-preview can exercise the Stats page's
  // practice-test section — including the retake case, where the second attempt
  // must read as its own result rather than replacing the first.
  attempts: [
    { at: "2026-07-21T18:04:00.000Z", missed: [{ picked: 0, questionIndex: 1 }, { picked: 3, questionIndex: 2 }], score: 2, total: 4 },
    { at: "2026-07-26T09:30:00.000Z", missed: [{ picked: 2, questionIndex: 3 }], score: 3, total: 4 },
  ],
  questions: [
    {
      answer: 1,
      options: ["Strict scrutiny", "Pike balancing", "Rational basis", "Intermediate scrutiny"],
      q: "Which test governs an even-handed law with an incidental burden on interstate commerce?",
      why: "Even-handed laws go to Pike, where the burden is weighed against the local benefit.",
    },
    {
      answer: 0,
      options: ["Wickard v. Filburn", "Pike v. Bruce Church", "Lopez", "Morrison"],
      q: "Which case established the aggregation principle?",
      why: "Wickard held that wheat grown for personal use still counts in the aggregate.",
    },
    {
      answer: 2,
      options: ["Rational basis", "Automatic upholding", "Virtually per se invalidity", "Remand"],
      q: "What follows once a law facially discriminates against out-of-state commerce?",
      why: "Facial discrimination is virtually per se invalid absent no non-discriminatory alternative.",
    },
    // The attempts above score out of FOUR questions, and the second sitting
    // missed this one (picked: 2) — the review screen needs the question to
    // exist to show that red "your pick" row.
    {
      answer: 0,
      options: ["The market-participant doctrine", "Field preemption", "The dormant commerce clause", "Ex parte Young"],
      q: "Which exception lets a state favor its own residents when it buys or sells in the market?",
      why: "A state acting as a market participant may prefer its own citizens without dormant-commerce scrutiny.",
    },
  ],
};
const PREVIEW_MAP_CONTENT = {
  outline: "# Commerce power\n- Channels\n  - Roads, rivers, wires\n  - Regulated directly\n- Instrumentalities\n  - Vehicles and persons\n  - Protected in transit\n- Substantial effects\n  - Aggregation\n  - Economic activity",
};
// Filler for the other decks so the review table shows a realistic spread of counts.
const PREVIEW_FILLER: StudyCard[] = [
  previewCard("pf-m1", "preview-mechanics", "Where is bending stress zero in a beam section?", "At the neutral axis."),
  previewCard("pf-m2", "preview-mechanics", "State the equilibrium conditions for a 2D rigid body.", "Sum of forces in x and y is zero, and sum of moments is zero.", { repetitions: 4, intervalDays: 3 }),
  previewCard("pf-m3", "preview-mechanics", "What does the second moment of area measure?", "How a section's material is distributed about the bending axis."),
  previewCard("pf-b1", "preview-baroque-deck", "What is tenebrism?", "Extreme contrast between light and dark, with light used to stage the drama."),
  previewCard("pf-b2", "preview-baroque-deck", "Which commission cycle established Caravaggio's reputation?", "The Contarelli Chapel paintings of St Matthew.", { repetitions: 2, intervalDays: 2 }),
  previewCard("pf-s1", "preview-spanish", "Which verbs of wishing trigger the subjunctive?", "querer, desear, esperar, preferir."),
  previewCard("pf-s2", "preview-spanish", "Give the present subjunctive of tener, first person.", "tenga.", { repetitions: 6, intervalDays: 5 }),
  previewCard("pf-s3", "preview-spanish", "Does 'creer que' take the indicative or the subjunctive?", "Indicative when affirmative; subjunctive when negated."),
];

const PREVIEW_ARTIFACTS: StudyArtifact[] = [
  { id: "preview-test", kind: "test", groupName: "Constitutional law", title: "Commerce clause practice test", status: "ready", content: PREVIEW_TEST_CONTENT, createdAt: now, updatedAt: now },
  { id: "preview-map", kind: "mindmap", groupName: "Constitutional law", title: "Commerce power", status: "ready", content: PREVIEW_MAP_CONTENT, createdAt: now, updatedAt: now },
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
    // Every sort ends in `id` so the page boundaries are stable: due_at is not
    // unique (16 cards inserted in one statement share the same now()), and an
    // unstable sort loses rows across pages instead of truncating visibly.
    const [deckRows, cardRows, reviewRows, artifactRows] = await Promise.all([
      fetchAllRows((from, to) => supabase
        .from("study_decks")
        .select("id,name,description,source_path,created_at,updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .order("id")
        .range(from, to)),
      fetchAllRows((from, to) => supabase
        .from("study_cards")
        .select(CARD_COLUMNS)
        .eq("user_id", userId)
        .order("due_at", { ascending: true })
        .order("id")
        .range(from, to)),
      fetchAllRows((from, to) => supabase
        .from("study_review_logs")
        .select("id,card_id,grade,reviewed_at")
        .eq("user_id", userId)
        .gte("reviewed_at", reviewFloor.toISOString())
        .order("reviewed_at", { ascending: false })
        .order("id")
        .range(from, to)),
      fetchAllRows((from, to) => supabase
        .from("study_artifacts")
        .select("id,kind,group_name,title,status,content,created_at,updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .order("id")
        .range(from, to)),
    ]);

    const decks = (deckRows ?? []).flatMap((row) => {
      const deck = toDeck(row);
      return deck ? [deck] : [];
    });
    const cards = (cardRows ?? []).flatMap((row) => {
      const card = toCard(row);
      return card ? [card] : [];
    });
    const reviews = (reviewRows ?? []).flatMap((row) => {
      const review = toReview(row);
      return review ? [review] : [];
    });
    const artifacts = (artifactRows ?? []).flatMap((row) => {
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

/**
 * Re-read Study from the database after something OUTSIDE this store wrote to
 * it — in practice, the chat's agent tools (add_practice_test, add_flashcards,
 * and friends), which write straight to Supabase.
 *
 * Owner 2026-08-01: "i asked the chat to create an organic chemistry quiz but
 * it routed to tests but it wasnt there." The row was always saved correctly.
 * The Study page simply never heard about it: the Library store keeps a live
 * Supabase channel open and refreshes itself, and this store has none, so its
 * in-memory list stayed as it was and the new test only appeared after a full
 * page reload. Module-level on purpose — the writer is not a React component
 * and has no hook to call.
 *
 * A no-op when nobody is signed in, so it is always safe to call.
 */
export function refreshStudyAfterExternalWrite(): void {
  if (loadedForUserId) void loadStudy(loadedForUserId);
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

export interface UpdateArtifactPatch {
  title?: string;
  content?: unknown;
  status?: "draft" | "ready" | "archived";
  /** Folder this item sits in; "" moves it back to Ungrouped. */
  groupName?: string;
}

export interface ImportDeckInput {
  name: string;
  source?: "Anki" | "Quizlet";
  // suspended/flag are optional because Quizlet has neither concept — only an
  // Anki package can say a card was parked or marked.
  cards: { front: string; back: string; cardType: StudyCardType; tags: string[]; suspended?: boolean; flag?: number }[];
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
  updateArtifact: (artifactId: string, patch: UpdateArtifactPatch) => Promise<void>;
  deleteArtifact: (artifactId: string) => Promise<void>;
  gradeCard: (cardId: string, grade: StudyGrade) => Promise<StudyCard>;
  undoGrade: (cardId: string, snapshot: StudyScheduleSnapshot) => Promise<StudyCard>;
  setCardSuspended: (cardId: string, suspended: boolean) => Promise<StudyCard>;
  setCardFlag: (cardId: string, flag: number) => Promise<StudyCard>;
  /** Record a session-only learning press in stats (no scheduling change). */
  logStudyPress: (cardId: string, grade: StudyGrade) => void;
  moveDeck: (deckId: string, targetGroup: string) => Promise<void>;
  moveDeckGroup: (sourceGroup: string, targetGroup: string) => Promise<void>;
  /** Rename a deck in place — its folder path is untouched. */
  renameDeck: (deckId: string, nextLeaf: string) => Promise<void>;
  /** Rename a folder in place, rewriting every deck name beneath it. */
  renameDeckGroup: (group: string, nextLeaf: string) => Promise<void>;
  /** Delete a folder AND every deck (and card) beneath it. */
  /** Removes the folder and KEEPS its decks, promoting them one level up. */
  dissolveDeckGroup: (group: string) => Promise<void>;
  deleteDeckGroup: (group: string) => Promise<void>;
  deleteDeck: (deckId: string) => Promise<void>;
  /** Throw away ONE card, leaving its deck and every other card alone. There
   *  was no way to do this at all: a student who generated a bad card could
   *  suspend it, but never be rid of it. */
  deleteCard: (cardId: string) => Promise<void>;
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
          cards: [...PREVIEW_CARDS, ...PREVIEW_FILLER],
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
          const created: StudyDeck = { id: `preview-${crypto.randomUUID()}`, name, description: `Imported from ${deck.source ?? "Anki"}`, sourcePath: null, createdAt: timestamp, updatedAt: timestamp };
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
              suspended: card.suspended === true,
              flag: card.flag ?? 0,
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
          .insert({ user_id: userId, name, description: `Imported from ${deck.source ?? "Anki"}`, source_path: null })
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
            // Carried so a shared deck arrives in the state its owner left it
            // in: importing 35,000 suspended cards as active is unusable.
            suspended: card.suspended === true,
            flag: card.flag ?? 0,
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

  const updateArtifact = useCallback(async (artifactId: string, patch: UpdateArtifactPatch) => {
    const timestamp = new Date().toISOString();
    const apply = (artifact: StudyArtifact): StudyArtifact => ({
      ...artifact,
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.content !== undefined ? { content: patch.content } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.groupName !== undefined ? { groupName: patch.groupName } : {}),
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
    if (patch.groupName !== undefined) row.group_name = patch.groupName;
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
      // 🔴 Due time comes from `dueInMinutes`, NOT from intervalDays. A
      // relearning card is due in ten minutes while carrying an interval of one
      // day; adding whole days here would push every failed card to tomorrow and
      // silently reinstate the bug this scheduler exists to fix.
      const { dueInMinutes, ...schedule } = scheduleStudyCard(card, grade);
      const due = new Date(reviewedAt.getTime() + dueInMinutes * 60_000);
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

  // Rename in place: swap the deck's own leaf, keep whatever folder it sits in.
  const renameDeck = useCallback(async (deckId: string, rawLeaf: string) => {
    const deck = state.decks.find((item) => item.id === deckId);
    if (!deck) return;
    const name = renamedGroupPath(deck.name, rawLeaf);
    if (!name || name === deck.name) return;
    if (state.decks.some((item) => item.id !== deckId && item.name.toLowerCase() === name.toLowerCase())) {
      throw new Error("A deck with that name already exists in this folder.");
    }
    if (!preview) {
      if (!userId) throw new Error("Sign in to rename a deck.");
      const { error } = await supabase.from("study_decks").update({ name }).eq("id", deckId).eq("user_id", userId);
      if (error) throw new Error(error.message);
    }
    setState({ ...state, decks: state.decks.map((item) => item.id === deckId ? { ...item, name, updatedAt: new Date().toISOString() } : item) });
  }, [preview, userId]);

  // Renaming a folder rewrites the shared prefix on every deck beneath it —
  // there is no folder row to update.
  const renameDeckGroup = useCallback(async (rawGroup: string, rawLeaf: string) => {
    const source = normalizeGroupPath(rawGroup);
    const destination = renamedGroupPath(source, rawLeaf);
    if (!source || !destination || destination === source) return;
    const renamed = decksInGroup(state.decks, source).flatMap((deck) => {
      const name = rewriteGroupPrefix(deck.name, source, destination);
      return name ? [{ deck, name }] : [];
    });
    const taken = new Set(state.decks.filter((deck) => !isWithinGroup(deck.name, source)).map((deck) => deck.name.toLowerCase()));
    if (renamed.some(({ name }) => taken.has(name.toLowerCase()))) {
      throw new Error("A deck with that name already exists in the destination folder.");
    }
    if (!preview) {
      if (!userId) throw new Error("Sign in to rename a folder.");
      const results = await Promise.all(renamed.map(({ deck, name }) => supabase.from("study_decks").update({ name }).eq("id", deck.id).eq("user_id", userId)));
      const failure = results.find((result) => result.error)?.error;
      if (failure) throw new Error(failure.message);
    }
    const names = new Map(renamed.map(({ deck, name }) => [deck.id, name]));
    setState({ ...state, decks: state.decks.map((deck) => names.has(deck.id) ? { ...deck, name: names.get(deck.id)!, updatedAt: new Date().toISOString() } : deck) });
  }, [preview, userId]);

  // Removing a folder must NOT remove what is in it (owner 2026-07-23: "make
  // folder delete keep the contents"). Every deck inside moves up one level, so
  // the folder stops existing because nothing spells its prefix any more — no
  // deck row and no card is deleted. This replaced deleteDeckGroup, which took
  // the whole subtree with it.
  const dissolveDeckGroup = useCallback(async (rawGroup: string) => {
    const group = normalizeGroupPath(rawGroup);
    if (!group) return;
    const plan = planGroupDissolve(state.decks, group);
    if (plan.length === 0) return;
    if (!preview) {
      if (!userId) throw new Error("Sign in to remove a folder.");
      const results = await Promise.all(plan.map(({ deck, name }) => supabase.from("study_decks").update({ name }).eq("id", deck.id).eq("user_id", userId)));
      const failure = results.find((result) => result.error)?.error;
      if (failure) throw new Error(failure.message);
    }
    const names = new Map(plan.map(({ deck, name }) => [deck.id, name]));
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

  // The destructive sibling of dissolveDeckGroup (owner 2026-08-03: "card deck
  // folders still cannot be deleted" — remove-but-keep was not the ask). Both
  // verbs exist now: "Remove folder" promotes the decks, this one deletes
  // them, cards cascading via the study_cards FK. The caller owns the
  // confirmation dialog; this function assumes the student already said yes.
  const deleteDeckGroup = useCallback(async (rawGroup: string) => {
    const group = normalizeGroupPath(rawGroup);
    if (!group) return;
    const doomed = decksInGroup(state.decks, group);
    if (doomed.length === 0) return;
    if (!preview) {
      if (!userId) throw new Error("Sign in to delete a folder.");
      const { error } = await supabase
        .from("study_decks")
        .delete()
        .in("id", doomed.map((deck) => deck.id))
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
    }
    const goneIds = new Set(doomed.map((deck) => deck.id));
    const decks = state.decks.filter((deck) => !goneIds.has(deck.id));
    setState({
      ...state,
      decks,
      cards: state.cards.filter((card) => !goneIds.has(card.deckId)),
      selectedDeckId: state.selectedDeckId && goneIds.has(state.selectedDeckId) ? (decks[0]?.id ?? null) : state.selectedDeckId,
    });
  }, [preview, userId]);

  // One card, not its deck. Scoped by user_id as well as id so a guessed
  // identifier cannot reach into somebody else's cards — the same belt-and-
  // braces every other write here uses, since row-level security should not be
  // the only thing standing between two students.
  const deleteCard = useCallback(async (cardId: string) => {
    if (!preview) {
      if (!userId) throw new Error("Sign in to delete a card.");
      const { error } = await supabase.from("study_cards").delete().eq("id", cardId).eq("user_id", userId);
      if (error) throw new Error(error.message);
    }
    setState({ ...state, cards: state.cards.filter((card) => card.id !== cardId) });
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
    deleteCard,
    userId,
    gradeCard,
    undoGrade,
    setCardSuspended,
    setCardFlag,
    logStudyPress,
    moveDeck,
    renameDeck,
    renameDeckGroup,
    dissolveDeckGroup,
    deleteDeckGroup,
    moveDeckGroup,
    deleteDeck,
  };
}
