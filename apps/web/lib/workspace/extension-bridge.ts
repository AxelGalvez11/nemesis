"use client";

// Talking to the browser extension, from the app's side.
//
// The extension puts a small content script on this origin which answers three
// questions over window.postMessage: are you there, what did you read, and
// forget it. This module wraps that in promises with timeouts, because a
// question nobody answers must not leave the UI spinning — "not installed" is
// the overwhelmingly common case and has to resolve quickly and quietly.
//
// 🔴 EVERY REPLY IS SANITISED BEFORE IT IS RETURNED. `sanitiseScan` is not a
// formality here: any script on this page can post a message wearing the
// extension's name, and even a genuine extension is relaying a school portal
// written by professors, teaching assistants and classmates. The sanitiser is
// the app's own boundary and runs on the receiving side precisely so that a
// spoofed, buggy or compromised sender changes nothing about what we accept.
// See packages/shared/src/lms-import.ts for what it enforces and why it
// deliberately does not filter wording.

import { type FetchedFile, type LmsScan, sanitiseFetchedFile, sanitiseScan } from "@nemesis/shared";

/** Kept in step with extension/src/messages.ts. Both sides are in this repo, so
 *  a mismatch is a bug, not a compatibility problem. */
const FROM_APP = "nemesis-app";
const FROM_EXTENSION = "nemesis-extension";

const APP_MESSAGES = {
  CLEAR_SCAN: "nemesis:clear-scan",
  PING: "nemesis:ping",
  REQUEST_FILE: "nemesis:request-file",
  REQUEST_SCAN: "nemesis:request-scan",
} as const;

const EXTENSION_MESSAGES = {
  CLEARED: "nemesis:cleared",
  FILE: "nemesis:file",
  PONG: "nemesis:pong",
  SCAN: "nemesis:scan",
} as const;

/**
 * How long to wait for the extension to answer.
 *
 * Short on purpose. The reply is a local postMessage round trip — microseconds
 * when the extension exists. Anything approaching this budget means it does
 * not, and the student should not watch a spinner to be told so.
 */
const REPLY_TIMEOUT_MS = 600;

interface ExtensionReply {
  source?: unknown;
  type?: unknown;
  requestId?: unknown;
  payload?: unknown;
}

function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Ask the extension one question and wait for its matching answer.
 *
 * Resolves with null on timeout rather than rejecting: "no extension" is an
 * ordinary state of the world, not an error, and making every caller wrap this
 * in a try/catch would guarantee someone forgets.
 */
function ask(type: string, expect: string, extra?: Record<string, unknown>, timeoutMs = REPLY_TIMEOUT_MS): Promise<unknown> {
  if (typeof window === "undefined") return Promise.resolve(null);

  return new Promise((resolve) => {
    const requestId = newRequestId();
    let settled = false;

    const finish = (value: unknown) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
      resolve(value);
    };

    function onMessage(event: MessageEvent) {
      // Same window, same origin, and the id WE generated. The last of those is
      // what stops one stray reply from resolving an unrelated question.
      if (event.source !== window || event.origin !== window.location.origin) return;
      const data = event.data as ExtensionReply | null;
      if (!data || typeof data !== "object") return;
      if (data.source !== FROM_EXTENSION || data.type !== expect || data.requestId !== requestId) return;
      finish(data.payload ?? null);
    }

    const timer = setTimeout(() => finish(null), timeoutMs);
    window.addEventListener("message", onMessage);
    window.postMessage({ ...extra, requestId, source: FROM_APP, type }, window.location.origin);
  });
}

/** Is the extension installed on this browser? */
export async function extensionInstalled(): Promise<boolean> {
  return (await ask(APP_MESSAGES.PING, EXTENSION_MESSAGES.PONG)) !== null;
}

/**
 * The most recent portal reading the extension is holding, cleaned.
 *
 * Returns null when the extension is absent or has nothing. A scan that arrives
 * but survives sanitising as empty comes back as an empty LmsScan, so callers
 * can tell "nothing scanned yet" from "scanned, found nothing" and say the
 * right thing.
 */
export async function requestScan(): Promise<LmsScan | null> {
  const raw = await ask(APP_MESSAGES.REQUEST_SCAN, EXTENSION_MESSAGES.SCAN);
  if (raw === null || raw === undefined) return null;
  return sanitiseScan(raw);
}

/** Tell the extension to drop what it holds. Called after a successful import
 *  so a student's coursework does not sit in extension storage forever. */
export async function clearScan(): Promise<void> {
  await ask(APP_MESSAGES.CLEAR_SCAN, EXTENSION_MESSAGES.CLEARED);
}

/**
 * How long to wait for ONE document's bytes.
 *
 * Two orders of magnitude longer than every other call here, and for a
 * completely different reason: the others are a local round trip, while this
 * one waits on the extension opening a tab on the school's portal and pulling a
 * lecture deck over campus wifi. The extension caps itself well inside this, so
 * reaching this budget means the extension itself has stopped answering.
 */
const FILE_TIMEOUT_MS = 90_000;

/**
 * What happened when we asked for a file.
 *
 * 🔴 "NO REPLY" AND "REFUSED" MUST NOT LOOK THE SAME, and they did. Both used
 * to come back as null, which hid a genuinely bad live scenario: an OLDER
 * extension is still installed, has never heard of REQUEST_FILE, and answers
 * nothing at all. Every document then waits out the full timeout before failing
 * — a hundred-document import spends hours grinding to produce a hundred
 * identical errors.
 *
 * A refusal is per-document and the import carries on. Silence is fatal and the
 * import stops after the first one, with an answer the student can act on.
 */
export type FileResult =
  | { ok: true; file: FetchedFile }
  | { ok: false; reason: "no-reply" }
  | { ok: false; reason: "refused" };

/**
 * Fetch one document's bytes through the extension.
 *
 * 🔴 THE URL MUST COME FROM A SANITISED SCAN, never from anywhere else. This is
 * the app asking a browser extension to read a page with the student's school
 * session attached, so "which URL" is the whole security question. Callers pass
 * a `url` taken from a ScrapedDocument that has already been through
 * sanitiseScan, and the reply is checked to name that same URL — a reply about
 * a different document is a reply to nobody and is thrown away.
 *
 * Returns null for every failure, including a refusal: an import that cannot
 * get one file carries on and reports which ones it missed.
 */
export async function requestFile(url: string): Promise<FileResult> {
  const raw = await ask(APP_MESSAGES.REQUEST_FILE, EXTENSION_MESSAGES.FILE, { url }, FILE_TIMEOUT_MS);
  // Nothing came back at all: no bridge listening for this message, which means
  // no extension or one that predates file import.
  if (raw === null || raw === undefined) return { ok: false, reason: "no-reply" };
  const file = sanitiseFetchedFile(raw);
  // Same URL, or it is not an answer to this question. A reply that arrived but
  // carried an error (or the wrong document) is the extension working and the
  // portal saying no.
  return file && file.url === url ? { file, ok: true } : { ok: false, reason: "refused" };
}

/** Where a student goes to get it. Not yet a Chrome Web Store listing — see
 *  extension/README.md for the state of that. */
export const EXTENSION_HELP_URL = "https://app.enternemesis.com/help/extension";
