/**
 * A diagram that has already been looked at is not looked at again.
 *
 * 🔴🔴 THE OWNER'S RULE, AND THE GAP IT NAMES: *"Reuse vision results. A figure that Gemini has
 * already interpreted should not require another vision call merely because it appears in another
 * teaching turn."* Nothing in Nemesis reused one. Every parse of a document sent every qualifying
 * figure again — a reparse after a parser upgrade, the same diagram on the summary slide and the
 * recap slide of one lecture, the same course crest on eighty decks, the same figure in the
 * handout and in the slides. Each of those is a separate billed image.
 *
 * 🔴 KEYED ON THE PIXELS, WHICH IS WHY IT WORKS ACROSS DOCUMENTS AND ACROSS FORMATS.
 * `figureContentKey` is a hash of the NORMALIZED bytes — the same key the figure asset store
 * already uses to decide that two decks' copies of one diagram are one object. A TIFF and a PNG of
 * the same figure converge on it. So the cache is not "this document's figures"; it is "pictures
 * this learner has already paid to have described".
 *
 * 🔴 PER LEARNER, FOR THE REASON `parse-reuse.ts` IS. Sharing a description across users would mean
 * one person's private diagram — and whatever a model said about it — becoming the answer served to
 * someone else. That is a change to what user data is rather than an optimisation, and it is on the
 * owner's escalate list, not the decide list.
 *
 * 🔴 AND IT IS AMBIENT, NOT A PARAMETER, EXACTLY AS `VisionLedger` IS. `parseDocument` reaches
 * vision through four call sites across three modules and knows nothing about a database;
 * threading a store through all of them would put a Supabase client into the pure parser. The
 * worker installs a real store for the duration of one parse; everything else gets the no-op, which
 * behaves precisely as production did before this module existed.
 */

import { AsyncLocalStorage } from "node:async_hooks";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { FigureLabel } from "@/lib/learn/figure-labels";

/** What was learned about one picture, and is worth not learning twice. */
export interface FigureDescription {
  readonly description: string;
  /** §46.6 occlusion labels, which came back off the same request and cost nothing extra. */
  readonly labels: readonly FigureLabel[];
  /** Which model said it, so a ladder change is visible rather than inherited silently. */
  readonly model?: string;
}

export interface FigureDescriptionStore {
  /**
   * Descriptions already held for these content keys, produced by THIS question. Missing keys are
   * simply absent.
   *
   * 🔴🔴 `promptVersion` IS PART OF THE KEY, AND LEAVING IT OUT WAS A REAL DEFECT WAITING TO
   * HAPPEN. The content key is a hash of the pixels, so a cached row answers "what did a model say
   * about this picture" — a question whose answer changes the moment the prompt does. When
   * `FIGURE_PROMPT` gained its table clause on 2026-09-03, every table already cached as a
   * one-sentence caption would have been served back forever, and the reparse meant to PROVE the
   * new clause works would have been answered by the old one. A row with a different version, or
   * with none recorded, is a MISS: unknown provenance is not this prompt's answer.
   */
  get(contentKeys: readonly string[], promptVersion: string): Promise<Map<string, FigureDescription>>;
  /** Remember these, against the question that produced them. Never throws — a cache write that
   *  fails must not fail a parse. */
  put(
    entries: readonly ({ contentKey: string } & FigureDescription)[],
    promptVersion: string,
  ): Promise<void>;
}

/**
 * Longest description this cache will remember.
 *
 * 🔴 OVER THIS IT REMEMBERS NOTHING, RATHER THAN REMEMBERING A PIECE. The row used to be written
 * with `description.slice(0, 4_000)`, which is harmless for a caption and corrupting for a
 * transcribed table: a grid cut mid-row is a grid that has quietly lost its last rows, and every
 * later parse of that picture would be served the truncated version as if it were the whole
 * reading. A picture too big to remember is re-read and re-billed, which costs money; a truncated
 * table costs a student the values. The column is unbounded `text`, so this is a size policy
 * rather than a limit the database imposes.
 */
export const MAX_CACHED_DESCRIPTION_CHARS = 16_000;

/**
 * The default, and it is a real object rather than a null check at every call site.
 *
 * 🔴 A NO-OP STORE IS EXACTLY TODAY'S BEHAVIOUR. Every figure misses, every figure is sent, every
 * figure is billed — which is what production did before this file existed. That makes installing
 * the real store a pure addition rather than a change of shape.
 */
export const NO_FIGURE_CACHE: FigureDescriptionStore = {
  async get() {
    return new Map();
  },
  async put() {
    /* nothing to remember and nowhere to remember it */
  },
};

const store = new AsyncLocalStorage<FigureDescriptionStore>();

/** Run `body` with `cache` as the ambient figure-description store. */
export function withFigureCache<T>(cache: FigureDescriptionStore, body: () => Promise<T>): Promise<T> {
  return store.run(cache, body);
}

export function currentFigureCache(): FigureDescriptionStore {
  return store.getStore() ?? NO_FIGURE_CACHE;
}

/**
 * Split images into the ones already described and the ones that still have to be sent. PURE.
 *
 * 🔴 THE HIT LIST IS RETURNED SEPARATELY RATHER THAN MERGED IN, so the caller can report how many
 * calls the cache actually avoided. A saving nobody can count is a saving nobody can defend when
 * somebody later asks whether the cache is worth its table.
 */
export function splitByCache<T extends { readonly name: string }>(
  images: readonly T[],
  keyOf: (image: T) => string,
  cached: ReadonlyMap<string, FigureDescription>,
): { hits: { image: T; found: FigureDescription }[]; misses: T[] } {
  const hits: { image: T; found: FigureDescription }[] = [];
  const misses: T[] = [];
  for (const image of images) {
    const found = cached.get(keyOf(image));
    // 🔴 AN EMPTY DESCRIPTION IS A MISS, NOT A HIT. "The model looked and had nothing to say" is a
    // real outcome and `figure-look.ts` records it as `examined-empty` — but storing it here and
    // serving it back would make one bad reply permanent for that picture, for ever, across every
    // document it ever appears in. The store only ever holds text somebody could read.
    if (found && found.description.trim()) hits.push({ found, image });
    else misses.push(image);
  }
  return { hits, misses };
}

/**
 * The durable store, backed by `figure_descriptions`.
 *
 * 🔴 EVERY FAILURE PATH IS A MISS, NEVER AN ERROR. A cache exists to save money; one that can stop
 * a learner's document being read has cost more than it will ever save. Both methods swallow
 * everything and the parse continues exactly as it did before this table existed.
 */
export function supabaseFigureCache(admin: SupabaseClient, userId: string): FigureDescriptionStore {
  return {
    async get(contentKeys, promptVersion) {
      const found = new Map<string, FigureDescription>();
      const keys = [...new Set(contentKeys)].filter(Boolean);
      if (keys.length === 0) return found;
      try {
        const { data, error } = await admin
          .from("figure_descriptions")
          .select("content_key,description,labels,model")
          // 🔴 SCOPED TO THE OWNER. The service role bypasses row-level security, so this predicate
          // is the whole of the privacy argument — see the migration.
          .eq("user_id", userId)
          // 🔴 AND SCOPED TO THE QUESTION. A row written under a different prompt — or under none,
          // which is every row that existed before 2026-09-03 — does not answer this one. Those
          // rows are left in place and simply never match; the next read overwrites them in
          // `(user_id, content_key)`.
          .eq("prompt_version", promptVersion)
          .in("content_key", keys);
        if (error || !data) return found;
        for (const row of data) {
          const description = typeof row.description === "string" ? row.description : "";
          if (!description.trim()) continue;
          found.set(String(row.content_key), {
            description,
            labels: Array.isArray(row.labels) ? (row.labels as FigureLabel[]) : [],
            ...(typeof row.model === "string" ? { model: row.model } : {}),
          });
        }
        // Best effort, and deliberately not awaited for its result: knowing a row earned its keep
        // is worth a write, and is not worth delaying a parse for.
        void admin
          .rpc("touch_figure_descriptions", { p_content_keys: [...found.keys()], p_user_id: userId })
          .then(() => undefined, () => undefined);
      } catch {
        /* a cache that cannot be read is a cache that misses */
      }
      return found;
    },

    async put(entries, promptVersion) {
      // 🔴 AN OVER-LONG READ IS DROPPED, NOT CLIPPED. See `MAX_CACHED_DESCRIPTION_CHARS`: this
      // used to write `description.slice(0, 4_000)`, which would store a transcribed table with
      // its last rows silently gone and then serve that as the whole reading forever. The figure
      // beside it keeps its own entry — one unusual picture must not cost the batch its cache.
      const storable = entries.filter((entry) => entry.description.length <= MAX_CACHED_DESCRIPTION_CHARS);
      if (storable.length === 0) return;
      try {
        await admin.from("figure_descriptions").upsert(
          storable.map((entry) => ({
            content_key: entry.contentKey,
            description: entry.description,
            labels: entry.labels as unknown as Record<string, unknown>[],
            prompt_version: promptVersion,
            user_id: userId,
            ...(entry.model ? { model: entry.model } : {}),
          })),
          { onConflict: "user_id,content_key" },
        );
      } catch {
        /* remembering is an optimisation; forgetting costs money and nothing else */
      }
    },
  };
}
