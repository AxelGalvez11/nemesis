/**
 * Files, links and sources put INTO a note from the editor's Media panel (canvas: AddMedia, NoteReady's file embed).
 *
 * Blocks use the web's own media types and props so a phone-made embed renders on the web
 * (apps/web/space/app/main.js MediaBlock / MediaPicker): `image` `video` `audio` `file` `bookmark`, each with
 * `src` and `name`. An uploaded file's `src` is `ws-file:<space>/<page>/<id>-<name>` in the private `ws-files`
 * bucket, exactly the path the web's runtime.upload writes (the storage policy reads the page from the second
 * segment). The phone also keeps `mime` and `bytes` on the block for the file card's meta line.
 *
 * A PDF, Word or PowerPoint file is ALSO read into the page's Sources with ws_add_source, the way addFileSource does,
 * so Ask and Create can use its text. Pictures, audio and video go into the note only: the reader has no text for them.
 */
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Linking } from 'react-native';
import { documentMime } from '@/lib/document-kind';
import { DocumentError, readDocumentText } from './documents';
import { addSource } from './pageSources';
import type { PageSource } from './space';
import { newId } from './spaceWrite';
import { supabase } from './supabase';

export type MediaKind = 'file' | 'image' | 'pdf' | 'audio' | 'video';
export type EmbedBlock = { type: 'file' | 'image' | 'video' | 'audio' | 'bookmark'; props: Record<string, unknown> };
export type UploadedMedia = {
  block: EmbedBlock;
  /** Reads the file into the page's Sources. Resolves to a sentence to show when that part failed, else null. */
  readSource: (() => Promise<string | null>) | null;
};

/** The ws-files bucket's own limit (supabase/migrations/20260911T10_space_core.sql). */
const MAX_BYTES = 52428800;

const PICK: Record<MediaKind, string[]> = {
  file: ['*/*'],
  image: ['image/*'],
  pdf: ['application/pdf'],
  audio: ['audio/*'],
  video: ['video/*'],
};

const MIMES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  heic: 'image/heic',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  txt: 'text/plain',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export function guessMime(name: string): string {
  return MIMES[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
}

function blockTypeFor(kind: MediaKind, mime: string): EmbedBlock['type'] {
  if (kind === 'pdf') return 'file';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
}

/** Opens the picker, uploads the file next to the page, and returns the block to insert. Null when the student backed out. */
export async function pickAndUploadMedia(kind: MediaKind, spaceId: string, pageId: string, onStep?: (label: string) => void): Promise<UploadedMedia | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: PICK[kind], copyToCacheDirectory: true, multiple: false });
  if (picked.canceled) return null;
  const asset = picked.assets?.[0];
  if (!asset) return null;
  const size = asset.size ?? null;
  if (size != null && size > MAX_BYTES) throw new Error('That file is over 50 MB, the most a note can hold.');

  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) throw new Error('Sign in again to add a file.');

  const mime = asset.mimeType || guessMime(asset.name);
  onStep?.(`Uploading ${asset.name}`);
  const safe = asset.name.replace(/[^\w.-]+/g, '_').slice(-80) || 'file';
  const path = `${spaceId}/${pageId}/${newId()}-${safe}`;
  const upload = await FileSystem.uploadAsync(`${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/ws-files/${path}`, asset.uri, {
    httpMethod: 'POST',
    headers: { apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '', Authorization: `Bearer ${session.access_token}`, 'Content-Type': mime },
  }).catch(() => null);
  if (!upload || upload.status < 200 || upload.status >= 300) throw new Error('That file could not be uploaded. Check your connection and try again.');

  const block: EmbedBlock = { type: blockTypeFor(kind, mime), props: { src: `ws-file:${path}`, name: asset.name, mime, ...(size != null ? { bytes: size } : {}) } };
  const docMime = documentMime(asset.name);
  const readSource = docMime
    ? async () => {
        try {
          const text = await readDocumentText(session.user.id, asset.uri, asset.name, docMime, size);
          await addSource(pageId, { name: asset.name, mime: docMime, bytes: size, body: text });
          return null;
        } catch (e) {
          return e instanceof DocumentError
            ? `The file is in your note, but it was not added to Sources. ${e.message}`
            : 'The file is in your note, but its text could not be added to Sources.';
        }
      }
    : null;
  return { block, readSource };
}

/** A file block for a source the page already has. Sources keep text, not the file, so the block has no `src`. */
export function sourceEmbed(source: PageSource): EmbedBlock {
  return { type: 'file', props: { name: source.name, mime: source.mime, bytes: source.bytes, sourceId: source.id } };
}

/**
 * A bookmark block for a pasted link, or null when it is not a web link. The web has no separate embed block type,
 * so "Web embed" makes the same bookmark with `embed: true` (the web renders it as a link either way).
 */
export function linkEmbed(raw: string, embed: boolean): EmbedBlock | null {
  let url = raw.trim();
  if (!url || /\s/.test(url)) return null;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  // RN's URL polyfill has no `hostname`, so the host is read by hand.
  const host = /^https?:\/\/([^/?#]+)/i.exec(url)?.[1]?.replace(/^www\./i, '');
  if (!host || !host.includes('.')) return null;
  return { type: 'bookmark', props: { src: url, name: host, ...(embed ? { embed: true } : {}) } };
}

/** Opens a block's file: a signed link for a stored `ws-file:` (twelve hours, like the web), or the link itself. */
export async function openEmbed(src: string): Promise<void> {
  if (src.startsWith('ws-file:')) {
    const { data, error } = await supabase.storage.from('ws-files').createSignedUrl(src.slice('ws-file:'.length), 12 * 3600);
    if (error || !data?.signedUrl) throw new Error('That file could not be opened. Try again.');
    await Linking.openURL(data.signedUrl);
    return;
  }
  if (/^https?:\/\//i.test(src)) await Linking.openURL(src);
}
