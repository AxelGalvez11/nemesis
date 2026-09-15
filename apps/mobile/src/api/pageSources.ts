/**
 * Adding a source to a page from the phone (canvas: AddSource). The text a file turns out to hold is saved
 * against the page with `ws_add_source`, the same RPC the web workspace uses (apps/web/space/app/runtime.js
 * addSourceFile), so everyone the page is shared with can read it and Create / Ask can use it.
 *
 * Files go through the phone's existing upload-and-read lane (api/documents.ts pickAndReadDocument), which
 * stores the file in the student's own storage and reads it on the server.
 */
import { APP_API_BASE, deviceKey } from './chat';
import { DocumentError, pickAndReadDocument } from './documents';
import { storeAndReadPhoto } from './photos';
import { pageText } from './makeCards';
import type { PageSource } from './space';
import { supabase } from './supabase';

export async function addSource(
  pageId: string,
  fields: { name: string; mime?: string | null; bytes?: number | null; body: string; emptyError?: string },
): Promise<PageSource> {
  const body = fields.body ?? '';
  const failed = !body.trim();
  const { data, error } = await supabase.rpc('ws_add_source', {
    p_page: pageId,
    p_name: fields.name,
    p_mime: fields.mime ?? null,
    p_bytes: fields.bytes ?? null,
    p_library_source: null,
    p_body: body,
    p_status: failed ? 'failed' : 'ready',
    p_error: failed ? fields.emptyError ?? 'Nothing could be read out of this file.' : null,
  });
  if (error) throw new Error(error.message.includes('not allowed') ? 'You can only add sources to pages you can edit.' : `ws_add_source: ${error.message}`);
  return data as PageSource;
}

/** Opens the file picker. Null when the student backed out; throws a sentence to show when the file was refused. */
export async function addFileSource(uid: string, pageId: string): Promise<PageSource | null> {
  let read: Awaited<ReturnType<typeof pickAndReadDocument>>;
  try {
    read = await pickAndReadDocument(uid);
  } catch (e) {
    if (e instanceof DocumentError) throw e;
    throw new Error('That file could not be read. Try again.');
  }
  if (!read) return null;
  return addSource(pageId, { name: read.title, mime: mimeFor(read.title), body: read.text });
}

/** Another of the student's notes, copied in as text. */
export async function addNoteSource(pageId: string, notePageId: string): Promise<PageSource> {
  const note = await pageText(notePageId);
  return addSource(pageId, { name: note.title || 'Untitled note', mime: 'text/x-nemesis-note', body: note.text, emptyError: 'This note is empty.' });
}

/** A photograph (a slide, a whiteboard, a page): stored and read by the chat's photo lane, its text saved as a source. */
export async function addPhotoSource(uid: string, pageId: string, uri: string): Promise<PageSource> {
  const read = await storeAndReadPhoto(uid, uri);
  return addSource(pageId, { name: read.title || 'Photo', mime: 'image/jpeg', body: read.text });
}

/**
 * A web link, read to text by the same server route the web workspace uses (/api/notebooks/extract/url). It
 * takes the device key, not the session token, and meters the read against the account.
 */
export async function addLinkSource(uid: string, pageId: string, raw: string): Promise<PageSource> {
  const key = await deviceKey(uid);
  if (!key) throw new Error('This device needs to re-connect to your account. Try again.');
  let res: Response;
  try {
    res = await fetch(`${APP_API_BASE}/api/notebooks/extract/url`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: raw }),
    });
  } catch {
    throw new Error('That link could not be reached. Check your connection.');
  }
  const json = (await res.json().catch(() => null)) as { title?: string; text?: string; url?: string; error?: string } | null;
  if (!res.ok || !json) throw new Error(json?.error || "Couldn't read that page.");
  const url = json.url || (raw.includes('://') ? raw : `https://${raw}`);
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    // Keep the typed text as the name.
  }
  // The site rides as a mime parameter so the Sources list can show it under the title (canvas: "bailii.org").
  return addSource(pageId, { name: json.title?.trim() || host, mime: `text/uri-list; host=${host}`, body: `${url}\n\n${json.text ?? ''}`.trim() });
}

export async function removeSource(sourceId: string): Promise<void> {
  const { error } = await supabase.rpc('ws_remove_source', { p_id: sourceId });
  if (error) throw new Error(`ws_remove_source: ${error.message}`);
}

function mimeFor(name: string): string | null {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (ext === 'pptx') return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  return null;
}
