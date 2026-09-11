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
export const route = () => (typeof location === 'undefined' ? APP_ROUTE : routeFromPath(location.pathname) ?? APP_ROUTE);

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
    this.sync = new SpaceSync({
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
    if (this.info.role !== 'guest') this.join('ws:space:' + this.info.id);
    this.ready = true;
    void this.loadCalendar();
    if (!mine.length && !S.sidebar.workspace.length && !S.sidebar.shared.length && !this.welcomed) this.createWelcome();
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
    const r = route();
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
    const ch = this.sb.channel(topic, { config: { private: true } });
    ch.on('broadcast', { event: 'tx' }, (msg) => this.onTx(msg.payload));
    ch.on('broadcast', { event: 'tree' }, (msg) => this.onTree(msg.payload));
    let joined = false;
    ch.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      // Back after a drop: anything broadcast while away was missed, so read the page again.
      if (joined) this.resync(topic);
      joined = true;
    });
    this.channels.set(topic, ch);
  }

  leave(topic) {
    const ch = this.channels.get(topic);
    if (!ch) return;
    this.channels.delete(topic);
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
    this.sync.receive({ client: payload.client, items: payload.items || [] });
    this.syncSidebar(payload.items || []);
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
    block('to_do', 'Open Share at the top of a page to invite a classmate to edit it with you', { checked: false });
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
