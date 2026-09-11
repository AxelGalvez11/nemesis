/**
 * An in-memory Space backend, for tests and for the /dev-preview/space harness. It is not the real permission model:
 * the SQL self-test covers that against Postgres. It is the same write semantics and result shapes as
 * supabase/migrations/20260911T10_space_core.sql, so the browser half can be exercised without a network.
 */
import { applyList } from "./list-ops";
import type { Kind, Props } from "./records";
import type { ApplyResult, Op, ServerRecord, SpaceSync, Transport, Tx, TxItem } from "./sync-engine";

/**
 * An in-memory `ws_apply`: per-field versions, list operations, conflicts, cascading destroys and broadcasts, with the
 * same result shapes as supabase/migrations/20260911T10_space_core.sql (one result per op, in op order). Permissions
 * are reduced to `denyPages`. The SQL itself is exercised by the database self-test; this pins the browser half.
 */
interface SRec {
  id: string;
  kind: Kind;
  type: string;
  parent_id: string | null;
  page_id: string;
  path: string[];
  owner_id: string | null;
  team_id: string | null;
  props: Props;
  alive: boolean;
  v: number;
  fv: Record<string, number>;
  created_by: string;
  created_at: string;
  edited_at: string;
  trashed_at: string | null;
}

export class FakeServer implements Transport {
  recs = new Map<string, SRec>();
  outbox: Tx[] = [];
  failNext = 0;
  denyPages = new Set<string>();

  async apply(_space: string, ops: Op[], client: string, userId?: string): Promise<ApplyResult> {
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error("network down");
    }
    // The same ceiling as ws_apply.
    if (ops.length > 2000) throw Object.assign(new Error("too many ops in one write"), { retryable: false });
    const results: ApplyResult["results"] = [];
    const conflicts: ApplyResult["conflicts"] = [];
    const denied: string[] = [];
    const byPage = new Map<string, TxItem[]>();
    const emit = (page: string, item: TxItem) => byPage.set(page, [...(byPage.get(page) ?? []), item]);
    const deny = (id: string) => {
      denied.push(id);
      results.push({ id, denied: true });
    };
    const now = new Date().toISOString();
    for (const op of ops) {
      if (op.op === "create") {
        const existing = this.recs.get(op.id);
        if (existing) {
          results.push({ id: op.id, v: existing.v, existed: true });
          continue;
        }
        const place = this.place(op.kind!, op.id, op.parent_id ?? null);
        if (!place || this.denyPages.has(place.page_id) || (op.parent_id && this.denyPages.has(op.parent_id))) {
          deny(op.id);
          continue;
        }
        const top = op.kind === "page" && !op.parent_id;
        const rec: SRec = {
          id: op.id, kind: op.kind!, type: op.type ?? "", parent_id: op.parent_id ?? null, page_id: place.page_id, path: place.path,
          owner_id: top && (op.section ?? "private") === "private" ? userId ?? client : null, team_id: null,
          props: structuredClone(op.props ?? {}), alive: true, v: 1, fv: {}, created_by: userId ?? client, created_at: now, edited_at: now, trashed_at: null,
        };
        this.recs.set(op.id, rec);
        results.push({ id: op.id, v: 1 });
        emit(rec.page_id, { ...this.json(rec), created: true });
        continue;
      }
      const rec = this.recs.get(op.id);
      if (!rec) {
        results.push({ id: op.id, missing: true });
        continue;
      }
      if (this.denyPages.has(rec.page_id)) {
        deny(op.id);
        continue;
      }
      if (op.op === "update") {
        const v = rec.v + 1;
        const item: TxItem = { id: rec.id, kind: rec.kind, type: rec.type, page_id: rec.page_id, parent_id: rec.parent_id, path: rec.path, v, set: {} };
        for (const [f, val] of Object.entries(op.set ?? {})) {
          const fbase = op.bases?.[f] ?? op.base;
          if (fbase !== undefined && (rec.fv[f] ?? 0) > fbase) {
            conflicts.push({ id: rec.id, field: f, value: rec.props[f] ?? null, v: rec.v });
            continue;
          }
          if (val === null) delete rec.props[f];
          else rec.props[f] = structuredClone(val);
          rec.fv[f] = v;
          item.set![f] = val;
        }
        const lists: Record<string, string[]> = {};
        for (const [f, lop] of Object.entries(op.lists ?? {})) {
          rec.props[f] = applyList(rec.props[f] as unknown[], lop);
          rec.fv[f] = v;
          item.set![f] = rec.props[f];
          lists[f] = rec.props[f] as string[];
        }
        if (op.type !== undefined && op.type !== rec.type) {
          const fbase = op.bases?.$type ?? op.base;
          if (fbase !== undefined && (rec.fv.$type ?? 0) > fbase) conflicts.push({ id: rec.id, field: "$type", value: rec.type, v: rec.v });
          else {
            rec.type = op.type;
            rec.fv.$type = v;
            item.type = op.type;
            item.set!.$type = op.type;
          }
        }
        let moved = false;
        if ("parent_id" in op && (op.parent_id ?? null) !== rec.parent_id) {
          const place = this.place(rec.kind, rec.id, op.parent_id ?? null);
          if (!place) {
            deny(op.id);
            continue;
          }
          rec.parent_id = op.parent_id ?? null;
          rec.page_id = place.page_id;
          rec.path = place.path;
          rec.fv.$parent = v;
          moved = true;
          Object.assign(item, { parent_id: rec.parent_id, page_id: rec.page_id, path: rec.path, moved: true });
        }
        if (!Object.keys(item.set!).length && !moved) {
          results.push({ id: rec.id, v: rec.v });
          continue;
        }
        rec.v = v;
        rec.edited_at = now;
        results.push({ id: rec.id, v, lists });
        emit(rec.page_id, item);
        continue;
      }
      if (op.op === "trash" || op.op === "restore") {
        rec.alive = op.op === "restore";
        rec.trashed_at = rec.alive ? null : now;
        rec.v += 1;
        rec.fv.$alive = rec.v;
        results.push({ id: rec.id, v: rec.v });
        emit(rec.page_id, this.summary(rec));
        continue;
      }
      if (op.op === "destroy") {
        for (const id of this.subtree(rec)) this.recs.delete(id);
        results.push({ id: rec.id, destroyed: true });
        emit(rec.page_id, { id: rec.id, kind: rec.kind, page_id: rec.page_id, parent_id: rec.parent_id, path: rec.path, destroyed: true });
      }
    }
    for (const [page, records] of byPage) this.outbox.push({ client, page, records });
    return { ok: true, results, conflicts, denied };
  }

  private place(kind: Kind, id: string, parent: string | null): { page_id: string; path: string[] } | null {
    if (!parent) return kind === "page" ? { page_id: id, path: [id] } : null;
    const p = this.recs.get(parent);
    if (!p) return null;
    if (kind === "page") return p.kind === "page" && !p.path.includes(id) ? { page_id: id, path: [...p.path, id] } : null;
    return p.kind === "page" ? { page_id: p.id, path: p.path } : { page_id: p.page_id, path: p.path };
  }

  private subtree(rec: SRec): Set<string> {
    const out = new Set([rec.id]);
    if (rec.kind === "page") {
      for (const r of this.recs.values()) if (r.path.includes(rec.id)) out.add(r.id);
      return out;
    }
    let grew = true;
    while (grew) {
      grew = false;
      for (const r of this.recs.values()) {
        if (!out.has(r.id) && r.kind !== "page" && r.parent_id && out.has(r.parent_id)) {
          out.add(r.id);
          grew = true;
        }
      }
    }
    return out;
  }

  json(rec: SRec): ServerRecord {
    return structuredClone(rec) as unknown as ServerRecord;
  }

  /** What `ws_page_summary` returns: the record without its content, marked partial. Keep the prop list in step with it. */
  summary(rec: SRec): ServerRecord {
    const props: Props = {};
    for (const k of ["title", "icon", "cover", "rowOf", "titleParts", "titleDate", "collection", "description"]) if (k in rec.props) props[k] = structuredClone(rec.props[k]);
    return {
      id: rec.id, kind: rec.kind, type: rec.type, parent_id: rec.parent_id, page_id: rec.page_id, path: rec.path, owner_id: rec.owner_id,
      team_id: rec.team_id, props, alive: rec.alive, trashed_at: rec.trashed_at, v: rec.v, partial: true,
    };
  }

  load(pageId: string): ServerRecord[] {
    return [...this.recs.values()].filter((r) => r.id === pageId || r.page_id === pageId).map((r) => this.json(r));
  }

  deliver(clients: SpaceSync[]) {
    while (this.outbox.length) {
      const tx = this.outbox.shift()!;
      for (const c of clients) c.receive(tx);
    }
  }
}

type Handler = (payload: unknown) => void;

/**
 * Just enough of a Supabase client for runtime.js: the Space RPCs, realtime channels that deliver this server's
 * broadcasts, an empty calendar and a storage bucket that keeps uploads as object URLs.
 */
export function createFakeSupabase(opts: { userId?: string; name?: string; email?: string } = {}) {
  const server = new FakeServer();
  const userId = opts.userId ?? "00000000-0000-4000-8000-000000000001";
  const spaceId = "00000000-0000-4000-8000-0000000000a1";
  const me = { id: userId, email: opts.email ?? "student@example.com", name: opts.name ?? "Sam Rivera", avatar: null, role: "owner" };
  let settings: Record<string, unknown> = {};
  const favorites = new Map<string, number>();
  const visits = new Map<string, number>();
  const channels = new Map<string, Map<string, Handler[]>>();
  const files = new Map<string, string>();
  // Pending invites by page, then by email. The harness has one person, so every address stays pending.
  const invites = new Map<string, Map<string, string>>();
  // The harness inbox: the notifications ws_inbox would return, newest last.
  const notifications: Array<Record<string, unknown>> = [];
  const presence = new Map<string, Record<string, unknown>[]>();
  // The old Library's notes, for the import (readable_library_documents).
  const library: Array<{ id: string; title: string; content: string }> = [];
  const accessOf = (page: string) => ({
    role: "full",
    section: "private",
    owner: { ...me, role: "full" },
    people: [],
    pending: [...(invites.get(page) ?? new Map<string, string>())].map(([email, role]) => ({ email, role })),
    public: false,
  });

  const summary = (id: string) => {
    const r = server.recs.get(id);
    return r ? { ...server.summary(r), has_children: [...server.recs.values()].some((c) => c.parent_id === id && c.kind === "page") } : null;
  };
  const deliver = () => {
    while (server.outbox.length) {
      const tx = server.outbox.shift() as Tx;
      const topic = `ws:page:${tx.page}`;
      for (const fn of channels.get(topic)?.get("tx") ?? []) fn({ ...tx });
    }
  };

  const rpc = async (name: string, params: Record<string, unknown> = {}) => {
    const ok = (data: unknown) => ({ data, error: null });
    switch (name) {
      case "ws_enabled":
        return ok(true);
      case "ws_bootstrap": {
        const pages = [...server.recs.values()].filter((r) => r.kind === "page");
        return ok({
          user: me,
          settings,
          spaces: [{ id: spaceId, name: "Sam's workspace", role: "owner", members: 1 }],
          space: { id: spaceId, name: "Sam's workspace", icon: null, settings: {}, role: "owner" },
          people: [me],
          teams: [],
          roots: pages.filter((r) => !r.parent_id && r.alive).map((r) => summary(r.id)),
          shared: [],
          favorites: [...favorites.keys()].map(summary).filter(Boolean),
          recents: [...visits.entries()].sort((x, y) => y[1] - x[1]).map(([id]) => summary(id)).filter(Boolean),
        });
      }
      case "ws_load_page": {
        const id = String(params.p_page);
        const page = server.recs.get(id);
        if (!page || page.kind !== "page") return ok({ error: "not_found" });
        const rowOf = page.props.rowOf as { row?: string; coll?: string } | undefined;
        return ok({
          role: "full",
          space_id: spaceId,
          page: server.json(page),
          records: [...server.recs.values()].filter((r) => r.page_id === id && r.id !== id).map((r) => server.json(r)),
          row: rowOf ? { row: rowOf.row && server.recs.has(rowOf.row) ? server.json(server.recs.get(rowOf.row)!) : null, collection: rowOf.coll && server.recs.has(rowOf.coll) ? server.json(server.recs.get(rowOf.coll)!) : null } : null,
          children: [...server.recs.values()].filter((r) => r.parent_id === id && r.kind === "page").map((r) => summary(r.id)),
          ancestors: page.path.filter((p) => p !== id).map(summary).filter(Boolean),
          in_trash: page.path.some((p) => server.recs.get(p)?.alive === false),
        });
      }
      case "ws_load_children": {
        const ids = (params.p_pages as string[]) ?? [];
        return ok({
          pages: [...server.recs.values()].filter((r) => r.kind === "page" && r.parent_id && ids.includes(r.parent_id)).map((r) => summary(r.id)),
          links: [...server.recs.values()].filter((r) => r.kind === "block" && r.type === "page" && ids.includes(r.page_id)).map((r) => server.json(r)),
          content: {},
        });
      }
      case "ws_apply": {
        const res = await server.apply(String(params.p_space), params.p_ops as Op[], String(params.p_client), userId);
        setTimeout(deliver, 30);
        return ok(res);
      }
      case "ws_trash":
        return ok([...server.recs.values()].filter((r) => r.kind === "page" && !r.alive).map((r) => server.summary(r)));
      case "ws_save_settings":
        settings = { ...settings, ...(params.p_patch as Record<string, unknown>) };
        return ok(settings);
      case "ws_visit":
        visits.set(String(params.p_page), Date.now());
        return ok(null);
      case "ws_set_favorite":
        if (params.p_on) favorites.set(String(params.p_page), Date.now());
        else favorites.delete(String(params.p_page));
        return ok(null);
      case "ws_invite": {
        const page = String(params.p_page);
        const role = String(params.p_role ?? "edit");
        const list = invites.get(page) ?? new Map<string, string>();
        const notify: string[] = [];
        for (const raw of (params.p_emails as string[]) ?? []) {
          const email = raw.trim().toLowerCase();
          if (!email || email === me.email || notify.includes(email)) continue;
          list.set(email, role);
          notify.push(email);
        }
        invites.set(page, list);
        return ok({ notify, page: { id: page, title: String(server.recs.get(page)?.props.title ?? "") || "Untitled" }, inviter: me.name });
      }
      case "ws_submit_form": {
        // As ws_submit_form does, closely enough for tests and the harness: the form's own questions only, one row at the
        // end of its database, broadcast like any write.
        const view = server.recs.get(String(params.p_view));
        if (!view || view.kind !== "view" || !view.alive || view.type !== "form") return { data: null, error: { message: "no such form", code: "22023" } };
        const coll = [...server.recs.values()].find((r) => r.kind === "collection" && r.alive && r.page_id === view.page_id);
        if (!coll) return { data: null, error: { message: "this form has no database", code: "22023" } };
        const answers = (params.p_answers ?? {}) as Record<string, unknown>;
        const questions = (view.props.form as { questions?: unknown } | undefined)?.questions;
        const props: Props = {};
        for (const q of Array.isArray(questions) ? questions : []) {
          if (typeof q === "string" && coll.props[`s:${q}`] && answers[q] !== undefined && answers[q] !== "") props[q] = answers[q];
        }
        const id = crypto.randomUUID();
        const rows = Array.isArray(coll.props.rows) ? (coll.props.rows as string[]) : [];
        await server.apply(
          spaceId,
          [
            { op: "create", id, kind: "row", type: "", parent_id: coll.id, props },
            { op: "update", id: coll.id, base: coll.v, lists: { rows: { ins: [[id, rows[rows.length - 1] ?? null]] } } },
          ] as Op[],
          "form",
          userId,
        );
        setTimeout(deliver, 30);
        return ok({ ok: true, row: id });
      }
      case "ws_my_tasks": {
        // As ws_my_tasks does: live rows whose Person properties list this person and whose Status is not complete.
        type SchemaEntry = { type?: string; options?: Array<{ value?: string; color?: string; group?: string }> };
        const items: Array<Record<string, unknown>> = [];
        for (const r of server.recs.values()) {
          if (r.kind !== "row" || !r.alive || !r.parent_id) continue;
          const coll = server.recs.get(r.parent_id);
          const page = server.recs.get(r.page_id);
          if (!coll || coll.kind !== "collection" || !page || !page.alive) continue;
          const schema = Object.entries(coll.props).filter(([k, v]) => k.startsWith("s:") && v && typeof v === "object") as Array<[string, SchemaEntry]>;
          const valueOf = (key: string) => r.props[key.slice(2)];
          if (!schema.some(([k, v]) => v.type === "person" && Array.isArray(valueOf(k)) && (valueOf(k) as unknown[]).includes(userId))) continue;
          const status = schema.find(([, v]) => v.type === "status");
          const value = status ? valueOf(status[0]) : undefined;
          const option = status && typeof value === "string" ? (status[1].options ?? []).find((o) => o.value === value) : undefined;
          if (option?.group === "complete") continue;
          const due = schema.find(([k, v]) => v.type === "date" && valueOf(k));
          items.push({
            id: r.id, page_id: r.page_id, space_id: spaceId, title: String(r.props.title ?? ""), database: String(page.props.title ?? ""),
            status: typeof value === "string" ? value : null, status_color: option?.color ?? null, due: due ? valueOf(due[0]) : null, edited_at: r.edited_at,
          });
        }
        items.sort((a, b) => (a.due && b.due ? String(a.due).localeCompare(String(b.due)) : a.due ? -1 : b.due ? 1 : 0));
        return ok(items);
      }
      case "ws_inbox":
        return ok({ items: [...notifications].reverse(), unread: notifications.filter((n) => !n.read).length });
      case "ws_mark_read": {
        const ids = params.p_ids as string[] | null | undefined;
        for (const n of notifications) if (!ids || ids.includes(String(n.id))) n.read = true;
        return ok(notifications.filter((n) => !n.read).length);
      }
      case "ws_page_access":
        return ok(accessOf(String(params.p_page)));
      case "ws_set_access": {
        const page = String(params.p_page);
        const email = params.p_email ? String(params.p_email).toLowerCase() : null;
        const list = invites.get(page);
        if (email && list) {
          if (params.p_role == null) list.delete(email);
          else list.set(email, String(params.p_role));
        }
        return ok(accessOf(page));
      }
      default:
        return { data: null, error: { message: `fake backend has no ${name}`, code: "42883" } };
    }
  };

  // Plain tables for what the runtime reads and writes directly rather than through an RPC: chats.
  const tables = new Map<string, Array<Record<string, unknown>>>([
    ["chat_threads", []],
    ["chat_messages", []],
  ]);
  const query = (table: string) => {
    const rows = tables.get(table);
    const filters: Array<[string, unknown]> = [];
    let sort: { column: string; ascending: boolean } | null = null;
    let max = Number.POSITIVE_INFINITY;
    const q: Record<string, unknown> = {};
    const chain = () => q;
    for (const m of ["select", "neq", "gte", "lte", "in", "range"]) q[m] = chain;
    q.eq = (column: string, value: unknown) => {
      filters.push([column, value]);
      return q;
    };
    q.order = (column: string, options?: { ascending?: boolean }) => {
      // The first order decides; the calls here only ever add a tiebreak after it.
      sort ??= { column, ascending: options?.ascending !== false };
      return q;
    };
    q.limit = (count: number) => {
      max = count;
      return q;
    };
    q.insert = async (row: Record<string, unknown>) => {
      if (!rows) return { data: null, error: { message: `no table ${table}` } };
      const at = new Date().toISOString();
      rows.push({ created_at: at, updated_at: at, ...structuredClone(row) });
      return { data: null, error: null };
    };
    q.update = (patch: Record<string, unknown>) => ({
      eq: async (column: string, value: unknown) => {
        for (const r of rows ?? []) if (r[column] === value) Object.assign(r, structuredClone(patch));
        return { data: null, error: null };
      },
    });
    q.then = (resolve: (v: unknown) => void) => {
      if (table === "readable_library_documents") return resolve({ data: structuredClone(library), error: null });
      let out = (rows ?? []).filter((r) => filters.every(([column, value]) => r[column] === value));
      const order = sort as { column: string; ascending: boolean } | null;
      if (order) out = [...out].sort((a, b) => String(a[order.column] ?? "").localeCompare(String(b[order.column] ?? "")) * (order.ascending ? 1 : -1));
      return resolve({ data: structuredClone(out.slice(0, max)), error: null });
    };
    return q;
  };

  return {
    server,
    /** Tests and the harness: the plain tables behind `from()`. */
    tables,
    auth: { getSession: async () => ({ data: { session: { access_token: "fake" } } }), signOut: async () => ({ error: null }) },
    realtime: { setAuth: () => {} },
    rpc,
    from: (table: string) => query(table),
    channel(topic: string) {
      const handlers = channels.get(topic) ?? new Map<string, Handler[]>();
      channels.set(topic, handlers);
      const ch = {
        on(_type: string, filter: { event: string }, fn: Handler) {
          handlers.set(filter.event, [...(handlers.get(filter.event) ?? []), (payload) => fn({ payload })]);
          return ch;
        },
        subscribe(cb?: (status: string) => void) {
          setTimeout(() => cb?.("SUBSCRIBED"), 0);
          return ch;
        },
        // Presence with one person in the room: whoever tracked last.
        async track(state: Record<string, unknown>) {
          presence.set(topic, [state]);
          for (const fn of handlers.get("sync") ?? []) fn({});
          return "ok";
        },
        async untrack() {
          presence.delete(topic);
          for (const fn of handlers.get("sync") ?? []) fn({});
          return "ok";
        },
        presenceState() {
          const list = presence.get(topic) ?? [];
          return list.length ? { [String(list[0]!.id ?? "me")]: list } : {};
        },
      };
      return ch;
    },
    removeChannel: async () => "ok",
    /** Harness and tests: the notes an old Library holds. */
    seedLibrary(notes: Array<{ id: string; title: string; content: string }>) {
      library.splice(0, library.length, ...notes);
    },
    /** Harness only: a notification from someone else, delivered the way ws_notify broadcasts it on the person's channel. */
    notify(kind: "share" | "comment" | "mention" | "assign", pageId: string, preview: string, actorName = "Ana Lopez", recordId: string | null = null) {
      const n: Record<string, unknown> = {
        id: crypto.randomUUID(),
        kind,
        page_id: pageId,
        record_id: recordId,
        preview,
        created_at: new Date().toISOString(),
        read: false,
        actor: { id: "00000000-0000-4000-8000-000000000002", name: actorName, avatar: null, role: null },
        page: summary(pageId),
      };
      notifications.push(n);
      for (const fn of channels.get(`ws:user:${userId}`)?.get("notify") ?? []) fn({ notification: n });
      return n;
    },
    storage: {
      from: () => ({
        upload: async (path: string, file: Blob) => {
          files.set(path, URL.createObjectURL(file));
          return { data: { path }, error: null };
        },
        createSignedUrl: async (path: string) => ({ data: { signedUrl: files.get(path) ?? "" }, error: null }),
      }),
    },
  };
}

/**
 * Harness only: Nemesis's side of a chat with no model behind it. The answer streams in a few words at a time and names
 * the chat, as the board's turn does, so the Chat tab can be driven on /dev-preview/space. Stopping it rejects, as a
 * real stopped turn does.
 */
export async function fakeChatEngine(input: { message: string; signal?: AbortSignal; onContent?: (visible: string) => void }) {
  const answer = `The preview has no model, so this stands in for Nemesis. You asked: "${input.message.slice(0, 120)}"\n\n- An answer streams in as it is written\n- It is saved with the chat`;
  let shown = "";
  for (const word of answer.split(/(?<=\s)/)) {
    if (input.signal?.aborted) throw new DOMException("The turn was stopped.", "AbortError");
    shown += word;
    input.onContent?.(shown);
    await new Promise((resolve) => setTimeout(resolve, 12));
  }
  return { content: shown, citations: [], suggestions: { followUps: [], branches: [], newThreads: [] }, title: input.message.slice(0, 60), truncated: false, error: null };
}
