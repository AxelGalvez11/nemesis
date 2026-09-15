/**
 * Writing pages from the phone through `ws_apply`, the one write path the web's sync engine uses.
 *
 * The phone does not run the web's full sync engine (apps/web/lib/space/sync-engine.ts). It sends the same
 * operation shapes for the few edits it makes: a new page, a new block, a block's text.
 *
 * 🔴 LISTS TRAVEL AS OPERATIONS, NEVER WHOLE ARRAYS (list-ops.ts): `{ ins: [[id, afterId|null]], del: [id] }`.
 * Sending a page's whole `content` array would erase a block someone added on the web a second earlier.
 *
 * 🔴 TEXT IS SENT WITH THE FIELD'S BASE VERSION. When the web changed the same block since the phone loaded it,
 * ws_apply answers with a conflict instead of overwriting; the caller reloads the page rather than guessing.
 */
import { supabase } from './supabase';

export type ApplyResult = {
  results: { id: string; v?: number; denied?: boolean; missing?: boolean; existed?: boolean }[];
  conflicts: { id: string; field: string; value: unknown; v: number }[];
  denied: string[];
};

type Op =
  | { op: 'create'; id: string; kind: 'page' | 'block'; type: string; parent_id: string | null; props: Record<string, unknown>; section?: 'private' | 'workspace' }
  | { op: 'update'; id: string; base?: number; bases?: Record<string, number>; set?: Record<string, unknown>; lists?: Record<string, { ins?: [string, string | null][]; del?: string[] }> };

export function newId(): string {
  // RFC 4122 v4. 🔴 Hermes has NO global `crypto` (a tap on New note threw "Property 'crypto' doesn't exist"),
  // and a polyfill is a native module, so the bytes come from getRandomValues only when it exists, else
  // Math.random mixed with the clock. These ids only need to be unique, not secret.
  const b = new Uint8Array(16);
  const g = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (g?.getRandomValues) g.getRandomValues(b);
  else {
    let t = Date.now();
    for (let i = 0; i < 16; i++) {
      b[i] = (Math.floor(Math.random() * 256) ^ (t & 0xff)) & 0xff;
      t = Math.floor(t / 256) || Math.floor(Math.random() * 2 ** 32);
    }
  }
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

async function apply(spaceId: string, ops: Op[]): Promise<ApplyResult> {
  const { data, error } = await supabase.rpc('ws_apply', { p_space: spaceId, p_ops: ops, p_client: 'ios' });
  if (error) throw new Error(`ws_apply: ${error.message}`);
  const res = data as Partial<ApplyResult>;
  const out: ApplyResult = { results: res.results ?? [], conflicts: res.conflicts ?? [], denied: res.denied ?? [] };
  if (out.denied.length) throw new Error('You do not have permission to change this page.');
  return out;
}

/** A new page: private at the top level, or inside `parentId`. It also gets a page block in the parent so it shows in the parent's body, like on the web. */
export async function createPage(
  spaceId: string,
  opts: { parentId?: string | null; parentContent?: string[]; title?: string; icon?: string | null },
): Promise<string> {
  const pageId = newId();
  const ops: Op[] = [
    {
      op: 'create',
      id: pageId,
      kind: 'page',
      type: 'page',
      parent_id: opts.parentId ?? null,
      props: { title: opts.title ?? '', ...(opts.icon ? { icon: opts.icon } : {}), content: [] },
      ...(opts.parentId ? {} : { section: 'private' as const }),
    },
  ];
  if (opts.parentId) {
    const linkId = newId();
    ops.push({ op: 'create', id: linkId, kind: 'block', type: 'page', parent_id: opts.parentId, props: { pageId, title: [] } });
    ops.push({ op: 'update', id: opts.parentId, lists: { content: { ins: [[linkId, lastOf(opts.parentContent)]] } } });
  }
  await apply(spaceId, ops);
  return pageId;
}

function lastOf(list: string[] | undefined): string | null {
  return list && list.length ? list[list.length - 1]! : null;
}

/** Appends a text-like block (text, bulleted_list, to_do, sub_header…) at the end of the page. */
export async function appendBlock(
  spaceId: string,
  pageId: string,
  pageContent: string[],
  block: { type: string; text: string; checked?: boolean },
): Promise<string> {
  const id = newId();
  await apply(spaceId, [
    { op: 'create', id, kind: 'block', type: block.type, parent_id: pageId, props: { title: block.text ? [[block.text]] : [], ...(block.type === 'to_do' ? { checked: !!block.checked } : {}) } },
    { op: 'update', id: pageId, lists: { content: { ins: [[id, lastOf(pageContent)]] } } },
  ]);
  return id;
}

/**
 * Adds a block right after `after` inside the same parent (page or block), or at the end of the page when
 * `after` is null. A page block also creates the sub-page it points at.
 */
export async function addBlockAfter(
  spaceId: string,
  pageId: string,
  pageContent: string[],
  after: { id: string; parentId: string | null } | null,
  type: string,
): Promise<string> {
  const id = newId();
  const parent = after?.parentId ?? pageId;
  const ops: Op[] = [];
  if (type === 'page') {
    const subId = newId();
    ops.push({ op: 'create', id: subId, kind: 'page', type: 'page', parent_id: pageId, props: { title: '', content: [] } });
    ops.push({ op: 'create', id, kind: 'block', type: 'page', parent_id: parent, props: { pageId: subId, title: [] } });
  } else {
    ops.push({ op: 'create', id, kind: 'block', type, parent_id: parent, props: { title: [], ...(type === 'to_do' ? { checked: false } : {}) } });
  }
  const listField = parent === pageId ? 'content' : 'children';
  const anchor = after ? after.id : lastOf(pageContent);
  ops.push({ op: 'update', id: parent, lists: { [listField]: { ins: [[id, anchor]] } } });
  await apply(spaceId, ops);
  return id;
}

/** Replaces a block's text. `fieldVersion` is the `fv.title` the phone loaded; a newer edit elsewhere comes back as a conflict. */
export async function setBlockText(spaceId: string, blockId: string, text: string, fieldVersion?: number): Promise<'saved' | 'conflict'> {
  const res = await apply(spaceId, [
    { op: 'update', id: blockId, ...(fieldVersion != null ? { bases: { title: fieldVersion } } : {}), set: { title: text ? [[text]] : [] } },
  ]);
  return res.conflicts.length ? 'conflict' : 'saved';
}

export async function setPageTitle(spaceId: string, pageId: string, title: string): Promise<void> {
  await apply(spaceId, [{ op: 'update', id: pageId, set: { title } }]);
}

export async function setChecked(spaceId: string, blockId: string, checked: boolean): Promise<void> {
  await apply(spaceId, [{ op: 'update', id: blockId, set: { checked } }]);
}

// ── The note editor's toolbar (components/nx/editor/BlockEditor.tsx): turn into, rich text, embeds, comments ──────

/**
 * "Turn into": changes a block's type in place. ws_apply takes `type` at the top level of an update op and versions it
 * as the `$type` field (supabase/migrations/20260911T10_space_core.sql), which is what the web's sync engine sends.
 * `set` carries the props the new type needs (a to-do's `checked`, a callout's `icon`).
 */
export async function setBlockType(spaceId: string, blockId: string, type: string, set?: Record<string, unknown>): Promise<void> {
  const op = { op: 'update', id: blockId, type, ...(set && Object.keys(set).length ? { set } : {}) };
  await apply(spaceId, [op as unknown as Op]);
}

/** Replaces a block's title with rich-text segments, marks and mentions kept. Same field version rule as setBlockText. */
export async function setBlockRich(spaceId: string, blockId: string, title: unknown[], fieldVersion?: number): Promise<'saved' | 'conflict'> {
  const empty = title.every((s) => !Array.isArray(s) || !s[0]);
  const res = await apply(spaceId, [
    { op: 'update', id: blockId, ...(fieldVersion != null ? { bases: { title: fieldVersion } } : {}), set: { title: empty ? [] : title } },
  ]);
  return res.conflicts.length ? 'conflict' : 'saved';
}

/** A block with its own props (a file, image or bookmark) right after `after` in the same parent, or at the end of the page. */
export async function insertBlockAfter(
  spaceId: string,
  pageId: string,
  pageContent: string[],
  after: { id: string; parentId: string | null } | null,
  type: string,
  props: Record<string, unknown>,
): Promise<string> {
  const id = newId();
  const parent = after?.parentId ?? pageId;
  const listField = parent === pageId ? 'content' : 'children';
  await apply(spaceId, [
    { op: 'create', id, kind: 'block', type, parent_id: parent, props },
    { op: 'update', id: parent, lists: { [listField]: { ins: [[id, after ? after.id : lastOf(pageContent)]] } } },
  ]);
  return id;
}

/**
 * A comment on a block: the record the web's block comment card makes (apps/web/lib/space/records.ts), kind `comment`
 * under the block with props `{ text, resolved }`. Author and time come from the row's created_by and created_at.
 * ws_apply lets anyone with comment access or more create one.
 */
export async function addBlockComment(spaceId: string, blockId: string, text: string): Promise<string> {
  const id = newId();
  const op = { op: 'create', id, kind: 'comment', type: '', parent_id: blockId, props: { text, resolved: false } };
  await apply(spaceId, [op as unknown as Op]);
  return id;
}

/**
 * Saves a block's title (rich segments) and says which version the field is now at, so the next save from the same
 * editor sends that as its base instead of the stale one it loaded with (which would come back as a conflict).
 * ws_apply stamps every field an update sets with the record's new version, and returns it as results[].v.
 */
export async function saveBlockTitle(
  spaceId: string,
  blockId: string,
  title: unknown[],
  fieldVersion?: number,
): Promise<{ status: 'saved' | 'conflict'; version?: number }> {
  const empty = title.every((s) => !Array.isArray(s) || !s[0]);
  const res = await apply(spaceId, [
    { op: 'update', id: blockId, ...(fieldVersion != null ? { bases: { title: fieldVersion } } : {}), set: { title: empty ? [] : title } },
  ]);
  if (res.conflicts.length) return { status: 'conflict' };
  const v = res.results.find((r) => r.id === blockId)?.v;
  return { status: 'saved', version: typeof v === 'number' ? v : undefined };
}
