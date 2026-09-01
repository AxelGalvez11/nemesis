/**
 * The one door for "read this picture" — Gemini first, DeepSeek behind it, one spend row out.
 *
 * 🔴 CALL SITES IMPORT THIS, NEVER A PROVIDER MODULE, AND THAT IS THE WHOLE DESIGN. Two providers
 * behind one function is what let the order be reversed in a single edit, and it is what makes
 * either one retiring a degradation instead of an outage. This repo has already lived through weeks
 * of a silently dead vision provider (lib/pdf/vision.ts's header — zero descriptions recorded,
 * nobody told); a door with a second reader behind it cannot repeat that.
 *
 * 🔴 THE ORDER IS GEMINI → DEEPSEEK, REVERSED 2026-08-31 BY THE OWNER ("use Gemini"), AND THE
 * REASON IS THAT DEEPSEEK'S BILL IS UNBOUNDED ON EXACTLY THE PICTURES THAT MATTER. The original
 * order was DeepSeek-first on a per-token price comparison: reading back a page of transcript is
 * mostly OUTPUT tokens and DeepSeek's output rate is a third of Google's (~$0.0015 against
 * ~$0.0039 a page). That comparison only holds for TRANSCRIPTION. DeepSeek reasons before it
 * answers and bills the reasoning as output, so on a DIAGRAM the token count is set by how hard
 * the model finds the picture, not by how much answer it produces: one measured molecular diagram
 * whose visible answer was ~150 tokens burned 18,642 output tokens — $0.025 and 135 seconds for
 * ONE figure, seventeen times the price of the Gemini read it replaced (see deepseek.ts's
 * DEEPSEEK_VISION_MAX_OUTPUT, which caps the damage but cannot remove it). A lecture deck is
 * mostly diagrams. Gemini's cost per picture is flat and its latency is seconds.
 *
 * 🔴 AND DEEPSEEK IS NOT DELETED, BECAUSE ONE READER IS AN OUTAGE WAITING TO HAPPEN. It still
 * answers everything it can when Google refuses or is down. It cannot read HEIC/HEIF (the iPhone
 * camera default — see DEEPSEEK_VISION_MIMES) or application/pdf, so for those two the fallback
 * is honest about being narrower than the primary.
 *
 * 🔴 SPEND IS RECORDED HERE, ONCE, BECAUSE THE CALL SITES PROVED THEY WOULD NOT DO IT THEMSELVES.
 * Camera, occlusion, handwriting and notebook reads have gone through readWithVision since July
 * and not one of them ever wrote a spend row — `provider-costs.ts` says it outright: "Gemini
 * vision records nothing". Five routes each remembering to bill is how that happened; one door
 * that bills whoever walks through it is how it stops.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { recordAiSpend, type SpendScope } from "@/lib/cost/ai-spend";

import {
  PHOTO_PROMPT,
  readWithVision,
  visionConfigured as geminiConfigured,
  type VisionEnv,
} from "./gemini";
import {
  deepseekVisionConfigured,
  readWithDeepseekVision,
  type DeepseekVisionUsage,
} from "./deepseek";

// The pure helpers every route already leans on, re-exported so one import serves the whole job.
export { VISION_IMAGE_MIMES, VISION_MAX_BYTES, visionMime, type VisionEnv } from "./gemini";

/** Who to bill and against what. Passed by routes that hold an admin client; optional because a
 *  dev-lab or test read with nobody to bill must still work. */
export interface VisionSpend {
  admin: SupabaseClient;
  userId: string;
  scope: SpendScope;
}

export interface ImageReadResult {
  text: string;
  model: string;
  /** Which provider actually answered — the spend row and any debugging start here. */
  provider: "deepseek" | "gemini";
  /** The provider's own token meter. Null on Gemini, which does not report one here. */
  usage: DeepseekVisionUsage | null;
}

/** Whether ANY vision door is open. Routes gate features on this. */
export function visionConfigured(env: VisionEnv = process.env): boolean {
  return deepseekVisionConfigured(env) || geminiConfigured(env);
}

/**
 * Read a picture. Gemini first; DeepSeek on any Gemini failure. Returns null — never throws —
 * when nobody could read it.
 */
export async function readImage(
  bytes: Uint8Array,
  mimeType: string,
  options: {
    env?: VisionEnv;
    prompt?: string;
    signal?: AbortSignal;
    spend?: VisionSpend;
    /**
     * Which provider to try FIRST. Defaults to Gemini.
     *
     * 🔴🔴🔴 THE DEFAULT WAS DEEPSEEK UNTIL 2026-08-31, AND ONE CALL SITE OPTING OUT WAS NOT
     * ENOUGH. `prefer: "gemini"` was added for figure-occlusion alone, for a measured reason that
     * was never specific to occlusion: DEEPSEEK REASONS OVER DIAGRAMS, AND A DIAGRAM IS THE
     * PATHOLOGICAL CASE. deepseek.ts's own header records the number — a molecular figure whose
     * visible answer was ~150 tokens burned 18,642 output tokens and **135 seconds**, enumerating
     * every printed residue. On the live nephron diagram the DeepSeek-first ladder took 34s on a
     * good run and blew a 38s budget on the next. The parse lane reached the same conclusion
     * independently and has kept figures on Gemini since 2026-08-23.
     *
     * So three lanes had each discovered the same thing separately while the DEFAULT still sent
     * every camera photo, handwriting page and notebook read the other way. The owner settled it
     * ("use Gemini", 2026-08-31) and the default moved to where the evidence already was.
     *
     * 🔴 `"deepseek"` STAYS REACHABLE, because the price comparison that chose it is still true
     * for the case it was measured on: TRANSCRIBING a dense page is mostly output tokens, and
     * DeepSeek's output rate is a third of Google's. A lane that is reading words rather than
     * interpreting a picture may still ask for it.
     *
     * 🔴 IT IS A PREFERENCE, NOT A LOCK. The other provider is always the fallback, so either
     * one's outage costs latency rather than the feature.
     */
    prefer?: "deepseek" | "gemini";
  } = {},
): Promise<ImageReadResult | null> {
  const env = options.env ?? process.env;
  const prompt = options.prompt ?? PHOTO_PROMPT;
  const started = Date.now();

  const gemini = () =>
    readWithVision(bytes, mimeType, { env, prompt, signal: options.signal }).then((seen) =>
      seen ? ({ model: seen.model, provider: "gemini", text: seen.text, usage: null } as ImageReadResult) : null,
    );
  // readWithDeepseekVision refuses unreadable mimes and oversize files itself, so an iPhone HEIC
  // or a PDF falls straight through to Gemini without a wasted request.
  const deepseek = async (): Promise<ImageReadResult | null> => {
    const seen = await readWithDeepseekVision(bytes, mimeType, { env, prompt, signal: options.signal });
    return seen ? { model: seen.model, provider: "deepseek", text: seen.text, usage: seen.usage } : null;
  };

  const [first, second] = options.prefer === "deepseek" ? [deepseek, gemini] : [gemini, deepseek];
  const result: ImageReadResult | null = (await first()) ?? (await second());

  if (result && options.spend) {
    // 🔴 AWAITED, NOT FIRED AND FORGOTTEN — a serverless route can be frozen the moment it
    // responds, and an insert left floating is a row that sometimes exists. recordAiSpend never
    // throws and never blocks the work with an error, so the only cost of awaiting is one insert
    // of latency after the expensive part is already over.
    await recordAiSpend(options.spend.admin, {
      durationMs: Date.now() - started,
      model: result.model,
      provider: result.provider === "deepseek" ? "deepseek_vision" : "gemini_vision",
      scope: options.spend.scope,
      // One image per call through this door. For DeepSeek the PRICE comes from `tokens`, not from
      // this count; for Gemini the per-image estimate is all there has ever been.
      units: 1,
      userId: options.spend.userId,
      ...(result.usage ? { tokens: result.usage } : {}),
    });
  }
  return result;
}
