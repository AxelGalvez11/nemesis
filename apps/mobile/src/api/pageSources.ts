/**
 * Adding a source to a page from the phone (canvas: AddSource). The text a file turns out to hold is saved
 * against the page with `ws_add_source`, the same RPC the web workspace uses (apps/web/space/app/runtime.js
 * addSourceFile), so everyone the page is shared with can read it and Create / Ask can use it.
 *
 * Files go through the phone's existing upload-and-read lane (api/documents.ts pickAndReadDocument), which
 * stores the file in the student's own storage and reads it on the server.
 */
import { DocumentError, pickAndReadDocument } from './documents';
import { pageText } from './makeCards';
import type { PageSource } from './space';
import { supabase } from './supabase';

export async function addSource(pageId: string, fields: { name: string; mime?: string | null; bytes?: number | null; body: string }): Promise<PageSource> {
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
    p_error: failed ? 'Nothing could be read out of this file.' : null,
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
  return addSource(pageId, { name: note.title || 'Untitled note', mime: 'text/x-nemesis-note', body: note.text });
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
