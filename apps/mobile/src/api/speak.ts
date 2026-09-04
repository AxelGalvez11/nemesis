// "Read Aloud" for a finished canvas reply — the same `nemesis-speak` edge function the web's
// manual Read-aloud button calls (`ttsRequest`, `../learn/speech.ts`), chunked the same way
// (`replySpeechPlan`), played back with `expo-audio`.
//
// 🔴 xAI ONLY, ON PURPOSE, FOR NOW. `replySpeechPlan` can also route a `[say: locale | …]`
// target-language segment to Azure through `/api/speech/tts` — a Next.js route that exists only
// on the web app's own origin. The phone has no equivalent proxy and no "current page" to resolve
// a relative URL against, so an Azure step would fail confusingly rather than clearly. `fetchChunk`
// below refuses that one step by name instead (§ see its comment) — everything the DEFAULT reading
// voice actually produces (ordinary prose, always xAI) is unaffected.
//
// 🔴 EXPO-AUDIO IS REQUIRED LAZILY. `apps/mobile/package.json` lists it, but a dev client built
// before this landed does not have the native module linked — importing it at the top of this
// file would crash bundle load for anyone on that build. `lib/purchases.ts` types
// react-native-purchases the same structural, lazy-`require` way for the same reason.

import * as FileSystem from "expo-file-system/legacy";
import { generateUuidV4 } from "@/lib/chat-threads";
import { hasSpeakableContent, speakSteps, type SpeakStep } from "@/lib/speak-plan";
import { bytesToBase64 } from "@/lib/wav-trim";
import { DEFAULT_READING_VOICE, replySpeechPlan, ttsRequest, type ReadingVoice } from "@/learn/speech";
import { supabase } from "./supabase";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export interface SpeakOptions {
  /**
   * Overrides the xAI voice id (one of `eve`, `ara`, `rex`, `gork`, `sal`, `leo` —
   * `learn/speech.ts`'s `XAI_READING_VOICES`). Provider and locale stay the web's default for
   * now; a full `ReadingVoice` (Azure included) can ride here once Settings grows a phone picker.
   */
  voiceId?: string;
}

export interface SpeakHandle {
  /** Stops playback immediately and drops any chunks still queued. Safe to call more than once. */
  stop(): void;
  /**
   * Resolves once every chunk has played, or as soon as `stop()` is called — a deliberate stop is
   * not a failure. Rejects only on a genuine failure: no session, `nemesis-speak` error, or the
   * native audio module missing.
   */
  done: Promise<void>;
}

/** What `speakText` returns for a reply with nothing sayable in it — the button did the right
 *  thing by staying silent, not by failing. */
const NOOP_HANDLE: SpeakHandle = { done: Promise.resolve(), stop() {} };

/** The narrow slice of `expo-audio` this file calls, typed by hand so tsc's opinion of this file
 *  never depends on whether the native module is actually linked — the `require()` below is what
 *  decides that, at runtime, on the device in front of the learner. */
interface AudioStatusLike {
  readonly didJustFinish: boolean;
}
interface AudioPlayerLike {
  play(): void;
  pause(): void;
  remove(): void;
  addListener(event: "playbackStatusUpdate", listener: (status: AudioStatusLike) => void): { remove(): void };
}
interface ExpoAudioModule {
  createAudioPlayer(source: { uri: string }): AudioPlayerLike;
  setAudioModeAsync(mode: { playsInSilentMode?: boolean }): Promise<void>;
}

let expoAudio: ExpoAudioModule | null | undefined;

function audioModule(): ExpoAudioModule {
  if (expoAudio === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      expoAudio = require("expo-audio") as ExpoAudioModule;
    } catch {
      expoAudio = null;
    }
  }
  if (!expoAudio) throw new Error("Update the app to hear answers");
  return expoAudio;
}

/** Where one chunk's bytes are written before `expo-audio` can play them — it plays from a file
 *  or URL, never from bytes already in memory. */
function cachePath(id: string): string {
  return `${FileSystem.cacheDirectory ?? ""}nemesis-speak-${id}.mp3`;
}

async function deleteQuietly(path: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(path, { idempotent: true });
  } catch {
    // A leftover cache file is cleaned up by the OS eventually; it must not break playback.
  }
}

/** One chunk's audio, fetched through `nemesis-speak` and written to a cache file. Refuses an
 *  Azure step rather than sending a relative URL nowhere — see this file's header. */
async function fetchChunk(step: SpeakStep, token: string): Promise<string | null> {
  if (step.utterance.provider !== "xai") return null;

  const plan = ttsRequest({
    locale: step.utterance.locale,
    provider: "xai",
    rate: step.utterance.speed,
    supabaseAnonKey: SUPABASE_ANON_KEY,
    supabaseUrl: SUPABASE_URL,
    text: step.utterance.text,
    token,
    ...(step.utterance.voiceId ? { voiceId: step.utterance.voiceId } : {}),
  });
  const res = await fetch(plan.url, plan.init);
  if (__DEV__) console.log("[speak] response", res.status);
  if (!res.ok) throw new Error(`nemesis-speak failed (${res.status})`);

  const bytes = new Uint8Array(await res.arrayBuffer());
  const path = cachePath(generateUuidV4());
  await FileSystem.writeAsStringAsync(path, bytesToBase64(bytes), { encoding: FileSystem.EncodingType.Base64 });
  return path;
}

/**
 * Speak a reply's sayable prose aloud, one chunk at a time — the same plan the web's manual
 * Read-aloud button builds: `text` runs through `replySpeechPlan`, so markdown is stripped, code
 * and notation are refused, and a `[say: locale | …]` line is (attempted) routed to the language
 * variety it named rather than read by the chosen voice.
 */
export async function speakText(uid: string, text: string, opts: SpeakOptions = {}): Promise<SpeakHandle> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session || session.user.id !== uid) throw new Error("not signed in");

  const voice: ReadingVoice = opts.voiceId ? { ...DEFAULT_READING_VOICE, id: opts.voiceId } : DEFAULT_READING_VOICE;
  const plan = replySpeechPlan(text, voice);
  if (!hasSpeakableContent(plan)) return NOOP_HANDLE;

  // Thrown here, before any network call, so a stale dev client fails with the one clear message
  // rather than a request that then has nowhere to play its answer.
  const audio = audioModule();
  await audio.setAudioModeAsync({ playsInSilentMode: true }).catch(() => {
    // Playback still works without this; it only widens WHEN it is heard (silent-switch phones).
  });

  const steps = speakSteps(plan);
  const token = session.access_token;

  let cancelled = false;
  let onStop: (() => void) | null = null;

  const stop = () => {
    if (cancelled) return;
    cancelled = true;
    onStop?.();
  };

  const playOne = (path: string): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      let player: AudioPlayerLike;
      try {
        player = audio.createAudioPlayer({ uri: path });
      } catch (cause) {
        reject(cause instanceof Error ? cause : new Error("could not start playback"));
        return;
      }
      const finish = () => {
        onStop = null;
        subscription.remove();
        try {
          player.remove();
        } catch {
          // Already gone — nothing left to release.
        }
        resolve();
      };
      const subscription = player.addListener("playbackStatusUpdate", (status) => {
        if (status.didJustFinish) finish();
      });
      onStop = () => {
        try {
          player.pause();
        } catch {
          // Already stopped.
        }
        finish();
      };
      player.play();
    });

  const done = (async () => {
    for (const step of steps) {
      if (cancelled) return;
      const path = await fetchChunk(step, token);
      if (!path) continue; // A refused (Azure) step: skip it, keep reading the rest in the chosen voice.
      if (cancelled) {
        await deleteQuietly(path);
        return;
      }
      try {
        await playOne(path);
      } finally {
        await deleteQuietly(path);
      }
    }
  })();

  return { done, stop };
}
