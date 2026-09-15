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
  // RFC 4122 v4 from crypto.getRandomValues (Hermes has it on SDK 56).
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
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
