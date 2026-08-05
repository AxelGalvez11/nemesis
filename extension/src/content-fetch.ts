// Fetching ONE document's bytes, from inside a tab on the portal's own origin.
//
// 🔴 THIS FILE IS THE WHOLE REASON THE FILES CAN ARRIVE AT ALL.
//
// A student's lecture slides sit behind their school login. That login is a
// cookie scoped to the portal's origin, held by the browser, and it is not
// available to anybody else:
//
//   - Nemesis's servers cannot fetch the file. They have no cookie, and asking
//     the student for their university password to get one would be both
//     appalling and against every rule this product holds itself to.
//   - The Nemesis web page cannot fetch it either: a cross-origin read of a
//     school portal is refused by the browser, correctly.
//   - The extension's service worker is a poor bet too — its requests are
//     cross-site by origin, so a SameSite=Lax session cookie is not attached,
//     and whether a given portal's cookie qualifies is not something to guess.
//
// A content script running in a tab that is ALREADY on that origin has none of
// those problems. Its fetch is same-origin and same-site; the browser attaches
// the session the student is already using. Nothing is stored, nothing is
// asked for, and no credential is ever seen by us — this reads exactly what
// the student could read by clicking the link themselves.
//
// ONE FILE PER INJECTION. The URL is left in storage by the worker because
// chrome.scripting cannot pass arguments to a FILE injection (the same
// constraint that put the LMS override in storage). Consumed on read, and
// refused unless it was meant for this origin, so a stale request can never be
// answered by a page it was not written for.

import { FETCH_KEY, type FetchRequest, RUNTIME_MESSAGES } from "./messages.ts";

/** Matches both the extractor's ceiling and the wire's cap. A file bigger than
 *  this cannot be imported anyway, so refusing it here saves pulling 200MB of
 *  lecture video through a student's connection to be thrown away. */
const MAX_BYTES = 25 * 1024 * 1024;

/** Long enough for a big deck on campus wifi, short enough that one wedged
 *  request does not hold the whole import. */
const TIMEOUT_MS = 60_000;

interface Reply {
  url: string;
  name?: string;
  mime?: string;
  base64?: string;
  error?: string;
}

function send(reply: Reply): void {
  try {
    chrome.runtime.sendMessage({ ...reply, type: RUNTIME_MESSAGES.FILE_BYTES }, () => {
      void chrome.runtime.lastError;
    });
  } catch {
    // Extension reloaded mid-fetch; the caller times out and says so.
  }
}

/**
 * Bytes to base64, in chunks. PURE-ish (touches only btoa).
 *
 * 🔴 NOT `String.fromCharCode(...bytes)`. Spreading a multi-megabyte array into
 * an argument list overflows the call stack — a 5MB PDF is 5 million arguments —
 * and the failure is a RangeError deep inside what looks like a conversion
 * helper. Chunked, it is boring and correct at any size.
 */
function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK));
  }
  return btoa(binary);
}

/**
 * The filename to keep, in order of trustworthiness.
 *
 * The server's own Content-Disposition first — it is the portal telling us what
 * the file is called. Then the URL's last path segment, which is right for the
 * portals whose file URLs carry a real name. Ultra's do not (they end in an
 * opaque id like `_2017715_1`), which is why the caller passes the title it
 * read off the page as the final fallback.
 */
function fileNameFrom(response: Response, url: string, fallback: string): string {
  const disposition = response.headers.get("content-disposition") ?? "";
  // RFC 5987 form first (filename*=UTF-8''…), then the plain one.
  const encoded = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(disposition)?.[1];
  if (encoded) {
    try {
      const decoded = decodeURIComponent(encoded.trim().replace(/^"|"$/g, ""));
      if (decoded) return decoded;
    } catch {
      // A malformed header is not worth failing an import over.
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(disposition)?.[1];
  if (plain?.trim()) return plain.trim();

  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
    // Only when it looks like a real filename. An opaque id with no extension
    // gives the student a Library entry called "_2017715_1".
    if (/\.[a-z0-9]{1,12}$/i.test(last)) return decodeURIComponent(last);
  } catch {
    // Unparseable URL: fall through.
  }
  return fallback;
}

async function run(): Promise<void> {
  let request: FetchRequest | undefined;
  try {
    const bag = await chrome.storage.local.get(FETCH_KEY);
    request = bag[FETCH_KEY] as FetchRequest | undefined;
    // Consumed either way, so one request is answered exactly once.
    await chrome.storage.local.remove(FETCH_KEY);
  } catch {
    return;
  }
  if (!request?.url) return;
  // Refused unless this is the origin the worker meant. Belt and braces: the
  // worker only injects into a matching tab, but a request that outlived its
  // tab must not be answered by whatever page is here now.
  if (request.origin !== window.location.origin) {
    send({ error: "wrong-origin", url: request.url });
    return;
  }

  const abort = new AbortController();
  const timer = window.setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(request.url, {
      credentials: "include",
      redirect: "follow",
      signal: abort.signal,
    });
    if (!response.ok) {
      send({ error: `http-${response.status}`, url: request.url });
      return;
    }

    // Refuse before reading the body where the server was honest about size.
    const declared = Number(response.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > MAX_BYTES) {
      send({ error: "too-large", url: request.url });
      return;
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) {
      send({ error: "too-large", url: request.url });
      return;
    }
    if (buffer.byteLength === 0) {
      send({ error: "empty", url: request.url });
      return;
    }

    const mime = (response.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
    send({
      base64: toBase64(new Uint8Array(buffer)),
      mime,
      name: fileNameFrom(response, request.url, "Untitled"),
      url: request.url,
    });
  } catch (cause) {
    send({
      error: cause instanceof DOMException && cause.name === "AbortError" ? "timeout" : "fetch-failed",
      url: request.url,
    });
  } finally {
    window.clearTimeout(timer);
  }
}

void run();
