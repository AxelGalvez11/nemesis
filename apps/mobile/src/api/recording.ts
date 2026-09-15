/**
 * Recording a class onto a PAGE from the phone, through the web's page pipeline.
 *
 * The web does this in apps/web/lib/space/meeting-recorder.ts: one audio file to the private `recordings` bucket, then
 * POST /api/recordings/jobs with surface "space", contextId = the recording block, messageId = the page. The recording
 * worker transcribes and writes notes onto the job's artifact (chat_recording_artifacts); it never touches ws_records.
 * So when the job is ready, THE CLIENT writes the notes into the page as blocks under the recording block (the web's
 * meeting-summary.ts does the same, with ids derived from the job id so two clients write the same blocks, not copies)
 * and files the recording as one of the page's sources (ws_add_source).
 *
 * 🔴 The jobs route has no field for what the student typed. Typed lines are saved on the page as their own blocks;
 * they do not feed the AI notes. Changing that needs a server change (route + worker), not a phone change.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { File, Directory, Paths, FileMode } from 'expo-file-system';
import { APP_API_BASE } from './chat';
import { newId } from './spaceWrite';
import { loadPage, type LoadedPage, type SpaceRecord } from './space';
import { supabase } from './supabase';
import { getPhoneSettings } from './phoneSettings';
import { notifyNotesReady } from '@/lib/push';
import { encodeToM4A } from '../../modules/nemesis-audio-encoder';

export type JobStage = 'queued' | 'transcribing' | 'composing' | 'filing' | 'indexing' | 'ready';
export type JobRow = { id: string; status: 'processing' | 'ready' | 'failed'; stage: JobStage | null; error: string | null; artifact_id: string | null };

/** Block props the phone keeps on a page's recording block. */
export type RecordingStatus = 'uploading' | 'upload_failed' | 'processing' | 'ready' | 'failed' | 'audio_only';

// ── ws_apply, for the ops spaceWrite.ts does not expose (props beyond title, children lists) ─────────────────────────

type Op =
  | { op: 'create'; id: string; kind: 'block'; type: string; parent_id: string; props: Record<string, unknown> }
  | { op: 'update'; id: string; set?: Record<string, unknown>; lists?: Record<string, { ins?: [string, string | null][] }> };

async function apply(spaceId: string, ops: Op[]): Promise<void> {
  const { data, error } = await supabase.rpc('ws_apply', { p_space: spaceId, p_ops: ops, p_client: 'ios' });
  if (error) throw new Error('The page could not be saved. Check your connection and try again.');
  if ((data as { denied?: string[] } | null)?.denied?.length) throw new Error('You do not have permission to change this page.');
}

const lastOf = (list: unknown): string | null => (Array.isArray(list) && list.length ? String(list[list.length - 1]) : null);

/**
 * Puts the recording block at the end of the page, then the lines the student typed under it, in one write.
 * Returns the block id; it is the job's contextId.
 */
export async function createRecordingBlock(loaded: LoadedPage, startedAt: number, typed: string[]): Promise<string> {
  const pageId = loaded.page.id;
  const blockId = newId();
  const ops: Op[] = [
    { op: 'create', id: blockId, kind: 'block', type: 'transcription', parent_id: pageId, props: { title: [['Recording']], status: 'uploading', startedAt: new Date(startedAt).toISOString(), content: [] } },
  ];
  let after = blockId;
  const ins: [string, string | null][] = [[blockId, lastOf(loaded.page.props.content)]];
  for (const line of typed) {
    const id = newId();
    ops.push({ op: 'create', id, kind: 'block', type: 'text', parent_id: pageId, props: { title: [[line]] } });
    ins.push([id, after]);
    after = id;
  }
  ops.push({ op: 'update', id: pageId, lists: { content: { ins } } });
  await apply(loaded.space_id, ops);
  return blockId;
}

export async function setRecordingProps(spaceId: string, blockId: string, set: Record<string, unknown>): Promise<void> {
  await apply(spaceId, [{ op: 'update', id: blockId, set }]);
}

// ── Audio: join the pieces, compress, keep a copy on the phone ────────────────────────────────────────────────────────

const PENDING = () => new Directory(Paths.document, 'recordings-pending');
export const pendingAudioUri = (blockId: string) => new File(PENDING(), `${blockId}.m4a`).uri;

function wavHeader(dataBytes: number, sampleRate = 16_000): Uint8Array {
  const b = new Uint8Array(44);
  const v = new DataView(b.buffer);
  const tag = (o: number, s: string) => [...s].forEach((ch, i) => (b[o + i] = ch.charCodeAt(0)));
  tag(0, 'RIFF'); v.setUint32(4, 36 + dataBytes, true); tag(8, 'WAVE'); tag(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); tag(36, 'data'); v.setUint32(40, dataBytes, true);
  return b;
}

/** Where a WAV's samples start and how many bytes they are, read from its first few KB. */
function dataChunk(head: Uint8Array, fileSize: number): { offset: number; length: number } | null {
  const v = new DataView(head.buffer, head.byteOffset, head.byteLength);
  for (let i = 12; i + 8 <= head.length; ) {
    const id = String.fromCharCode(head[i]!, head[i + 1]!, head[i + 2]!, head[i + 3]!);
    const size = v.getUint32(i + 4, true);
    if (id === 'data') return { offset: i + 8, length: Math.min(size, fileSize - i - 8) };
    i += 8 + size + (size % 2);
  }
  return null;
}

/** Several recognition sessions (pause, resume, iOS restarts) leave several 16 kHz mono WAVs; the job takes one file. Streamed, never held in memory. */
function joinWavs(uris: string[]): string {
  if (uris.length === 1) return uris[0]!;
  const parts = uris
    .map((uri) => {
      const f = new File(uri);
      if (!f.exists || !f.size) return null;
      const h = f.open(FileMode.ReadOnly);
      const chunk = dataChunk(h.readBytes(Math.min(8192, f.size)), f.size);
      h.close();
      return chunk ? { f, ...chunk } : null;
    })
    .filter((p): p is NonNullable<typeof p> => !!p);
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new File(Paths.cache, `joined-${newId()}.wav`);
  out.create();
  const w = out.open(FileMode.WriteOnly);
  try {
    w.writeBytes(wavHeader(total));
    for (const p of parts) {
      const r = p.f.open(FileMode.ReadOnly);
      r.offset = p.offset;
      for (let left = p.length; left > 0; ) {
        const bytes = r.readBytes(Math.min(1 << 20, left));
        if (!bytes.length) break;
        w.writeBytes(bytes);
        left -= bytes.length;
      }
      r.close();
    }
  } finally {
    w.close();
  }
  return out.uri;
}

/**
 * One compressed file for the block, kept in Documents until the notes are on the page, so a failed upload loses nothing.
 * The bucket accepts audio/m4a and refuses wav, so a build without the encoder cannot upload; that is said plainly.
 */
export async function prepareRecordingAudio(blockId: string, uris: string[]): Promise<{ uri: string; bytes: number }> {
  if (!uris.length) throw new Error('Nothing was recorded. Check the microphone and try again.');
  const dir = PENDING();
  if (!dir.exists) dir.create({ intermediates: true });
  const target = new File(dir, `${blockId}.m4a`);
  if (target.exists && target.size) return { uri: target.uri, bytes: target.size };
  const joined = joinWavs(uris);
  const encoded = await encodeToM4A(joined, target.uri);
  if (joined !== uris[0]) await FileSystem.deleteAsync(joined, { idempotent: true }).catch(() => undefined);
  if (!encoded) throw new Error('This version of the app cannot compress audio, so the recording cannot be uploaded.');
  for (const uri of uris) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  return { uri: encoded.uri, bytes: encoded.bytes };
}

export function hasPendingAudio(blockId: string): boolean {
  const f = new File(PENDING(), `${blockId}.m4a`);
  return f.exists && (f.size ?? 0) > 0;
}

export async function dropPendingAudio(blockId: string): Promise<void> {
  await FileSystem.deleteAsync(pendingAudioUri(blockId), { idempotent: true }).catch(() => undefined);
}

// ── Upload and job ────────────────────────────────────────────────────────────────────────────────────────────────────

async function session() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Sign in to save this recording.');
  return data.session;
}

/** Upload, then file the page job. The route meters `durationSeconds`, so it is the time the microphone was actually on. */
export async function submitPageRecording(input: { pageId: string; blockId: string; audioUri: string; seconds: number }): Promise<{ jobId: string; artifactId: string; storagePath: string }> {
  const s = await session();
  const storagePath = `${s.user.id}/${newId()}.m4a`;
  const upload = await FileSystem.uploadAsync(`${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/recordings/${storagePath}`, input.audioUri, {
    headers: { apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '', Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'audio/m4a' },
    httpMethod: 'POST',
  }).catch(() => null);
  if (!upload || upload.status !== 200) throw new Error('The recording could not be uploaded. Check your connection and try again.');
  const res = await fetch(`${APP_API_BASE}/api/recordings/jobs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ storagePath, durationSeconds: Math.max(1, Math.round(input.seconds)), contextId: input.blockId, messageId: input.pageId, surface: 'space' }),
  }).catch(() => null);
  const body = (await res?.json().catch(() => null)) as { jobId?: string; artifactId?: string; error?: string } | null;
  if (!res || !res.ok || !body?.jobId || !body.artifactId) throw new Error(body?.error || 'The recording could not be saved. Try again in a moment.');
  return { jobId: body.jobId, artifactId: body.artifactId, storagePath };
}

export async function readJob(jobId: string): Promise<JobRow | null> {
  const { data } = await supabase.from('recording_jobs').select('id,status,stage,error,artifact_id').eq('id', jobId).maybeSingle();
  return (data as JobRow | null) ?? null;
}

/** Resumes a failed job from the stage that failed (retry_recording_job re-checks ownership). */
export async function retryJob(jobId: string): Promise<void> {
  const { error } = await supabase.rpc('retry_recording_job', { p_job_id: jobId });
  if (error) throw new Error('The notes could not be restarted. Try again in a moment.');
}

/** What each stage is called while the student waits. */
export function stageLabel(stage: JobStage | 'uploading' | null): string {
  switch (stage) {
    case 'uploading': return 'Uploading the recording';
    case 'transcribing': return 'Transcribing the recording';
    case 'composing': return 'Writing the notes';
    case 'filing':
    case 'indexing':
    case 'ready': return 'Almost done';
    default: return 'Getting the recording ready';
  }
}

// ── When the job is ready: notes onto the page, recording into Sources ───────────────────────────────────────────────

/** SHA-1, for name-based ids that match the web's nameId (library-import.ts). */
function sha1(msg: Uint8Array): Uint8Array {
  const ml = msg.length;
  const withPad = new Uint8Array(((ml + 9 + 63) >> 6) << 6);
  withPad.set(msg);
  withPad[ml] = 0x80;
  const dv = new DataView(withPad.buffer);
  dv.setUint32(withPad.length - 4, ml * 8, false);
  dv.setUint32(withPad.length - 8, Math.floor(ml / 0x20000000), false);
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  for (let off = 0; off < withPad.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 80; i++) { const x = w[i - 3]! ^ w[i - 8]! ^ w[i - 14]! ^ w[i - 16]!; w[i] = (x << 1) | (x >>> 31); }
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      const [f, k] = i < 20 ? [(b & c) | (~b & d), 0x5a827999] : i < 40 ? [b ^ c ^ d, 0x6ed9eba1] : i < 60 ? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc] : [b ^ c ^ d, 0xca62c1d6];
      const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]!) >>> 0;
      e = d; d = c; c = ((b << 30) | (b >>> 2)) >>> 0; b = a; a = t;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20);
  const ov = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((h, i) => ov.setUint32(i * 4, h, false));
  return out;
}

export function nameId(namespace: string, name: string): string {
  const ns = namespace.replace(/-/g, '');
  const text = new TextEncoder().encode(name);
  const message = new Uint8Array(16 + text.length);
  for (let i = 0; i < 16; i++) message[i] = parseInt(ns.slice(i * 2, i * 2 + 2), 16);
  message.set(text, 16);
  const hash = sha1(message);
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = Array.from(hash.subarray(0, 16), (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The worker's Markdown as page blocks: headings, lists, to-dos, quotes, paragraphs. Emphasis markers are dropped. */
export function notesToBlocks(markdown: string): { type: string; text: string; checked?: boolean }[] {
  const plain = (s: string) => s.replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
  const out: { type: string; text: string; checked?: boolean }[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ type: 'text', text: plain(para.join(' ')) });
    para = [];
  };
  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    let m: RegExpMatchArray | null;
    if (!line || /^(-{3,}|\*{3,})$/.test(line)) { flush(); continue; }
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) { flush(); out.push({ type: m[1]!.length === 1 ? 'header' : m[1]!.length === 2 ? 'sub_header' : 'sub_sub_header', text: plain(m[2]!) }); continue; }
    if ((m = line.match(/^[-*+]\s+\[( |x|X)\]\s+(.*)$/))) { flush(); out.push({ type: 'to_do', text: plain(m[2]!), checked: m[1] !== ' ' }); continue; }
    if ((m = line.match(/^[-*+]\s+(.*)$/))) { flush(); out.push({ type: 'bulleted_list', text: plain(m[1]!) }); continue; }
    if ((m = line.match(/^\d+[.)]\s+(.*)$/))) { flush(); out.push({ type: 'numbered_list', text: plain(m[1]!) }); continue; }
    if ((m = line.match(/^>\s?(.*)$/))) { flush(); out.push({ type: 'quote', text: plain(m[1]!) }); continue; }
    para.push(line);
  }
  flush();
  return out.filter((b) => b.text);
}

function dateLabel(iso: unknown): string {
  const d = typeof iso === 'string' ? new Date(iso) : new Date();
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Writes a ready job's notes under the recording block, marks it ready, and adds the recording to the page's sources.
 * Safe to run twice: note ids come from the job id, and a block already marked ready is left alone.
 */
export async function finishRecording(loaded: LoadedPage, block: SpaceRecord, jobId: string, artifactId: string, bytes: number | null): Promise<void> {
  if (block.props.status === 'ready') return;
  const { data: art } = await supabase.from('chat_recording_artifacts').select('notes,transcript,duration_seconds').eq('id', artifactId).maybeSingle();
  const notes = String((art as { notes?: string } | null)?.notes ?? '');
  const transcript = String((art as { transcript?: string } | null)?.transcript ?? '');
  const seconds = Number((art as { duration_seconds?: number } | null)?.duration_seconds ?? block.props.durationSeconds ?? 0);
  const existing = new Set(loaded.records.map((r) => r.id));
  const blocks = notesToBlocks(notes);
  const ops: Op[] = [];
  const ins: [string, string | null][] = [];
  let after = lastOf(block.props.content);
  blocks.forEach((b, i) => {
    const id = nameId(jobId, `summary:${i + 1}`);
    if (existing.has(id)) return;
    ops.push({ op: 'create', id, kind: 'block', type: b.type, parent_id: block.id, props: { title: [[b.text]], ...(b.type === 'to_do' ? { checked: !!b.checked } : {}) } });
    ins.push([id, after]);
    after = id;
  });
  const lines = transcript.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean).map((text) => ({ speaker: '', t: '', text }));
  // Listed under both names: the web's meeting block reads `content`, the phone's pageBlocks walks `children`.
  const childIns: [string, string | null][] = ins.map(([id], i) => [id, i === 0 ? lastOf(block.props.children) : ins[i - 1]![0]]);
  ops.push({
    op: 'update',
    id: block.id,
    set: { status: 'ready', transcript: lines, durationSeconds: seconds },
    ...(ins.length ? { lists: { content: { ins }, children: { ins: childIns } } } : {}),
  });
  await apply(loaded.space_id, ops);
  const { error } = await supabase.rpc('ws_add_source', {
    p_page: loaded.page.id,
    p_name: `Recording, ${dateLabel(block.props.startedAt)}`,
    p_mime: 'audio/m4a',
    p_bytes: bytes,
    p_body: transcript,
    p_status: 'ready',
  });
  if (error) console.warn('recording source not added:', error.message);
  await dropPendingAudio(block.id);

  // Study settings. Keep the audio off: the uploaded file goes once the notes and transcript are on the page.
  const phone = getPhoneSettings();
  const storagePath = typeof block.props.storagePath === 'string' ? block.props.storagePath : null;
  if (!phone.keepAudio && storagePath) {
    const { error: removeError } = await supabase.storage.from('recordings').remove([storagePath]);
    if (removeError) console.warn('recording audio not removed:', removeError.message);
    else await apply(loaded.space_id, [{ op: 'update', id: block.id, set: { storagePath: null, audioRemoved: true } }]).catch(() => undefined);
  }
  if (phone.notesReadyAlert) void notifyNotesReady(plainTitle(loaded.page.props.title), loaded.page.id);
}

/** A page title is rich text (segments); the alert needs the words only. */
function plainTitle(title: unknown): string {
  if (!Array.isArray(title)) return typeof title === 'string' ? title : '';
  return title.map((seg) => (Array.isArray(seg) ? String(seg[0] ?? '') : '')).join('').trim();
}

/**
 * For the page screen: finishes any recording on this page whose notes became ready while nobody was watching
 * (the student left the recorder while it was writing). Returns true when it wrote something, so the caller refetches.
 */
export async function settlePageRecordings(pageId: string): Promise<boolean> {
  const loaded = await loadPage(pageId);
  let wrote = false;
  for (const r of loaded.records) {
    if (r.kind !== 'block' || r.type !== 'transcription' || !r.alive) continue;
    const jobId = typeof r.props.jobId === 'string' ? r.props.jobId : null;
    const artifactId = typeof r.props.artifactId === 'string' ? r.props.artifactId : null;
    if (!jobId || !artifactId || r.props.status === 'ready' || r.props.status === 'audio_only') continue;
    const job = await readJob(jobId);
    if (job?.status === 'ready') {
      await finishRecording(loaded, r, jobId, artifactId, typeof r.props.bytes === 'number' ? r.props.bytes : null);
      wrote = true;
    } else if (job?.status === 'failed' && r.props.status !== 'failed') {
      await setRecordingProps(loaded.space_id, r.id, { status: 'failed' });
      wrote = true;
    }
  }
  return wrote;
}
