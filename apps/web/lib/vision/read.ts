/**
 * The one door for "read this picture" — DeepSeek first, Gemini behind it, one spend row out.
 *
 * 🔴 CALL SITES IMPORT THIS, NEVER A PROVIDER MODULE, AND THAT IS THE WHOLE DESIGN. The owner asked
 * for DeepSeek vision (2026-08-23: "just give me deepseek vision thats all i want. make sure we can
 * track cost too"), and the cheapest correct shape is a front door that prefers it, not a
 * find-and-replace of one provider name with another: the model is two days old and marked
 * experimental, and this repo has already lived through weeks of a silently dead vision provider
 * (lib/pdf/vision.ts's header — zero descriptions recorded, nobody told). Behind this door, the
 * day DeepSeek retires the id, every camera photo and handwriting page degrades to Gemini instead
 * of to nothing.
 *
 * 🔴 THE ORDER IS DEEPSEEK → GEMINI AND THE REASON IS THE BILL. Reading back a page of transcript
 * is mostly OUTPUT tokens, and DeepSeek's output rate is a third of Google's — ~$0.0015 against
 * ~$0.0039 for a typical page at peak, half that off-peak. Gemini is not deleted because it still
 * reads two things DeepSeek cannot: HEIC/HEIF (the iPhone camera default — see
 * DEEPSEEK_VISION_MIMES for why that matters) and application/pdf.
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
 * Read a picture. DeepSeek when it is configured and can read the format; Gemini otherwise or on
 * any DeepSeek failure. Returns null — never throws — when nobody could read it.
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
     * Which provider to try FIRST. Defaults to DeepSeek.
     *
     * 🔴🔴🔴 `"gemini"` EXISTS FOR ONE MEASURED REASON: DEEPSEEK REASONS OVER DIAGRAMS, AND A
     * DIAGRAM IS THE PATHOLOGICAL CASE. Its own header records the number — a molecular figure
     * whose visible answer was ~150 tokens burned 18,642 output tokens and **135 seconds**,
     * enumerating every printed residue. That is fine for a page of handwriting, where the
     * reasoning earns its keep, and ruinous for "list the labelled boxes", where the answer is a
     * dozen coordinates.
     *
     * Measured on the live nephron diagram, 2026-08-25: the DeepSeek-first ladder took 34s on a
     * good run and blew a 38s budget on the next one. The parse lane reached the same conclusion
     * independently and has kept figures on Gemini since 2026-08-23.
     *
     * 🔴 IT IS A PREFERENCE, NOT A LOCK. The other provider is still the fallback, so a Gemini
     * outage costs latency rather than the feature.
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

  const [first, second] = options.prefer === "gemini" ? [gemini, deepseek] : [deepseek, gemini];
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
