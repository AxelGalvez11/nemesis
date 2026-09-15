/**
 * Pages for the rebuilt Notes tab, read from the same Space tables the web app writes (ws_records).
 *
 * 🔴 EVERY ws_ TABLE IS CLOSED TO DIRECT READS. Row security is on with all access revoked, so
 * `.from('ws_records')` returns nothing; everything here goes through the security-definer RPCs
 * (supabase/migrations/20260911T10_space_core.sql and the space_home / space_notes_search migrations).
 */
import { supabase } from './supabase';

export type PageSummary = {
  id: string;
  parent_id: string | null;
  path: string[] | null;
  props: { title?: string; icon?: unknown; cover?: unknown };
  alive: boolean;
  has_children?: boolean;
  created_at: string | null;
  edited_at: string | null;
};

export type SpaceRecord = {
  id: string;
  kind: 'page' | 'block' | 'row' | 'collection' | 'view' | 'comment';
  type: string;
  parent_id: string | null;
  page_id: string | null;
  props: Record<string, unknown>;
  alive: boolean;
  edited_at: string | null;
};

export type LoadedPage = {
  role: string;
  space_id: string;
  page: SpaceRecord;
  records: SpaceRecord[];
  children: PageSummary[];
  ancestors: PageSummary[];
  in_trash: boolean;
};

/** The shape `ws_source_json` returns: note `page`, `at` and `by`, not `page_id` / `created_at`. */
export type PageSource = {
  id: string;
  page: string;
  name: string;
  mime: string | null;
  bytes: number | null;
  chars: number | null;
  status: 'reading' | 'ready' | 'failed' | string;
  error: string | null;
  by: string | null;
  at: string;
};

export type SearchHit = { page_id: string; title: string; score: number; passages: string[] };

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

export type Bootstrap = { space: { id: string; name: string } | null; roots: PageSummary[]; recents: PageSummary[]; favorites: PageSummary[] };

export function bootstrap(): Promise<Bootstrap> {
  return rpc<Bootstrap>('ws_bootstrap', {});
}

/** Every page the person can open in the space, newest edit first (capped at 5000 in the RPC). */
export async function allPages(spaceId: string): Promise<PageSummary[]> {
  return (await rpc<PageSummary[]>('ws_all_pages', { p_space: spaceId })).filter((p) => p.alive);
}

export async function loadPage(pageId: string): Promise<LoadedPage> {
  const res = await rpc<LoadedPage & { error?: string }>('ws_load_page', { p_page: pageId });
  if (res.error) throw new Error(res.error === 'no_access' ? 'You no longer have access to this page.' : 'This page was not found.');
  return res;
}

export function pageSources(pageId: string): Promise<PageSource[]> {
  return rpc<PageSource[]>('ws_page_sources', { p_page: pageId });
}

export function searchNotes(spaceId: string, query: string, limit = 12): Promise<SearchHit[]> {
  return rpc<SearchHit[]>('ws_search_notes', { p_space: spaceId, p_query: query, p_limit: limit });
}

export type PageNode = PageSummary & { children: PageNode[] };

/** Builds the page tree from the flat list. A page whose parent is missing (trashed, no access) becomes a root. */
export function buildTree(pages: PageSummary[]): PageNode[] {
  const byId = new Map<string, PageNode>();
  for (const p of pages) byId.set(p.id, { ...p, children: [] });
  const roots: PageNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const order = (a: PageNode, b: PageNode) => (b.edited_at ?? '').localeCompare(a.edited_at ?? '');
  const sortDeep = (list: PageNode[]) => {
    list.sort(order);
    list.forEach((n) => sortDeep(n.children));
  };
  sortDeep(roots);
  return roots;
}

/** Plain text of a block title: a string on pages, rich-text segments `[[text, marks?], …]` on blocks. */
export function recordText(title: unknown): string {
  if (typeof title === 'string') return title;
  if (!Array.isArray(title)) return '';
  return title.map((seg) => (Array.isArray(seg) && typeof seg[0] === 'string' ? seg[0] : '')).join('');
}

export type Block = { id: string; type: string; text: string; checked?: boolean; pageId?: string; transcript?: string; depth: number };

/** Flattens a loaded page into render order: page.props.content, then each block's children, depth-first. */
export function pageBlocks(loaded: LoadedPage): Block[] {
  const byId = new Map(loaded.records.filter((r) => r.kind === 'block' && r.alive).map((r) => [r.id, r]));
  const out: Block[] = [];
  const seen = new Set<string>();
  const walk = (ids: unknown, depth: number) => {
    if (!Array.isArray(ids)) return;
    for (const raw of ids) {
      const id = String(raw);
      const r = byId.get(id);
      if (!r || seen.has(id)) continue;
      seen.add(id);
      const p = r.props;
      const transcript = Array.isArray(p.transcript)
        ? (p.transcript as { text?: string }[]).map((l) => l?.text ?? '').join(' ')
        : undefined;
      out.push({
        id,
        type: r.type,
        text: recordText(p.title),
        checked: Boolean(p.checked),
        pageId: typeof p.pageId === 'string' ? p.pageId : undefined,
        transcript,
        depth,
      });
      walk(p.children, depth + 1);
    }
  };
  walk(loaded.page.props.content, 0);
  return out;
}
