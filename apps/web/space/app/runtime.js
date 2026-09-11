// The Space runtime: the one state object the Space frontend draws (S), kept in step with Supabase.
//
// main.js renders S and mutates it. This module fills S from the server, saves every change through the sync engine
// (lib/space/sync-engine.ts), follows other people's edits over realtime, and knows who is signed in, which page the
// address bar points at, and whether the app is dark. Nothing in here draws.

import { SpaceSync } from '../../lib/space/sync-engine';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s) => typeof s === 'string' && UUID_RE.test(s);
export const uid = () => crypto.randomUUID();

const search = () => (typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search));
const FIXED_NOW = search().has('now') ? Number(search().get('now')) : 0;
/** The clock every relative time reads. `?now=` pins it, so a screenshot says the same thing twice. */
export const NOW = () => FIXED_NOW || Date.now();

// ------------------------------------------------------------------------------------------------ routes

// Where the Space routes live. Empty in the app; a preview harness serves them under its own path.
let BASE = '';
export const setBasePath = (base) => {
  BASE = String(base || '').replace(/\/+$/, '');
};

/** The route the Space frontend draws for a path, or null when the path belongs to the React app (Canvas, Study). */
export function routeFromPath(pathname) {
  let p = String(pathname || '/').replace(/\/+$/, '') || '/';
  if (BASE) {
    if (p !== BASE && !p.startsWith(BASE + '/')) return null;
    p = p.slice(BASE.length) || '/';
  }
  const page = p.match(/^\/p\/(?:[^/]*-)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  if (page) return page[1].toLowerCase();
  if (p === '/home') return 'home';
  if (p === '/ai') return 'ai';
  if (p === '/tasks') return 'tasks';
  if (p === '/templates' || p.startsWith('/templates/')) return 'marketplace' + p.slice('/templates'.length);
  // Only the Library's own tabs; /library/source/<id> and /library/classic are the React reader's pages.
  const lib = p.match(/^\/library(?:\/(recents|favorites|shared|private|meetings))?$/);
  if (lib) return lib[1] ? 'library/' + lib[1] : 'library';
  return null;
}

export function pathFor(r) {
  if (isUuid(r)) return BASE + '/p/' + r;
  if (r === 'ai' || r === 'tasks') return BASE + '/' + r;
  if (typeof r === 'string' && r.startsWith('marketplace')) return BASE + '/templates' + r.slice('marketplace'.length);
  if (typeof r === 'string' && r.startsWith('library')) return BASE + '/library' + r.slice('library'.length);
  return BASE + '/home';
}

export const isSpacePath = (pathname) => routeFromPath(pathname) !== null;
/** What route() answers while the React app owns the main column. No page has this id. */
export const APP_ROUTE = '@app';
const routeFromLocation = () => (typeof location === 'undefined' ? APP_ROUTE : routeFromPath(location.pathname) ?? APP_ROUTE);
// The route the frontend last settled on, which is what gets drawn. Next.js replays the addresses it has seen after its
// own commits, so for a moment after two quick navigations the address bar can read the earlier one; drawing from it
// left a blank page with nothing to redraw it. A real change of address still arrives through routeChanged.
export const route = () => (space.lastRoute != null ? space.lastRoute : routeFromLocation());

// ------------------------------------------------------------------------------------------------ state

export function emptyState() {
  return {
    workspace: '',
    pages: {},
    blocks: {},
    collections: {},
    views: {},
    rows: {},
    sidebar: {
      open: { meetings: true, recents: true, favorites: true, private: true, workspace: true, shared: true, apps: true },
      expanded: {},
      hidden: { agents: true },
      tab: 'home',
      collapsed: false,
      private: [],
      workspace: [],
      shared: [],
      meetings: [],
      upcoming: [],
      notes: [],
      chats: [],
      agents: [],
    },
    recents: [],
    trash: [],
    aiChats: {},
    aiOpen: null,
    aiSide: { open: false, chat: null },
    meetingPages: {},
    contrastPref: 'auto',
    emojiFrecency: {},
    recentEmoji: [],
    recentIcons: [],
  };
}

// One person's view of the app, saved to ws_user_settings rather than to any page.
const UI_KEYS = ['contrastPref', 'emojiFrecency', 'recentEmoji', 'recentIcons', 'skinTone', 'iconColor', 'iconAsk', 'lastColor'];
const SIDEBAR_KEYS = ['open', 'expanded', 'hidden', 'order', 'show', 'tab', 'collapsed', 'private'];

function toError(error) {
  const e = new Error((error && error.message) || 'Request failed');
  e.code = error && error.code;
  // A refusal from Postgres (not a member, bad input) fails the same way next time; a dropped connection does not.
  e.retryable = !(e.code && /^(42501|22023|28000|54000|P0001|P0002|42883|PGRST)/.test(String(e.code)));
  return e;
}

const hm = (t) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || '');
  return m ? [Number(m[1]), Number(m[2])] : null;
};
const clock = ([h, m], meridiem) => `${((h + 11) % 12) + 1}${m ? ':' + String(m).padStart(2, '0') : ''}${meridiem ? ' ' + (h < 12 ? 'AM' : 'PM') : ''}`;
function eventTime(e) {
  if (e.all_day) return 'All day';
  const a = hm(e.time);
  const b = hm(e.end_time);
  if (!a) return '';
  if (!b) return clock(a, true);
  return `${clock(a, a[0] < 12 !== b[0] < 12)} – ${clock(b, true)}`;
}
const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function initialsAvatar(name) {
  const letter = (String(name || '?').trim()[0] || '?').toUpperCase().replace(/[<&>"]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#E6E3DE"/><text x="20" y="26.5" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif" font-size="18" font-weight="500" fill="#5F5E5B">${letter}</text></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

// ------------------------------------------------------------------------------------------------ the runtime

class Space {
  constructor() {
    this.state = emptyState();
    this.ready = false;
    this.error = null;
    this.status = 'saved';
    this.root = null;
    this.host = null;
    this.sb = null;
    this.client = typeof crypto !== 'undefined' ? uid() : 'server';
    this.me = { id: null, name: '', firstName: '', email: '', avatar: null };
    this.info = { id: null, name: '', role: 'none', members: 0, spaces: [] };
    this.people = new Map();
    this.teams = [];
    this.loaded = new Set();
    this.loading = new Map();
    this.missing = new Map();
    this.roles = new Map();
    this.children = new Map();
    this.childrenLoaded = new Set();
    this.channels = new Map();
    this.pageTopics = [];
    this.favorites = new Map();
    this.savedSettings = '';
    this.settingsTimer = 0;
    this.welcomed = false;
    this.listeners = new Set();
    this.routeListeners = new Set();
    this.themeListeners = new Set();
    this.lastRoute = null;
    this.emitQueued = false;
    this.cleanups = [];
    this.signed = new Map();
    this.signing = new Set();
    this.sidebarObserver = null;
    this.switching = null;
    this.switchTried = new Set();
    this.sharedListeners = new Set();
    this.inbox = { items: [], unread: 0, loaded: false };
    this.presence = new Map();
    this.libraryImport = null;
    this.importJob = null;
    this.importListeners = new Set();
    this.sync = this.makeSync();
  }

  /** The sync engine for one workspace. Switching workspaces starts a new one that remembers nothing. */
  makeSync() {
    return new SpaceSync({
      transport: { apply: (spaceId, ops, client) => this.rpcApply(spaceId, ops, client) },
      state: () => this.state,
      changed: () => this.emit(),
      client: this.client,
      space: () => this.info.id,
      personName: (id) => this.personName(id),
      onDenied: () => this.host && this.host.toast && this.host.toast("You can't edit that page, so the change was undone."),
      onStatus: (s) => {
        this.status = s;
        this.emit();
      },
      onFatal: (e) => {
        this.error = (e && e.message) || 'Saving stopped';
        this.emit();
      },
    });
  }

  // -------------------------------------------------------------------------------------------- lifecycle

  /** Called once by the React host with the element to draw into and the app's services. */
  start(root, host) {
    this.root = root;
    this.host = host;
    this.sb = host.supabase;
    this.applyTheme();
    const mo = new MutationObserver(() => {
      this.applyTheme();
      this.themeListeners.forEach((fn) => fn());
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const onPop = () => this.routeChanged();
    window.addEventListener('popstate', onPop);
    const onHide = () => {
      if (document.visibilityState === 'hidden') void this.sync.flush();
    };
    document.addEventListener('visibilitychange', onHide);
    this.cleanups.push(() => mo.disconnect(), () => window.removeEventListener('popstate', onPop), () => document.removeEventListener('visibilitychange', onHide));
    void this.boot();
  }

  stop() {
    this.cleanups.splice(0).forEach((fn) => fn());
    for (const topic of [...this.channels.keys()]) this.leave(topic);
    void this.sync.flush();
  }

  async boot() {
    try {
      const { data: auth } = await this.sb.auth.getSession();
      const token = auth && auth.session && auth.session.access_token;
      if (token && this.sb.realtime && this.sb.realtime.setAuth) this.sb.realtime.setAuth(token);
      const { data, error } = await this.sb.rpc('ws_bootstrap', { p_space: null });
      if (error) throw error;
      this.applyBootstrap(data);
    } catch (err) {
      this.error = (err && err.message) || String(err);
      this.emit();
    }
  }

  applyBootstrap(b) {
    const S = this.state;
    const name = (b.user && b.user.name) || '';
    this.me = { id: b.user.id, email: b.user.email || '', name, firstName: name.split(' ')[0] || name, avatar: b.user.avatar || null };
    this.info = { id: b.space.id, name: b.space.name, role: b.space.role, icon: b.space.icon, members: (b.people || []).length, spaces: b.spaces || [] };
    this.people = new Map((b.people || []).map((p) => [p.id, p]));
    this.teams = b.teams || [];
    S.workspace = b.space.name;

    const settings = b.settings || {};
    const ui = settings.ui || {};
    for (const k of UI_KEYS) if (k in ui) S[k] = ui[k];
    const side = settings.sidebar || {};
    for (const k of SIDEBAR_KEYS) if (k in side && k !== 'private') S.sidebar[k] = side[k];
    this.welcomed = !!settings.welcomed;
    this.libraryImport = settings.libraryImport && typeof settings.libraryImport === 'object' ? settings.libraryImport : null;

    const byId = new Map();
    for (const r of [...(b.roots || []), ...(b.shared || []), ...(b.favorites || []), ...(b.recents || [])]) if (!byId.has(r.id)) byId.set(r.id, r);
    this.sync.ingest([...byId.values()]);
    for (const r of byId.values()) if (r.parent_id) this.addChild(r.parent_id, r.id);

    const mine = (b.roots || []).filter((r) => r.owner_id === this.me.id).map((r) => r.id);
    const saved = Array.isArray(side.private) ? side.private.filter((id) => mine.includes(id)) : [];
    S.sidebar.private = [...mine.filter((id) => !saved.includes(id)), ...saved];
    S.sidebar.workspace = (b.roots || []).filter((r) => !r.owner_id && !r.team_id).map((r) => r.id);
    S.sidebar.shared = (b.shared || []).map((r) => r.id);
    (b.favorites || []).forEach((r, i) => {
      const p = S.pages[r.id];
      if (p) {
        p.favorite = true;
        p.favoritedAt = i;
      }
      this.favorites.set(r.id, true);
    });
    S.recents = (b.recents || []).map((r) => r.id);
    this.savedSettings = JSON.stringify(this.settingsSnapshot());

    this.join('ws:user:' + this.me.id);
    void this.loadInbox();
    if (this.info.role !== 'guest') this.join('ws:space:' + this.info.id);
    this.ready = true;
    void this.loadCalendar();
    if (!mine.length && !S.sidebar.workspace.length && !S.sidebar.shared.length && !this.welcomed) this.createWelcome();
    if (this.info.role === 'owner') void this.importLibrary();
    this.routeChanged(true);
    this.emit();
  }

  // -------------------------------------------------------------------------------------------- change fan-out

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    if (this.emitQueued) return;
    this.emitQueued = true;
    queueMicrotask(() => {
      this.emitQueued = false;
      this.listeners.forEach((fn) => fn());
    });
  }

  /** main.js calls this from persist(): a save soon, settings a little later, favourites now. */
  schedule() {
    this.sync.schedule();
    this.scheduleSettings();
    this.flushFavorites();
  }

  // -------------------------------------------------------------------------------------------- navigation

  onRoute(fn) {
    this.routeListeners.add(fn);
    return () => this.routeListeners.delete(fn);
  }

  /** The address bar changed (a click here, the back button, or the React app navigating). */
  routeChanged(force = false) {
    const r = routeFromLocation();
    if (!force && r === this.lastRoute) return;
    const prev = this.lastRoute;
    this.lastRoute = r;
    if (r === 'home') {
      this.goHome();
      return;
    }
    if (isUuid(r)) {
      void this.ensurePage(r);
      this.watchPage(r);
      if (this.ready) void this.sb.rpc('ws_visit', { p_page: r }).then(() => {}, () => {});
    }
    this.routeListeners.forEach((fn) => fn(r, prev));
    this.emit();
  }

  go(r, opts = {}) {
    const path = pathFor(r);
    if (location.pathname === path) {
      this.routeChanged();
      return;
    }
    if (isSpacePath(location.pathname) && isSpacePath(path)) {
      history[opts.replace ? 'replaceState' : 'pushState'](null, '', path);
      this.routeChanged();
    } else if (this.host) {
      this.host.navigate(path, opts);
    }
  }

  /** Canvas, Study and Calendar are the React app's; the sidebar stays and the main column changes hands. */
  openApp(path) {
    if (this.host) this.host.navigate(path);
  }

  // -------------------------------------------------------------------------------------------- the old Library

  /** This person's Library notes as the Library lists them: live notes, most recently changed first. */
  async fetchLibraryNotes() {
    const notes = [];
    for (let from = 0; ; from += 500) {
      const { data, error } = await this.sb
        .from('readable_library_documents')
        .select('id,title,content')
        .eq('user_id', this.me.id)
        .eq('deleted', false)
        .eq('kind', 'note')
        .order('updated_at', { ascending: false })
        .order('id')
        .range(from, from + 499);
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      for (const r of rows) notes.push({ id: String(r.id), title: typeof r.title === 'string' ? r.title : '', content: typeof r.content === 'string' ? r.content : '' });
      if (rows.length < 500) return notes;
    }
  }

  /**
   * Brings the old Library's notes into this person's own workspace (docs/space/PLAN.md, M10; the owner: the new library
   * "should supersede" the old one). It runs on each load until settings say it finished. Every record's id comes from
   * the note (importIds), so a run cut short by a closed tab, or two tabs at once, never makes anything twice: what an
   * earlier run saved is loaded and kept as it is, and only what is missing is added. The Library's notes are not touched.
   */
  importLibrary() {
    if (this.importJob) return this.importJob;
    if (!this.ready || !this.sb || !this.me.id || this.info.role !== 'owner' || (this.libraryImport && this.libraryImport.done)) return Promise.resolve();
    const spaceId = this.info.id;
    const sync = this.sync;
    const here = () => this.info.id === spaceId && this.sync === sync;
    this.importJob = (async () => {
      try {
        const notes = await this.fetchLibraryNotes();
        const { importIds, placeLibraryImport, planLibraryImport } = await import('../../lib/space/library-import');
        if (!here()) return;
        const plan = planLibraryImport(notes, new Set(), importIds(spaceId, this.me.id), NOW());
        if (!plan) {
          await this.saveLibraryImport({ done: true, count: 0, at: new Date().toISOString() });
          return;
        }
        const holder = plan.parent.id;
        await this.ensurePage(holder, true);
        if (this.sync.known(holder)) {
          const saved = plan.pages.map((p) => p.id).filter((id) => this.sync.known(id));
          for (let i = 0; i < saved.length; i += 8) await Promise.all(saved.slice(i, i + 8).map((id) => this.ensurePage(id, true)));
          // A page that would not load cannot say which of its blocks are missing: try again on the next load.
          if (![holder, ...saved].every((id) => this.loaded.has(id))) return;
        } else if (this.missing.get(holder) === 'not_found') {
          this.missing.delete(holder);
        } else {
          return;
        }
        if (!here()) return;
        const placed = placeLibraryImport(this.state, plan);
        for (const id of placed.pages) this.addChild(holder, id);
        if (placed.holder && !this.state.sidebar.private.includes(holder)) this.state.sidebar.private.unshift(holder);
        this.emit();
        // Offline, or the workspace changed: the next load finds whatever arrived and adds the rest.
        if (!(await sync.saved()) || !here()) return;
        await this.saveLibraryImport({ parent: holder, count: plan.count, at: new Date().toISOString(), done: true });
        if (placed.records) this.importListeners.forEach((fn) => fn({ parentId: holder, count: plan.count }));
      } catch (err) {
        console.warn('Space: could not bring in the Library', err);
      } finally {
        this.importJob = null;
        this.emit();
      }
    })();
    return this.importJob;
  }

  async saveLibraryImport(value) {
    const { error } = await this.sb.rpc('ws_save_settings', { p_patch: { libraryImport: value } });
    if (error) throw error;
    this.libraryImport = value;
  }

  /** Called once the Library's notes are pages, with the page that holds them and how many there were. */
  onImported(fn) {
    this.importListeners.add(fn);
    return () => this.importListeners.delete(fn);
  }

  // -------------------------------------------------------------------------------------------- inbox and presence

  /** This person's notifications (ws_inbox), newest first, with how many are unread. */
  async loadInbox() {
    if (!this.sb) return;
    const { data, error } = await this.sb.rpc('ws_inbox', { p_limit: 50 });
    if (error || !data) return;
    this.inbox = { items: Array.isArray(data.items) ? data.items : [], unread: Number(data.unread) || 0, loaded: true };
    this.emit();
  }

  /** A notification ws_notify broadcast on this person's channel. */
  onNotify(payload) {
    const n = payload && payload.notification;
    if (!n || !n.id || this.inbox.items.some((x) => x.id === n.id)) return;
    this.inbox = { ...this.inbox, items: [n, ...this.inbox.items], unread: this.inbox.unread + (n.read ? 0 : 1) };
    this.emit();
  }

  /** Marks notifications read, every one when ids is null: on screen at once, then on the server. */
  async markRead(ids) {
    const all = !ids;
    const items = this.inbox.items.map((n) => (all || ids.includes(n.id) ? { ...n, read: true } : n));
    const gone = this.inbox.items.filter((n) => !n.read && (all || ids.includes(n.id))).length;
    this.inbox = { ...this.inbox, items, unread: all ? 0 : Math.max(0, this.inbox.unread - gone) };
    this.emit();
    if (!this.sb) return;
    const { data, error } = await this.sb.rpc('ws_mark_read', { p_ids: all ? null : ids });
    if (!error && typeof data === 'number') {
      this.inbox = { ...this.inbox, unread: data };
      this.emit();
    }
  }

  onPresence(pageId, ch) {
    const people = new Map();
    for (const metas of Object.values(ch.presenceState() || {})) {
      for (const m of metas || []) if (m && m.id && m.id !== this.me.id) people.set(m.id, { id: m.id, name: m.name || '', avatar: m.avatar || null });
    }
    this.presence.set(pageId, [...people.values()]);
    this.emit();
  }

  /** The other people looking at a page right now. */
  presentOn(pageId) {
    return this.presence.get(pageId) || [];
  }

  // -------------------------------------------------------------------------------------------- sharing

  /** Whether this person can change a page: what its last load said, or yes for a page made here and not loaded yet. */
  canEdit(id) {
    const role = this.roles.get(id);
    return !role || role === 'edit' || role === 'full';
  }

  roleOf(id) {
    return this.roles.get(id) || 'full';
  }

  /** Who can open a page and how (ws_page_access), for the Share menu. */
  async pageAccess(id) {
    const { data, error } = await this.sb.rpc('ws_page_access', { p_page: id });
    if (error) throw new Error(error.message || 'Could not load who has access.');
    return data;
  }

  /** Shares a page by email. The host sends it through the invite route, which also emails each person. */
  async invite(pageId, emails, role) {
    if (!this.host || !this.host.invite) throw new Error('Sharing is not available here.');
    await this.sync.flush().catch(() => {});
    return this.host.invite({ page: pageId, emails, role });
  }

  /** Changes what one person ({ user }) or pending invite ({ email }) can do on a page, or removes them when role is null. */
  async setAccess(pageId, target, role) {
    const { data, error } = await this.sb.rpc('ws_set_access', {
      p_page: pageId,
      p_user: target.user || null,
      p_email: target.email || null,
      p_role: role || null,
    });
    if (error) throw new Error(error.message || 'Could not change access.');
    return data;
  }

  /** Called with a page's summary each time a page is shared with this person. */
  onShared(fn) {
    this.sharedListeners.add(fn);
    return () => this.sharedListeners.delete(fn);
  }

  /** Access to a page was taken away: it leaves the sidebar, and the person leaves the page if it is open. */
  revoke(id) {
    const S = this.state;
    for (const list of [S.sidebar.private, S.sidebar.workspace, S.sidebar.shared, S.recents]) {
      const i = list.indexOf(id);
      if (i >= 0) list.splice(i, 1);
    }
    this.sync.receive({ items: [{ id, kind: 'page', destroyed: true }] });
    this.loaded.delete(id);
    this.missing.set(id, 'no_access');
    this.leave('ws:page:' + id);
    if (route() === id) this.go('home', { replace: true });
    this.emit();
  }

  /**
   * Opens another workspace this person belongs to, their own or one they are a guest of. Everything held for the
   * current workspace is dropped first, so no write meant for one can land in the other.
   */
  async switchSpace(id, opts = {}) {
    if (!id || id === this.info.id || this.switching || !this.sb) return;
    this.switching = id;
    try {
      await this.sync.flush().catch(() => {});
      this.resetState();
      this.info = { ...this.info, id };
      if (!opts.keepRoute) this.go('home', { replace: true });
      this.emit();
      await this.sb.rpc('ws_save_settings', { p_patch: { current_space: id } });
      const { data, error } = await this.sb.rpc('ws_bootstrap', { p_space: id });
      if (error) throw error;
      this.applyBootstrap(data);
    } catch (err) {
      this.error = (err && err.message) || String(err);
      this.emit();
    } finally {
      this.switching = null;
    }
  }

  /**
   * Forgets every loaded page, record and subscription, the way a fresh tab starts. The old engine is retired, so a retry
   * it scheduled cannot write into the next workspace.
   */
  resetState() {
    for (const topic of [...this.channels.keys()]) this.leave(topic);
    this.pageTopics = [];
    this.loaded.clear();
    this.childrenLoaded.clear();
    for (const map of [this.loading, this.missing, this.roles, this.children, this.favorites, this.people, this.presence]) map.clear();
    const fresh = emptyState();
    for (const key of Object.keys(this.state)) delete this.state[key];
    Object.assign(this.state, fresh);
    this.sync.dispose();
    this.sync = this.makeSync();
    this.ready = false;
  }

  goHome() {
    if (!this.ready) return;
    const S = this.state;
    const id = [...S.recents, ...S.sidebar.private, ...S.sidebar.workspace, ...S.sidebar.shared].find((x) => S.pages[x] && !S.pages[x].trashed);
    if (id) this.go(id, { replace: true });
  }

  pageUrl(id) {
    return location.origin + pathFor(id);
  }

  // -------------------------------------------------------------------------------------------- loading

  pageStatus(id) {
    if (this.missing.has(id)) return this.missing.get(id);
    if (this.loaded.has(id)) return 'ready';
    return 'loading';
  }

  ensurePage(id, force = false) {
    if (!isUuid(id) || !this.sb) return Promise.resolve();
    if (!force && this.loaded.has(id)) return Promise.resolve();
    if (this.loading.has(id)) return this.loading.get(id);
    if (!force && this.sync.known(id) === false && this.state.pages[id] && !this.ready) return Promise.resolve();
    const job = (async () => {
      const { data, error } = await this.sb.rpc('ws_load_page', { p_page: id });
      if (error) throw error;
      if (data && data.error) {
        // A page made in this browser that the server has not stored yet is not missing, just early.
        if (data.error === 'not_found' && this.state.pages[id] && !this.sync.known(id)) {
          this.loaded.add(id);
          return;
        }
        this.missing.set(id, data.error);
        return;
      }
      if (data.space_id && this.info.id && data.space_id !== this.info.id) {
        // A page shared from another workspace opens inside that workspace, where its writes belong. Once per page and
        // workspace, so a page this person cannot join there cannot send them back and forth.
        const key = id + ':' + data.space_id;
        if (!this.switchTried.has(key)) {
          this.switchTried.add(key);
          void this.switchSpace(data.space_id, { keepRoute: true });
          return;
        }
      }
      this.missing.delete(id);
      const records = [data.page, ...(data.records || [])];
      if (data.row && data.row.row) records.push(data.row.row);
      if (data.row && data.row.collection) records.push(data.row.collection);
      this.sync.ingest([...(data.children || []), ...(data.ancestors || []), ...records]);
      for (const c of data.children || []) this.addChild(id, c.id);
      this.roles.set(id, data.role);
      this.loaded.add(id);
    })()
      .catch((err) => {
        this.missing.set(id, 'error');
        console.warn('Space: could not load page', id, err);
      })
      .finally(() => {
        this.loading.delete(id);
        this.emit();
      });
    this.loading.set(id, job);
    return job;
  }

  addChild(parent, child) {
    if (!parent) return;
    const set = this.children.get(parent) || new Set();
    set.add(child);
    this.children.set(parent, set);
  }

  async ensureChildren(pid) {
    if (!isUuid(pid) || this.childrenLoaded.has(pid) || !this.sb) return;
    this.childrenLoaded.add(pid);
    const { data, error } = await this.sb.rpc('ws_load_children', { p_pages: [pid] });
    if (error) {
      this.childrenLoaded.delete(pid);
      return;
    }
    this.sync.ingest([...(data.pages || []), ...(data.links || [])]);
    for (const p of data.pages || []) this.addChild(p.parent_id, p.id);
    this.emit();
  }

  /** The pages inside a page, in the page's own order once its body is loaded, otherwise as the sidebar knows them. */
  childPages(pid) {
    const S = this.state;
    const p = S.pages[pid];
    const alive = (id) => S.pages[id] && !S.pages[id].trashed;
    if (p && this.loaded.has(pid) && Array.isArray(p.content)) {
      return p.content.map((x) => S.blocks[x]).filter((b) => b && b.type === 'page' && alive(b.pageId)).map((b) => b.pageId);
    }
    return [...(this.children.get(pid) || [])].filter((id) => alive(id) && S.pages[id].parent === pid);
  }

  async loadTrash() {
    if (!this.ready) return;
    const { data, error } = await this.sb.rpc('ws_trash', { p_space: this.info.id });
    if (error || !Array.isArray(data)) return;
    this.sync.ingest(data);
    this.state.trash = data.map((r) => r.id);
    this.emit();
  }

  async loadCalendar() {
    const now = new Date();
    const today = isoLocal(now);
    const end = isoLocal(new Date(now.getTime() + 7 * 864e5));
    const { data, error } = await this.sb
      .from('calendar_events')
      .select('id,title,date,time,end_time,all_day,status')
      .gte('date', today)
      .lte('date', end)
      .order('date', { ascending: true })
      .order('time', { ascending: true })
      .limit(60);
    if (error || !Array.isArray(data)) return;
    const live = data.filter((e) => e.status !== 'cancelled');
    const day = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const S = this.state;
    S.sidebar.meetings = live.filter((e) => e.date === today).slice(0, 8).map((e) => ({ id: e.id, title: e.title || 'Untitled event', time: eventTime(e), color: '#5e9fe8' }));
    S.sidebar.upcoming = live.slice(0, 12).map((e) => ({ id: e.id, title: e.title || 'Untitled event', time: e.date === today ? eventTime(e) : `${day(e.date)} ${eventTime(e)}`, color: '#5e9fe8' }));
    this.emit();
  }

  // -------------------------------------------------------------------------------------------- saving

  async rpcApply(spaceId, ops, client) {
    const { data, error } = await this.sb.rpc('ws_apply', { p_space: spaceId, p_ops: ops, p_client: client });
    if (error) throw toError(error);
    return data;
  }

  settingsSnapshot() {
    const S = this.state;
    const ui = {};
    const sidebar = {};
    for (const k of UI_KEYS) if (S[k] !== undefined) ui[k] = S[k];
    for (const k of SIDEBAR_KEYS) if (S.sidebar[k] !== undefined) sidebar[k] = S.sidebar[k];
    return this.welcomed ? { ui, sidebar, welcomed: true } : { ui, sidebar };
  }

  scheduleSettings() {
    clearTimeout(this.settingsTimer);
    this.settingsTimer = setTimeout(() => {
      if (!this.ready) return;
      const snap = this.settingsSnapshot();
      const json = JSON.stringify(snap);
      if (json === this.savedSettings) return;
      this.savedSettings = json;
      this.sb.rpc('ws_save_settings', { p_patch: snap }).then(({ error }) => {
        if (error) this.savedSettings = '';
      });
    }, 800);
  }

  flushFavorites() {
    if (!this.ready) return;
    for (const p of Object.values(this.state.pages)) {
      if (!p || !isUuid(p.id)) continue;
      const on = !!p.favorite;
      const was = !!this.favorites.get(p.id);
      if (on === was || !this.sync.known(p.id)) continue;
      this.favorites.set(p.id, on);
      this.sb.rpc('ws_set_favorite', { p_page: p.id, p_on: on, p_position: null }).then(({ error }) => {
        if (error) this.favorites.set(p.id, was);
      });
    }
  }

  // -------------------------------------------------------------------------------------------- live

  join(topic) {
    if (!this.sb || this.channels.has(topic)) return;
    const onPage = topic.startsWith('ws:page:');
    // On a page channel every open copy says who is looking (presence). Everything else on a channel comes from
    // ws_apply, ws_grant_user or ws_notify.
    const config = onPage && this.me.id ? { private: true, presence: { key: this.me.id } } : { private: true };
    const ch = this.sb.channel(topic, { config });
    ch.on('broadcast', { event: 'tx' }, (msg) => this.onTx(msg.payload));
    ch.on('broadcast', { event: 'tree' }, (msg) => this.onTree(msg.payload));
    ch.on('broadcast', { event: 'notify' }, (msg) => this.onNotify(msg.payload));
    if (onPage && ch.presenceState) ch.on('presence', { event: 'sync' }, () => this.onPresence(topic.slice(8), ch));
    let joined = false;
    ch.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      // Back after a drop: anything broadcast while away was missed, so read the page again.
      if (joined) this.resync(topic);
      joined = true;
      if (onPage && ch.track && this.me.id) void Promise.resolve(ch.track({ id: this.me.id, name: this.me.name, avatar: this.me.avatar })).catch(() => {});
    });
    this.channels.set(topic, ch);
  }

  leave(topic) {
    const ch = this.channels.get(topic);
    if (!ch) return;
    this.channels.delete(topic);
    if (topic.startsWith('ws:page:')) this.presence.delete(topic.slice(8));
    void this.sb.removeChannel(ch);
  }

  watchPage(id) {
    const topic = 'ws:page:' + id;
    this.join(topic);
    this.pageTopics = [topic, ...this.pageTopics.filter((t) => t !== topic)];
    for (const t of this.pageTopics.slice(6)) this.leave(t);
    this.pageTopics = this.pageTopics.slice(0, 6);
  }

  resync(topic) {
    const [, kind, id] = topic.split(':');
    if (kind === 'page') void this.ensurePage(id, true);
  }

  onTx(payload) {
    if (!payload) return;
    if (this.sync.receive(payload) === 'refetch' && payload.page) void this.ensurePage(payload.page, true);
    this.syncSidebar(payload.records || []);
  }

  onTree(payload) {
    if (!payload) return;
    const items = (payload.items || []).filter(Boolean);
    for (const it of items) if (it.revoked) this.revoke(it.id);
    const rest = items.filter((it) => !it.revoked);
    // A grant names the page's workspace (ws_grant_user). A page in another workspace is offered, never mixed in here.
    if (payload.space && payload.space !== this.info.id) {
      for (const it of rest) if (it.kind === 'page') this.sharedListeners.forEach((fn) => fn(it));
      return;
    }
    this.sync.receive({ client: payload.client, items: rest });
    this.syncSidebar(rest);
    if (!payload.space) return;
    for (const it of rest) {
      if (it.kind !== 'page' || !it.owner_id || it.owner_id === this.me.id || this.state.sidebar.shared.includes(it.id)) continue;
      this.state.sidebar.shared.unshift(it.id);
      this.sharedListeners.forEach((fn) => fn(it));
    }
    this.emit();
  }

  /** Keeps the sidebar's section lists in step with pages made, moved or deleted in another browser. */
  syncSidebar(items) {
    const S = this.state;
    let touched = false;
    const drop = (list, id) => {
      const i = list.indexOf(id);
      if (i >= 0) {
        list.splice(i, 1);
        touched = true;
      }
    };
    const add = (list, id) => {
      if (!list.includes(id)) {
        list.unshift(id);
        touched = true;
      }
    };
    for (const it of items) {
      if (!it || it.kind !== 'page') continue;
      if (it.destroyed) {
        [S.sidebar.private, S.sidebar.workspace, S.sidebar.shared, S.recents].forEach((l) => drop(l, it.id));
        continue;
      }
      if (it.parent_id) {
        this.addChild(it.parent_id, it.id);
        drop(S.sidebar.private, it.id);
        drop(S.sidebar.workspace, it.id);
        continue;
      }
      if (!('owner_id' in it)) continue;
      if (it.owner_id === this.me.id) {
        add(S.sidebar.private, it.id);
        drop(S.sidebar.workspace, it.id);
      } else if (!it.owner_id && !it.team_id) {
        add(S.sidebar.workspace, it.id);
        drop(S.sidebar.private, it.id);
      } else {
        drop(S.sidebar.private, it.id);
        drop(S.sidebar.workspace, it.id);
      }
    }
    if (touched) this.emit();
  }

  // -------------------------------------------------------------------------------------------- people and look

  personName(id) {
    if (!id) return '';
    if (id === this.me.id) return this.me.name;
    const p = this.people.get(id);
    return p ? p.name : 'Someone';
  }

  avatar(id) {
    const p = !id || id === this.me.id ? this.me : this.people.get(id);
    return (p && p.avatar) || initialsAvatar(p ? p.name : '?');
  }

  editedBy(id) {
    const meta = this.sync.metaOf(id);
    return this.personName((meta && meta.edited_by) || this.me.id);
  }

  isDark() {
    return typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';
  }

  onTheme(fn) {
    this.themeListeners.add(fn);
  }

  applyTheme() {
    if (!this.root) return;
    const dark = this.isDark();
    this.root.classList.toggle('nsp-dark-theme', dark);
    this.root.classList.toggle('nsp-light-theme', !dark);
    this.root.setAttribute('data-contrast', this.state.contrastPref || 'auto');
  }

  setTheme(pref) {
    if (this.host && this.host.setTheme) this.host.setTheme(pref);
  }

  // -------------------------------------------------------------------------------------------- files

  /** Uploads go to the private ws-files bucket under their page; props keep `ws-file:<path>`, never the bytes. */
  async upload(file, pageId) {
    // The storage policy asks the page's role, so the page has to be on the server before its file is.
    await this.sync.flush();
    const safe = String((file && file.name) || 'file').replace(/[^\w.-]+/g, '_').slice(-80);
    const path = `${this.info.id}/${pageId}/${uid()}-${safe}`;
    const { error } = await this.sb.storage.from('ws-files').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
    if (error) throw error;
    return 'ws-file:' + path;
  }

  /** A drawable URL for a stored file: signed for twelve hours, re-signed an hour before it lapses. */
  fileUrl(ref) {
    if (typeof ref !== 'string' || !ref.startsWith('ws-file:')) return ref;
    const path = ref.slice('ws-file:'.length);
    const hit = this.signed.get(path);
    if (hit && hit.until > Date.now()) return hit.url;
    if (this.sb && !this.signing.has(path)) {
      this.signing.add(path);
      this.sb.storage
        .from('ws-files')
        .createSignedUrl(path, 12 * 3600)
        .then(({ data, error }) => {
          this.signing.delete(path);
          if (error || !data || !data.signedUrl) return;
          this.signed.set(path, { url: data.signedUrl, until: Date.now() + 11 * 3600 * 1000 });
          this.emit();
        });
    }
    return hit ? hit.url : '';
  }

  // -------------------------------------------------------------------------------------------- layout

  /** The React app's column starts where the sidebar ends, so the sidebar publishes its width as it changes. */
  observeSidebar(el) {
    if (this.sidebarObserver) this.sidebarObserver.disconnect();
    this.sidebarObserver = null;
    if (!el) return;
    const publish = () => document.documentElement.style.setProperty('--nsp-sidebar-w', Math.round(el.getBoundingClientRect().width) + 'px');
    this.sidebarObserver = new ResizeObserver(publish);
    this.sidebarObserver.observe(el);
    publish();
  }

  /** Which sidebar section holds a page, for the label beside its breadcrumbs. */
  sectionLabel(page) {
    if (!page) return 'Private';
    if (this.state.sidebar.shared.includes(page.id)) return 'Shared';
    let root = page;
    const seen = new Set();
    while (root && root.parent && !seen.has(root.id)) {
      seen.add(root.id);
      root = this.state.pages[root.parent] || null;
    }
    const meta = root ? this.sync.metaOf(root.id) : null;
    const section = (root && root.section) || (meta ? (meta.owner_id ? 'private' : meta.team_id ? 'team' : 'workspace') : 'private');
    if (section === 'workspace') return this.info.name || 'Workspace';
    if (section === 'team') return 'Teamspace';
    return 'Private';
  }

  async saveName(name) {
    const next = String(name || '').trim().slice(0, 100);
    if (!next || next === this.me.name || !this.sb) return;
    this.me = { ...this.me, name: next, firstName: next.split(' ')[0] };
    const p = this.people.get(this.me.id);
    if (p) this.people.set(this.me.id, { ...p, name: next });
    this.emit();
    await this.sb.rpc('ws_save_settings', { p_patch: { name: next } });
  }

  // -------------------------------------------------------------------------------------------- first visit

  /** Someone's first page. Written like any other page, so it saves and syncs the same way. */
  createWelcome() {
    const S = this.state;
    const pid = uid();
    const content = [];
    const block = (type, text, extra = {}) => {
      const id = uid();
      S.blocks[id] = { id, type, title: text ? [[text]] : [], children: [], parent: pid, ...extra };
      content.push(id);
    };
    block('text', 'This is your workspace. What you write here saves as you type, and it is there on any device you sign in on.');
    block('sub_header', 'A few things to try');
    block('to_do', 'Type / on an empty line to add a heading, a list, a table or a database', { checked: false });
    block('to_do', 'Press + next to Private in the sidebar to make a new page', { checked: false });
    block('to_do', 'Open Templates in the sidebar to start a reading list or course notes', { checked: false });
    block('to_do', 'Open Canvas or Study from Apps in the sidebar', { checked: false });
    block('callout', 'Pages can hold other pages. Press + on a page in the sidebar to add one inside it.', { icon: '💡' });
    S.pages[pid] = { id: pid, kind: 'page', icon: { emoji: '👋' }, title: 'Getting started', content, parent: null, section: 'private', lastEdited: NOW() };
    S.sidebar.private.unshift(pid);
    S.sidebar.open.private = true;
    this.welcomed = true;
    this.schedule();
    if (route() === 'home') this.go(pid, { replace: true });
    return pid;
  }
}

export const space = new Space();
