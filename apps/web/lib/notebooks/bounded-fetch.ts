// Reading a stored object without ever holding more of it than we agreed to.
//
// 🔴 THE SIZE LIMIT MUST BE ENFORCED WHILE THE BYTES ARRIVE, NOT AFTER.
//
// The path this replaces called supabase-js `.download()`, which resolves to a
// Blob — and a Blob cannot exist without its bytes, so `blob.size` is only
// readable once the whole object is already in memory. The check that followed
// it was therefore not a guard at all: refusing a 200 MiB object cost 200 MiB
// first. Measured on the owner's real 118 MiB lecture, the old path peaked at
// 676 MiB of RSS — 5.73x the file — because the bytes were materialised three
// times over (Blob, then `arrayBuffer()`, then the route's defensive copy)
// before a parser saw them.
//
// So:
//
//   1. A HEAD asks how big the object is. It has no body by definition, so an
//      oversized object is refused having opened nothing at all. This is the
//      cheap refusal, and it is cheap because there is no stream to get rid of.
//   2. Only then is the body requested. It is read chunk by chunk with the cap
//      re-checked every time, so an object with no `content-length`, one that
//      lies, or one that changed between the two calls is still stopped
//      mid-transfer rather than after it.
//   3. What survives is written into ONE buffer, allocated once at the declared
//      size. No chunk array, no concat pass, no second copy.
//
// 🔴 STEP 1 USED TO BE A GET WHOSE BODY WAS CANCELLED, AND THAT IS A TRAP.
// Reading `content-length` off a GET and calling `body.cancel()` looks like it
// avoids the transfer. It does not: undici wants the connection back, so
// cancelling drains the rest instead of hanging up. Measured through the
// deployed function against the real 118 MiB object, refusals took 5.6 s and
// 9.0 s and then one hit `Vercel Runtime Timeout Error: Task timed out after
// 300 seconds`. A HEAD has nothing to drain; where a body must be abandoned
// anyway, `AbortController.abort()` destroys the socket and `cancel()` does not.
//
// The cap is a hard stop, never a truncation: going over returns "too-large" and
// throws the partial away. Silently keeping the first N bytes of a document
// would be the same class of defect as the Office image stripping — a partial
// read presented as a whole one.

/** Why a bounded read ended, when it did not produce bytes. */
export type BoundedFailure =
  /** Declared or actual length exceeded the cap. Nothing is returned; the
   *  transfer was cancelled rather than truncated. */
  | { ok: false; reason: "too-large"; declared: number | null; read: number }
  /** The stream broke, or the object disagreed with its own `content-length`. */
  | { ok: false; reason: "unavailable" };

export type BoundedRead = { ok: true; bytes: Uint8Array } | BoundedFailure;

/**
 * Drain a response body into a single buffer, stopping the moment it exceeds
 * `cap`.
 *
 * `declared` is the object's own `content-length` when it sent one. It is used
 * to allocate exactly once — it is NOT trusted as a limit, because the running
 * total is checked independently on every chunk.
 */
export async function readBounded(
  body: ReadableStream<Uint8Array>,
  cap: number,
  declared: number | null,
  /**
   * Kills the underlying connection when a bound is broken.
   *
   * 🔴 NOT OPTIONAL IN PRODUCTION, AND `body.cancel()` IS NOT A SUBSTITUTE.
   *
   * Cancelling a large undici body does not hang up — the pool wants the
   * connection back, so it drains what is left. Measured against the real
   * 118 MiB object through the deployed function: two refusals took 5.6 s and
   * 9.0 s, and the third never returned at all — `Vercel Runtime Timeout Error:
   * Task timed out after 300 seconds`. Aborting the request destroys the socket
   * instead, which is the only way to stop paying for bytes we have refused.
   */
  abort?: () => void,
): Promise<BoundedRead> {
  const sized = declared !== null && Number.isInteger(declared) && declared >= 0 && declared <= cap;
  // One allocation of the exact size when the length is known and within the
  // cap. The fallback collects chunks, which costs a transient second copy at
  // the join — acceptable only because it is the rare path (an object with no
  // content-length), and it is still bounded by `cap`.
  const out = sized ? new Uint8Array(declared) : null;
  const chunks: Uint8Array[] = [];
  let read = 0;

  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      read += value.byteLength;
      if (read > cap) {
        // Stop the transfer. Everything already read is dropped on the floor:
        // a partial document must never be handed onward as a whole one.
        stop(reader, abort);
        return { ok: false, reason: "too-large", declared, read };
      }
      if (out) {
        // The object grew, or its content-length lied low. Either way this is
        // not the object we sized for, so it is not safe to keep.
        if (read > out.length) {
          stop(reader, abort);
          return { ok: false, reason: "unavailable" };
        }
        out.set(value, read - value.byteLength);
      } else {
        chunks.push(value);
      }
    }
  } catch {
    stop(reader, abort);
    return { ok: false, reason: "unavailable" };
  }

  if (out) {
    // A short read is a broken transfer, not a small file: the object said how
    // long it was and did not deliver it.
    if (read !== out.length) return { ok: false, reason: "unavailable" };
    return { ok: true, bytes: out };
  }

  const joined = new Uint8Array(read);
  let at = 0;
  for (const chunk of chunks) {
    joined.set(chunk, at);
    at += chunk.byteLength;
  }
  return { ok: true, bytes: joined };
}

/**
 * Read `content-length` as a number, or null when it is absent or unusable.
 *
 * A header that is missing, non-numeric, or negative must NOT be treated as
 * zero — that would let an unlabelled object skip the cheap refusal and look
 * like an empty file. Null means "unknown", and the caller falls back to the
 * per-chunk limit.
 */
export function declaredLength(headers: Headers): number | null {
  const raw = headers.get("content-length");
  // Digits only, which is all the HTTP grammar allows. Deliberately NOT
  // `Number(raw)`: `Number("")` is 0, so an empty header would have read as a
  // zero-byte file — absent and empty are not the same claim, and conflating
  // them lets an unlabelled object past the cheap refusal. `"1e9"` and `"1.5"`
  // are rejected for the same reason: they are not content-lengths, so we do
  // not get to guess what they meant.
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Hang up, without waiting to be let go.
 *
 * `cancel()` is still called so the stream is not left dangling, but it is
 * deliberately NOT awaited: awaiting it is what allowed a refused transfer to
 * keep running for five minutes. `abort()` is what actually destroys the
 * socket, so it goes first.
 */
function stop(reader: { cancel: () => Promise<void> }, abort?: () => void): void {
  try {
    abort?.();
  } catch {
    // An abort that throws must not mask the refusal that caused it.
  }
  void reader.cancel().catch(() => {});
}
