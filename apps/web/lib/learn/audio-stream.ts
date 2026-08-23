// Making audio playable BEFORE all of it has arrived.
//
// 🔴🔴 THIS IS THE ANSWER TO THE LATENCY THE OWNER REPORTED. Both synthesis routes already stream —
// Azure begins returning MP3 bytes before it has finished the sentence, and `nemesis-speak` now
// pipes xAI's body straight through — and then the client threw all of that away with a single
// line: `await res.blob()`. That waits for the LAST byte before the FIRST one can be played, so
// every stream on the server was being re-buffered into a file on the client. On a paragraph that
// is seconds of silence with a spinner, and it is the same seconds whichever provider is speaking.
//
// 🔴 MediaSource WHEN THE BROWSER HAS IT, A BLOB WHEN IT DOES NOT, AND THE FALLBACK IS NOT A
// FORMALITY. `MediaSource.isTypeSupported("audio/mpeg")` is true in Chrome, Edge and Firefox and
// false in several WebKit builds; a streaming-only player would simply be silent there. Same
// interface either way, so nothing above this file branches on it.
//
// 🔴 ONE TIMELINE ACROSS SEVERAL REQUESTS, WHICH IS WHY THIS IS A SINK RATHER THAN A FETCH HELPER.
// Both providers refuse more than 600 characters, so a long answer is several requests
// (`speechChunks`). Appended into one MediaSource they become one continuous piece of audio with
// one duration, one progress bar and one seek — instead of the previous behaviour, where each chunk
// was its own `Audio` element played end to end with nothing to scrub through.
//
// BROWSER-ONLY. Imported by the playback hook, never by a test of decision logic.

/** What both synthesis routes return, and the only container this file handles. */
export const MP3_MIME = "audio/mpeg";

export interface AudioSink {
  /** True when bytes become playable as they arrive rather than at the end. */
  readonly streaming: boolean;
  /**
   * What to assign to the element, or null when nothing is playable yet.
   *
   * Available immediately while streaming; null until `end()` on the buffered fallback.
   */
  src(): string | null;
  append(bytes: Uint8Array): Promise<void>;
  /** No more bytes are coming. Resolves with the final src. */
  end(): Promise<string | null>;
  /** Release the object URL and abandon anything queued. Safe to call twice. */
  dispose(): void;
}

export function mp3StreamingSupported(): boolean {
  if (typeof window === "undefined") return false;
  const source = (window as { MediaSource?: typeof MediaSource }).MediaSource;
  if (!source || typeof source.isTypeSupported !== "function") return false;
  try {
    return source.isTypeSupported(MP3_MIME);
  } catch {
    return false;
  }
}

/**
 * Bytes in, a growing playable timeline out.
 *
 * 🔴 APPENDS ARE QUEUED, NEVER OVERLAPPED. `SourceBuffer.appendBuffer` throws `InvalidStateError` if
 * called while a previous append is still updating, and the second chunk of a long answer routinely
 * arrives while the first is still being written. One promise chain, one append in flight.
 */
function streamingSink(): AudioSink {
  const media = new MediaSource();
  const url = URL.createObjectURL(media);
  let disposed = false;
  let buffer: SourceBuffer | null = null;

  const opened = new Promise<void>((resolve, reject) => {
    media.addEventListener(
      "sourceopen",
      () => {
        try {
          buffer = media.addSourceBuffer(MP3_MIME);
          resolve();
        } catch (error) {
          reject(error instanceof Error ? error : new Error("source buffer refused"));
        }
      },
      { once: true },
    );
  });

  // Every append and the final `endOfStream` hang off this one chain, so they happen in order and
  // never while `updating` is true.
  let chain: Promise<void> = opened;

  const appendOne = (bytes: Uint8Array) =>
    new Promise<void>((resolve, reject) => {
      if (disposed || !buffer) {
        resolve();
        return;
      }
      const target = buffer;
      const onDone = () => {
        target.removeEventListener("updateend", onDone);
        target.removeEventListener("error", onError);
        resolve();
      };
      const onError = () => {
        target.removeEventListener("updateend", onDone);
        target.removeEventListener("error", onError);
        reject(new Error("the audio buffer rejected a chunk"));
      };
      target.addEventListener("updateend", onDone);
      target.addEventListener("error", onError);
      try {
        // A fresh copy: `appendBuffer` takes ownership of the underlying buffer, and the caller's
        // view may be a slice of a larger read.
        target.appendBuffer(bytes.slice().buffer as ArrayBuffer);
      } catch (error) {
        target.removeEventListener("updateend", onDone);
        target.removeEventListener("error", onError);
        reject(error instanceof Error ? error : new Error("append refused"));
      }
    });

  return {
    append(bytes) {
      chain = chain.then(() => appendOne(bytes));
      return chain;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        if (media.readyState === "open") media.endOfStream();
      } catch {
        // Already ended, or never opened. Nothing to undo.
      }
      URL.revokeObjectURL(url);
    },
    async end() {
      try {
        await chain;
        if (!disposed && media.readyState === "open") media.endOfStream();
      } catch {
        // A stream that failed to close still has whatever was appended; the element will play it
        // and then stall, which the hook reports as a playback failure.
      }
      return disposed ? null : url;
    },
    src() {
      return disposed ? null : url;
    },
    streaming: true,
  };
}

/** The whole file, then a blob. What shipped before, kept for browsers with no MediaSource. */
function bufferedSink(): AudioSink {
  const parts: Uint8Array[] = [];
  let url: string | null = null;
  let disposed = false;

  return {
    async append(bytes) {
      if (!disposed) parts.push(bytes);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (url) URL.revokeObjectURL(url);
      url = null;
      parts.length = 0;
    },
    async end() {
      if (disposed) return null;
      // `BlobPart[]` rather than the typed array directly, so this holds under `exactOptionalPropertyTypes`
      // and in browsers whose `Blob` typing predates `Uint8Array<ArrayBufferLike>`.
      const blob = new Blob(parts as unknown as BlobPart[], { type: MP3_MIME });
      if (blob.size === 0) return null;
      url = URL.createObjectURL(blob);
      return url;
    },
    src() {
      return url;
    },
    streaming: false,
  };
}

export function openAudioSink(): AudioSink {
  return mp3StreamingSupported() ? streamingSink() : bufferedSink();
}

/**
 * Pump a response body into a sink.
 *
 * 🔴 IT REPORTS THE FIRST CHUNK, WHICH IS THE MOMENT PLAYBACK CAN START. Waiting for the whole
 * response before calling `play()` is precisely the latency this module exists to remove, and
 * calling `play()` on an empty MediaSource is an immediate stall — so the caller needs to know when
 * the first bytes have actually landed, not merely when the request resolved.
 */
export async function pumpInto(
  sink: AudioSink,
  body: ReadableStream<Uint8Array>,
  onFirstBytes?: () => void,
  cancelled?: () => boolean,
): Promise<number> {
  const reader = body.getReader();
  let total = 0;
  let announced = false;
  try {
    for (;;) {
      if (cancelled?.()) {
        await reader.cancel().catch(() => {});
        return total;
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      total += value.byteLength;
      // 🔴 ANNOUNCED BEFORE THE APPEND IS AWAITED, NOT AFTER, AND THAT ORDER IS LOAD-BEARING. On the
      // streaming sink an append cannot resolve until the MediaSource has OPENED, and a MediaSource
      // only opens once its object URL is attached to a media element. Announcing afterwards
      // therefore deadlocks any caller that attaches on this callback: the append waits for the
      // element, the element waits for the callback, the callback waits for the append. Found in a
      // real browser, which is the only place it is visible.
      if (!announced) {
        announced = true;
        onFirstBytes?.();
      }
      await sink.append(value);
    }
  } finally {
    reader.releaseLock();
  }
  return total;
}
