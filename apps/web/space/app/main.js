// The Space frontend: pages, blocks, databases, the sidebar, search and every menu, drawn with Preact from one state
// object. runtime.js owns loading, saving, realtime and the address bar; this file owns what is on screen.
import { h, render } from 'preact';
import { useState, useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import htm from 'htm';
import { ICONS, MASKS } from './icons.js';
import { splitEmails } from '../../lib/space/invite-request';
import { describeFilter, defaultOp, filterable, filterReady, filterRows, needsValue, operatorsFor, opLabel, searchRows, seedFromFilters } from '../../lib/space/db-filter';
import { describeSorts, groupable, groupRows, sortRowsBy, sortsOf } from '../../lib/space/db-sort';
import { calcLabel, calcsFor, calculate } from '../../lib/space/db-calc';
import { EMOJI_SECTIONS, EMOJI_KW } from './emoji.js';
import { COVER_GALLERY } from './covers.js';
import { TEMPLATES } from './templates.js';
import { space, uid, route, pathFor, isUuid, NOW, APP_ROUTE, initialsAvatar } from './runtime.js';

const html = htm.bind(h);

/* ------------------------------------------------------------------ store */
const ALL_ICONS = ICONS;
const SESSION_T0 = NOW();
const S = space.state;
const subs = new Set();
// A change announced between a render and its subscription used to be lost until the next one (a hidden tab delays
// effects by seconds), so the store counts its changes and a component that subscribes late catches up at once.
let storeVersion = 0;
let slash = null; // { id, query, sel, x, y }
const persist = () => space.schedule();
const refresh = () => { storeVersion++; subs.forEach((f) => f()); };
space.onChange(refresh);
const isDark = () => space.isDark();
const applyTheme = () => space.applyTheme();
space.onTheme(refresh);
const commit = () => { persist(); refresh(); };
function useStore() { const [, tick] = useState(0); const seen = storeVersion; useLayoutEffect(() => { const f = () => tick((x) => x + 1); subs.add(f); if (storeVersion !== seen) f(); return () => subs.delete(f); }, []); return S; }
const go = (r, opts) => space.go(r, opts);
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const propId = () => Math.random().toString(36).slice(2, 6);
// A database row opens as a page whose id comes from the row's, so two people opening one row open the same page.
const rowPageId = (rowId) => rowId.slice(0, 24) + (BigInt('0x' + rowId.slice(24)) ^ 0x5a5a5a5a5a5an).toString(16).padStart(12, '0');
const pageOfBlock = (id) => { let b = S.blocks[id]; for (let i = 0; b && i < 60; i++) { if (S.pages[b.parent]) return b.parent; b = S.blocks[b.parent]; } return route(); };
const sidebarRef = (el) => space.observeSidebar(el);
// Someone shared a page: say so, with a way straight to it. Open also switches workspace when the page lives in theirs.
space.onShared((it) => showToast({ text: `${(it.props && it.props.title) || 'A page'} was shared with you`, action: 'Open', onAction: () => go(it.id) }));
// The old Library's notes arrived as pages: say how many, with a way to them.
space.onImported(({ parentId, count }) => showToast({ text: `${count} Library ${count === 1 ? 'note is' : 'notes are'} now pages`, action: 'Open', onAction: () => go(parentId) }));

// The page you leave moves to the top of Recents.
let recentPin = null; // a page made this session stays first in Recents
space.onRoute((r, prev) => {
  if (isUuid(prev) && S.pages[prev]) S.recents = [prev, ...S.recents.filter((x) => x !== prev)];
  if (recentPin === r) { S.recents = [r, ...S.recents.filter((x) => x !== r)]; recentPin = null; }
  slash = null; mention = null; peekRow = null; dbSel.clear(); viewSettings = null; blockCmt = null;
  commit();
  const sc = document.querySelector('.nsp-frame > .nsp-scroller');
  if (sc) { sc.scrollTop = 0; sc.scrollLeft = 0; }
});

/* ------------------------------------------------------------------ not built yet */
// A feature whose server side does not exist yet stays out of sight rather than pretending: no canned AI answers, no
// invite box that sends nothing (docs/space/PLAN.md). Turn a flag on in the milestone that builds it;
// lib/space/space-ready.test.ts keeps every entry point behind its flag.
const READY = { ai: false, meetings: false, inbox: true, notifyPrefs: false, invites: true, publish: false, members: false, importExport: false, history: false, pageOps: false, automations: false, searchFilters: false, maps: false };
/* ------------------------------------------------------------------ helpers */
const svgMarkup = (n, as) => (ALL_ICONS[n] || '').replace('<svg ', `<svg class="${as || n}" `);
const Icon = ({ n, as, cls }) => html`<span class=${'nicon ' + (cls || '')} dangerouslySetInnerHTML=${{ __html: svgMarkup(n, as) }}></span>`;
const Emoji = ({ e, size, weight }) => html`<div class="emo" style=${`width:${size}px;height:${size}px;font-size:${size}px${weight ? ';font-weight:' + weight : ''}`}><span class="emo-g">${e}</span></div>`;
// Page icons are an emoji, an icon drawn in one of ten colours, or an uploaded image.
const ICON_COLORS = { gray: '#55534E', lightgray: '#A6A299', brown: '#9F6B53', yellow: '#CB912F', orange: '#D9730D', green: '#448361', blue: '#337EA9', purple: '#9065B0', pink: '#C14C8A', red: '#D44C47' };
// The icon set is large, so it loads the first time a page icon or the picker needs it.
let PAGE_ICONS = [];
let PAGE_ICON_MAP = null;
let pageIconsLoading = null;
const loadPageIcons = () => pageIconsLoading || (pageIconsLoading = import('./page-icons.js').then((m) => { PAGE_ICONS = m.PAGE_ICONS; PAGE_ICON_MAP = new Map(PAGE_ICONS); refresh(); }));
const niSvg = (name, color) => {
  if (!PAGE_ICON_MAP) { loadPageIcons(); return ''; }
  const inner = PAGE_ICON_MAP.get(name); if (!inner) return '';
  return `<svg viewBox="0 0 24 24" style="fill:none" fill="none" stroke="${ICON_COLORS[color] || ICON_COLORS.gray}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
};
const hasIcon = (p) => !!(p && p.icon && (p.icon.emoji || p.icon.name || p.icon.img));
function PageIcon({ ic, size, weight }) {
  if (ic.emoji) return html`<${Emoji} e=${ic.emoji} size=${size} weight=${weight}/>`;
  if (ic.name) return html`<div class="pi-art" style=${`width:${size}px;height:${size}px`} dangerouslySetInnerHTML=${{ __html: niSvg(ic.name, ic.color) }}></div>`;
  return html`<img class="pi-img" src=${space.fileUrl(ic.img)} alt="" style=${`width:${size}px;height:${size}px`}/>`;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const COLOR_KEY = { gray: 'gra', brown: 'bro', orange: 'ora', yellow: 'yel', green: 'gre', blue: 'blu', purple: 'pur', pink: 'pin', red: 'red' };
function colorStyle(c, inline) {
  if (!c) return '';
  if (c.endsWith('_background')) { const k = COLOR_KEY[c.slice(0, -11)]; return k ? (inline ? `background:var(--ca-${k}BacSecTra)` : `background:var(--c-${k}BacSec)`) : ''; }
  const k = COLOR_KEY[c];
  return k ? `color:var(--c-${k}TexSec);fill:var(--c-${k}TexSec)` : '';
}
const plain = (segs) => (segs || []).map((s) => s[0]).join('');
// A page as plain text for the clipboard: one line per block, children indented, list and to-do markers kept.
const pageText = (page) => {
  const out = [];
  const mark = (b) => (b.type === 'to_do' ? (b.checked ? '[x] ' : '[ ] ') : b.type === 'bulleted_list' ? '- ' : b.type === 'numbered_list' ? '1. ' : b.type === 'header' ? '# ' : b.type === 'sub_header' ? '## ' : b.type === 'sub_sub_header' ? '### ' : '');
  const walk = (ids, depth) => (ids || []).forEach((id) => { const b = S.blocks[id]; if (!b) return; const t = b.type === 'page' ? pageTitleText(S.pages[b.pageId] || {}) : plain(b.title); if (t || mark(b)) out.push('  '.repeat(depth) + mark(b) + t); walk(b.children, depth + 1); });
  walk(page.content, 0);
  return [pageTitleText(page), '', ...out].join('\n');
};
const CODE_STYLE = 'font-family:&quot;SFMono-Regular&quot;, Menlo, Consolas, &quot;PT Mono&quot;, &quot;Liberation Mono&quot;, Courier, monospace;line-height:normal;background:var(--ca-bacIntTra);color:var(--c-redTexSec)';
// While a block's comment composer is open its text runs wear the yellow comment mark, one span per run.
function richToHtml(segs, hl) { return hl ? (segs || []).map((sg) => '<span class="' + (hl === 'posted' ? 'cmt-hl posted' : 'cmt-hl') + '">' + richToHtml0([sg]) + '</span>').join('') : richToHtml0(segs); }
function richToHtml0(segs) {
  return (segs || []).map(([t, d]) => {
    const mn = d && d.find((x) => x[0] === 'p' || x[0] === 'u' || x[0] === 'd');
    if (mn) return mentionHtml(mn);
    let h = esc(t);
    if (!d || !d.length) return h;
    const has = (k) => d.find((x) => x[0] === k);
    if (has('c')) h = `<span class="nsp-inline-code-container" style="display:inline"><span class="nsp-inline-code" data-rt="c" style="${CODE_STYLE}">${h}</span></span>`;
    if (has('b')) h = `<span data-rt="b" style="font-weight:600">${h}</span>`;
    if (has('i')) h = `<span data-rt="i" style="font-style:italic">${h}</span>`;
    if (has('s')) h = `<span data-rt="s" style="text-decoration:line-through;text-decoration-color:inherit">${h}</span>`;
    if (has('_')) h = `<span data-rt="u" style="text-decoration:underline;text-decoration-thickness:0.05em;text-decoration-color:inherit;text-underline-offset:10%;color:inherit;word-wrap:break-word">${h}</span>`;
    const c = has('h');
    if (c) h = `<span data-rt="h" data-color="${esc(c[1])}" style="${colorStyle(c[1], true)};isolation:auto">${h}</span>`;
    const a = has('a');
    if (a) h = `<a data-rt="a" href="${esc(a[1])}" style="cursor:pointer;color:inherit;word-wrap:break-word;text-decoration:inherit"><span style="text-decoration:underline;text-decoration-thickness:0.05em;text-decoration-color:var(--ca-opaLinDecCol);text-underline-offset:10%;opacity:0.7">${h}</span></a>`;
    return h;
  }).join('');
}
// A title like "Meeting @Today 10:28 AM" stores its date; the words follow the clock, so it reads Yesterday tomorrow.
const titlePartsOf = (p) => (p && p.titleDate ? [p.title, '@' + mentionDate(p.titleDate)] : p && p.titleParts);
const mentionDate = (v) => {
  const [iso, time] = String(v).split('T'); const now = new Date(NOW()); const tm = new Date(NOW()); tm.setDate(tm.getDate() + 1); const yd = new Date(NOW()); yd.setDate(yd.getDate() - 1);
  const base = iso === isoDate(now) ? 'Today' : iso === isoDate(tm) ? 'Tomorrow' : iso === isoDate(yd) ? 'Yesterday' : new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  if (!time) return base; const [hh, mm] = time.split(':').map(Number); return `${base} ${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
};
function mentionHtml([k, v]) {
  if (k === 'p') {
    const p = S.pages[v]; const title = (p && p.title) || 'Untitled';
    const ic = p && p.icon && p.icon.emoji ? `<span class="nm-emoji" data-e="${esc(p.icon.emoji)}"></span>` : `<span class="nm-svg">${svgMarkup(p && p.kind === 'database' ? 'viewTable' : 'page')}</span>`;
    return `<span class="nsp-page-mention-token nm page" data-rt="m" data-m="p:${esc(v)}" contenteditable="false"><span class="nm-hide">‣</span>${ic}<span class="nm-label" data-label="${esc(title)}"></span></span>`;
  }
  if (k === 'u') return `<span class="nsp-user-mention-token nm user" data-rt="m" data-m="u:${esc(v)}" contenteditable="false"><span class="nm-hide">‣</span><span class="nm-label" data-label="@${esc(space.personName(v === 'me' ? space.me.id : v))}"></span></span>`;
  return `<span class="nsp-date-mention-token nm date" data-rt="m" data-m="d:${esc(v)}" contenteditable="false"><span class="nm-hide">‣</span><span class="nm-label" data-label="@${esc(mentionDate(v))}"></span></span>`;
}
function domToRich(root) {
  const out = [];
  const push = (t, d) => {
    if (!t) return;
    const last = out[out.length - 1];
    if (last && JSON.stringify(last[1] || []) === JSON.stringify(d)) last[0] += t;
    else out.push(d.length ? [t, d] : [t]);
  };
  const add = (d, x) => (d.some((y) => y[0] === x[0]) ? d : [...d, x]);
  const walk = (node, d) => {
    if (node.nodeType === 3) return push(node.nodeValue, d);
    if (node.nodeType !== 1) return;
    const el = node; const tag = el.tagName; const st = el.style || {}; const rt = el.dataset ? el.dataset.rt : null;
    if (rt === 'm') { const raw = el.dataset.m || ''; const k = raw.indexOf(':'); out.push(['‣', [[raw.slice(0, k), raw.slice(k + 1)]]]); return; }
    if (tag === 'BR') return push('\n', d);
    let dd = d;
    if (rt === 'b' || tag === 'B' || tag === 'STRONG' || /^(600|700|bold)$/.test(st.fontWeight)) dd = add(dd, ['b']);
    if (rt === 'i' || tag === 'I' || tag === 'EM' || st.fontStyle === 'italic') dd = add(dd, ['i']);
    if (rt === 's' || tag === 'S' || tag === 'STRIKE' || (st.textDecoration || '').includes('line-through')) dd = add(dd, ['s']);
    const inLink = el.closest && el.closest('[data-rt="a"]');
    if (rt === 'u' || tag === 'U' || (!inLink && (st.textDecoration || '').includes('underline'))) dd = add(dd, ['_']);
    if (rt === 'c') dd = add(dd, ['c']);
    if (rt === 'a' || tag === 'A') dd = add(dd, ['a', el.getAttribute('href') || '']);
    if (rt === 'h' && el.dataset.color) dd = add(dd, ['h', el.dataset.color]);
    el.childNodes.forEach((c) => walk(c, dd));
  };
  root.childNodes.forEach((c) => walk(c, []));
  return out;
}
function splitRich(segs, off) {
  const L = []; const Rr = []; let pos = 0;
  for (const s of segs || []) {
    const len = s[0].length;
    if (pos + len <= off) L.push(s);
    else if (pos >= off) Rr.push(s);
    else { const k = off - pos; L.push(s[1] ? [s[0].slice(0, k), s[1]] : [s[0].slice(0, k)]); Rr.push(s[1] ? [s[0].slice(k), s[1]] : [s[0].slice(k)]); }
    pos += len;
  }
  return [L, Rr];
}
function caretOffset(el) {
  const sel = getSelection(); if (!sel.rangeCount) return 0;
  const r = sel.getRangeAt(0); const pre = r.cloneRange(); pre.selectNodeContents(el); pre.setEnd(r.endContainer, r.endOffset);
  return pre.toString().length;
}
function setCaret(el, off) {
  const sel = getSelection(); const range = document.createRange();
  if (off === 'end') { range.selectNodeContents(el); range.collapse(false); } else {
    let left = off; let placed = false; const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let t;
    while ((t = tw.nextNode())) { if (left <= t.nodeValue.length) { range.setStart(t, left); placed = true; break; } left -= t.nodeValue.length; }
    if (!placed) { range.selectNodeContents(el); range.collapse(false); } else range.collapse(true);
  }
  sel.removeAllRanges(); sel.addRange(range);
}
let pendingFocus = null;
let pendingSlash = null;
const focusLater = (id, off) => { pendingFocus = { id, off }; };
function applyFocus() {
  if (!pendingFocus) return;
  const { id, off } = pendingFocus; pendingFocus = null;
  const el = document.querySelector(`[data-ed="${id}"]`);
  if (el) { el.focus(); setCaret(el, off); if (pendingSlash === id) { pendingSlash = null; openSlash(id, el); } }
}

/* ------------------------------------------------------------------ tree ops */
const LISTISH = new Set(['bulleted_list', 'numbered_list', 'to_do', 'toggle']);
const TEXTUAL = new Set(['text', 'header', 'sub_header', 'sub_sub_header', 'header_4', 'bulleted_list', 'numbered_list', 'to_do', 'toggle', 'quote', 'callout']);
const listOf = (parentId) => (S.pages[parentId] ? S.pages[parentId].content : S.blocks[parentId].children);
const siblings = (id) => { const p = S.blocks[id].parent; const pb = S.blocks[p]; const arr = pb && pb.notes && pb.notes.includes(id) ? pb.notes : listOf(p); return [arr, arr.indexOf(id)]; };
const touch = () => { const p = S.pages[route()]; if (p) p.lastEdited = NOW(); };
function newBlock(type, title, parent) {
  const b = { id: uid(), type, title: title || [], children: [], parent };
  if (type === 'to_do') b.checked = false;
  if (type === 'toggle') b.open = true;
  S.blocks[b.id] = b;
  return b;
}
function lastDescendant(id) {
  const b = S.blocks[id]; const open = !(b.type === 'toggle' || b.toggleable) || b.open;
  const last = b.children[b.children.length - 1];
  if (last && open && TEXTUAL.has(S.blocks[last].type)) return lastDescendant(last);
  return id;
}
function prevEditable(id) {
  const [arr, i] = siblings(id);
  for (let k = i - 1; k >= 0; k--) if (S.blocks[arr[k]] && TEXTUAL.has(S.blocks[arr[k]].type)) return lastDescendant(arr[k]);
  const par = S.blocks[id].parent;
  return S.blocks[par] && TEXTUAL.has(S.blocks[par].type) ? par : null;
}
function convert(id, type, extra = {}) {
  const b = S.blocks[id]; b.type = type; Object.assign(b, extra);
  if (type === 'to_do' && b.checked === undefined) b.checked = false;
  if (type === 'toggle' && b.open === undefined) b.open = true;
  b._rev = (b._rev || 0) + 1; touch();
}
function splitAt(id, el) {
  const b = S.blocks[id]; const off = caretOffset(el);
  b.title = domToRich(el);
  const [L, Rr] = splitRich(b.title, off);
  if (!plain(L) && !plain(Rr) && LISTISH.has(b.type)) { convert(id, 'text'); commit(); focusLater(id, 0); return; }
  b.title = L; b._rev = (b._rev || 0) + 1;
  const openParent = (b.type === 'toggle' || b.toggleable) && b.open && off >= plain(L).length;
  if (openParent) { const nb = newBlock('text', Rr, id); b.children.unshift(nb.id); focusLater(nb.id, 0); } else {
    const [arr, i] = siblings(id); const nb = newBlock(LISTISH.has(b.type) ? b.type : 'text', Rr, b.parent);
    arr.splice(i + 1, 0, nb.id); focusLater(nb.id, 0);
  }
  touch(); commit();
}
function outdent(id) {
  const b = S.blocks[id]; const par = S.blocks[b.parent]; if (!par || par.type === 'column') return false;
  const [arr, i] = siblings(id); const trailing = arr.splice(i + 1); arr.splice(i, 1);
  trailing.forEach((t) => { S.blocks[t].parent = id; b.children.push(t); });
  const [parr, pi] = siblings(par.id); parr.splice(pi + 1, 0, id); b.parent = par.parent;
  return true;
}
function indent(id) {
  const [arr, i] = siblings(id); if (i <= 0) return false;
  const prev = S.blocks[arr[i - 1]]; if (!TEXTUAL.has(prev.type)) return false;
  arr.splice(i, 1); prev.children.push(id); S.blocks[id].parent = prev.id;
  if (prev.type === 'toggle' || prev.toggleable) prev.open = true;
  return true;
}

/* ------------------------------------------------------------------ slash menu */
// Sections, names, shortcut hints and icons read from the live "/" menu, in its order.
const SLASH_SECTIONS = [
  ...(READY.meetings ? [{ g: 'Suggested', items: [{ n: 'AI Meeting Notes', ic: 'paperMicrophone' }] }] : []),
  { g: 'Basic blocks', items: [
    { n: 'Text', ic: 'textNormal', t: 'text' }, { n: 'Heading 1', ic: 'textH1', t: 'header', sc: '#' },
    { n: 'Heading 2', ic: 'textH2', t: 'sub_header', sc: '##' }, { n: 'Heading 3', ic: 'textH3', t: 'sub_sub_header', sc: '###' },
    { n: 'Heading 4', ic: 'textH4', t: 'header_4', sc: '####' }, { n: 'Bulleted list', ic: 'listBullet', t: 'bulleted_list', sc: '-' },
    { n: 'Numbered list', ic: 'listNumber', t: 'numbered_list', sc: '1.' }, { n: 'To-do list', ic: 'checklist', t: 'to_do', sc: '[]' },
    { n: 'Toggle list', ic: 'listToggle', t: 'toggle', sc: '>' }, { n: 'Page', ic: 'pageMenu', as: 'page' },
    { n: 'Callout', ic: 'calloutBlock', t: 'callout' }, { n: 'Quote', ic: 'quote', t: 'quote', sc: '"' },
    { n: 'Table', ic: 'viewTable', t: 'table' }, { n: 'Divider', ic: 'dashLong', t: 'divider', sc: '---' },
    { n: 'Link to page', ic: 'docSend' },
  ] },
  { g: 'Media', items: [{ n: 'Image', ic: 'photo', t: 'image' }, { n: 'Video', ic: 'playButton', t: 'video' }, { n: 'Audio', ic: 'volumeOn', t: 'audio' }, { n: 'Code', ic: 'code', t: 'code', sc: '```' }, { n: 'File', ic: 'paperClip', t: 'file' }, { n: 'Web bookmark', ic: 'bookmark', t: 'bookmark' }] },
  { g: 'Database', items: [{ n: 'Table view', ic: 'viewTable' }, { n: 'Board view', ic: 'viewBoard' }] },
  { g: 'Advanced blocks', items: [
    { n: 'Table of contents', ic: 'listToggle', t: 'table_of_contents' }, { n: 'Block equation', ic: 'code', t: 'equation' },
    { n: 'Toggle heading 1', ic: 'textH1', t: 'header', tog: true }, { n: 'Toggle heading 2', ic: 'textH2', t: 'sub_header', tog: true },
    { n: 'Toggle heading 3', ic: 'textH3', t: 'sub_sub_header', tog: true }, { n: '2 columns', ic: 'viewBoard', t: 'column_list' },
  ] },
];
const ALIAS = { text: 'paragraph plain', header: 'h1 title', sub_header: 'h2 subtitle', sub_sub_header: 'h3', header_4: 'h4', bulleted_list: 'ul unordered bullet', numbered_list: 'ol ordered number', to_do: 'todo task checkbox', toggle: 'collapse details', quote: 'blockquote', callout: 'note info', divider: 'hr line rule', code: 'snippet pre', table_of_contents: 'toc outline', equation: 'math latex katex' };
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
function slashSections(q) {
  const f = norm(q || '');
  return SLASH_SECTIONS.map((s) => ({ g: s.g, items: f ? s.items.filter((m) => (norm(m.n) + norm(ALIAS[m.t] || '') + norm(m.sub || '')).includes(f)) : s.items })).filter((s) => s.items.length);
}
const slashFlat = (q) => slashSections(q).flatMap((s) => s.items);
function openSlash(id, el) {
  const sel = getSelection(); let rr = null;
  if (sel.rangeCount) {
    const r = sel.getRangeAt(0).cloneRange();
    if (r.startContainer.nodeType === 3 && r.startOffset > 0) r.setStart(r.startContainer, r.startOffset - 1);
    rr = r.getBoundingClientRect();
  }
  const box = el.getBoundingClientRect();
  const left = rr && rr.height ? rr.left : box.left + 2;
  const top = rr && rr.height ? rr.top : box.top + 2;
  const lineH = rr && rr.height ? rr.height : 19;
  const up = innerHeight - (top + lineH) < 360; // measured: opens 12px above the line when there is no room below
  slash = { id, query: '', sel: 0, chipX: left, chipY: top, x: left - 6.4, y: up ? top - 12 : top + lineH + 12, up };
  refresh();
}
function closeSlash() { if (slash) { slash = null; refresh(); } }
/* ------------------------------------------------------------------ @ mentions */
// Measured on the live menu: 330px card, 4px inset rows of 28px on a 29px pitch, 12px/500 section heads 34px tall,
// 12px between sections, 20px icons with text 36px in; it opens just above the line when there is no room below.
let mention = null; // { id, query, sel, x, y, up }
function openMention(id, el) {
  const sel = getSelection(); let rr = null;
  if (sel.rangeCount) { const r = sel.getRangeAt(0).cloneRange(); if (r.startContainer.nodeType === 3 && r.startOffset > 0) r.setStart(r.startContainer, r.startOffset - 1); rr = r.getBoundingClientRect(); }
  const box = el.getBoundingClientRect();
  const left = rr && rr.height ? rr.left : box.left + 2; const top = rr && rr.height ? rr.top : box.top + 2; const lineH = rr && rr.height ? rr.height : 19;
  const up = innerHeight - (top + lineH) < 330;
  slash = null; mention = { id, query: '', sel: 0, x: left - 8.4, y: up ? top - 4 : top + lineH + 4, up }; refresh();
}
function closeMention() { if (mention) { mention = null; refresh(); } }
function mentionSections(q) {
  const needle = q.trim().toLowerCase(); const ok = (s) => !needle || String(s).toLowerCase().includes(needle);
  const secs = [];
  const tm = new Date(NOW()); tm.setDate(tm.getDate() + 1);
  const date = [{ k: 'd', v: isoDate(new Date(NOW())), label: 'Today', ic: 'clock' }, { k: 'd', v: isoDate(tm) + 'T09:00', label: 'Remind me', sub: 'Tomorrow 9am', ic: 'alarm' }].filter((x) => ok(x.label) || ok(x.sub || ''));
  if (date.length) secs.push(['Date', date]);
  const people = [{ k: 'u', v: space.me.id, label: space.me.name, you: true, avatar: true }, ...[...space.people.values()].filter((p) => p.id !== space.me.id).map((p) => ({ k: 'u', v: p.id, label: p.name, avatar: true })), { k: 'invite', label: 'Invite…', ic: 'inviteMember' }].filter((x) => ok(x.label));
  if (people.length) secs.push(['People', people]);
  const live = Object.values(S.pages).filter((p) => p && !p.trashed && p.kind !== 'stub' && ok(p.title || 'Untitled'));
  const order = [...(S.recents || []).map((id) => S.pages[id]).filter((p) => p && live.includes(p)), ...live.filter((p) => !(S.recents || []).includes(p.id))];
  const links = order.slice(0, 5).map((p) => ({ k: 'p', v: p.id, label: p.title || 'Untitled', page: p, sub: p.rowOf ? ((Object.values(S.pages).find((x) => x.collection === p.rowOf.coll) || {}).title || '') : '' }));
  if (order.length > 5) links.push({ k: 'more', label: `${order.length - 5} more results`, ic: 'ellipsis' });
  if (links.length) secs.push(['Link to page', links]);
  secs.push(['New page', [{ k: 'newsub', label: 'Add new sub-page', ic: 'plus' }, { k: 'newin', label: 'Add new page in…', ic: 'arrowDiagonalUpRight' }]]);
  return secs;
}
const mentionFlat = (q) => mentionSections(q).flatMap((s) => s[1]);
function applyMention(item) {
  const { id, query } = mention; const b = S.blocks[id]; const el = document.querySelector(`[data-ed="${id}"]`);
  closeMention();
  if (!b || item.k === 'invite' || item.k === 'newin' || item.k === 'more') { focusLater(id, 'end'); return; }
  const rich = el ? domToRich(el) : b.title; const txt = plain(rich); const cut = txt.lastIndexOf('@');
  let val = item.v;
  if (item.k === 'newsub') { const pid = 'p' + uid(); S.pages[pid] = { id: pid, kind: 'page', icon: null, title: '', content: [], lastEdited: NOW(), parent: route() }; val = pid; }
  const kind = item.k === 'newsub' ? 'p' : item.k;
  const [before, rest] = splitRich(rich, cut >= 0 ? cut : txt.length);
  const after = splitRich(rest, Math.min(plain(rest).length, 1 + query.length))[1];
  b.title = [...before, ['‣', [[kind, val]]], [' '], ...after]; b._rev = (b._rev || 0) + 1; b.edited = NOW();
  touch(); commit(); focusLater(id, plain(before).length + 2);
}
function MentionMenu() {
  const ref = useRef(null);
  useLayoutEffect(() => { const el = ref.current && ref.current.querySelector('.mn-row.on'); if (el) el.scrollIntoView({ block: 'nearest' }); });
  if (!mention) return null;
  const secs = mentionSections(mention.query);
  let k = -1;
  const pos = `left:${mention.x}px;` + (mention.up ? `bottom:${innerHeight - mention.y}px` : `top:${mention.y}px`);
  return html`<div class="menu mention-menu" ref=${ref} style=${pos}><div class="mn-scroll">${secs.map(([g, items]) => html`<div class="mn-sec"><div class="mn-head">${g}</div>${items.map((it) => { k++; const mine = k; return html`<div class=${'mn-row' + (mine === mention.sel ? ' on' : '') + (it.k === 'p' && it.sub ? ' tall' : '')} role="option" onMouseMove=${() => { if (mention && mention.sel !== mine) { mention.sel = mine; refresh(); } }} onMouseDown=${(e) => { e.preventDefault(); applyMention(it); }}>
      <div class="mn-ic">${it.avatar ? html`<img src=${space.avatar(it.v)} alt=""/>` : it.page ? html`<${RowIcon} page=${it.page}/>` : html`<${Icon} n=${it.ic} cls="i20"/>`}</div>
      <div class="mn-txt"><div class="mn-label">${it.label}${it.you ? html`<span class="mn-you"> (You)</span>` : ''}${it.sub && it.k === 'd' ? html`<span class="mn-sub-inline"> · ${it.sub}</span>` : ''}</div>${it.k === 'p' && it.sub ? html`<div class="mn-sub">${it.sub}</div>` : ''}</div>
    </div>`; })}</div>`)}</div></div>`;
}
function applySlash(item) {
  const { id } = slash; const b = S.blocks[id]; const el = document.querySelector(`[data-ed="${id}"]`);
  const rich = el ? domToRich(el) : b.title; const txt = plain(rich); const cut = txt.lastIndexOf('/');
  b.title = splitRich(rich, cut >= 0 ? cut : txt.length)[0]; b._rev = (b._rev || 0) + 1;
  closeSlash();
  if (item.n === 'Page' || item.n === 'AI Meeting Notes' || item.n === 'Link to page') { slashInsert(id, item); return; }
  if (!item.t) { commit(); focusLater(id, 'end'); return; }
  if (['divider', 'table_of_contents', 'equation', 'table', 'column_list', 'image', 'video', 'audio', 'file', 'bookmark'].includes(item.t)) {
    const [arr, i] = siblings(id); const empty = !plain(b.title);
    const nb = newBlock(item.t, [], b.parent);
    if (item.t === 'equation') nb.title = [['x^2']];
    if (item.t === 'table') { nb.rows = [['', ''], ['', ''], ['', '']]; nb.widths = [120, 120]; nb.headerRow = false; }
    if (item.t === 'column_list') { for (let k = 0; k < 2; k++) { const col = newBlock('column', [], nb.id); const t = newBlock('text', [], col.id); col.children.push(t.id); nb.children.push(col.id); } }
    if (empty) { arr.splice(i, 1, nb.id); delete S.blocks[id]; } else arr.splice(i + 1, 0, nb.id);
    const k = arr.indexOf(nb.id);
    if (!arr[k + 1]) { const after = newBlock('text', [], nb.parent); arr.splice(k + 1, 0, after.id); }
    touch(); commit(); focusLater(arr[k + 1], 0); return;
  }
  if (item.t === 'code') { convert(id, 'code', { language: 'Plain text' }); commit(); focusLater(id, 'end'); return; }
  convert(id, item.t, item.tog ? { toggleable: true, open: true } : {});
  if (item.t === 'callout') b.icon = '💡';
  commit(); focusLater(id, 'end');
}

/* ------------------------------------------------------------------ editable text */
const PH = { header: 'Heading 1', sub_header: 'Heading 2', sub_sub_header: 'Heading 3', header_4: 'Heading 4', to_do: 'To-do', bulleted_list: 'List', numbered_list: 'List', toggle: 'Toggle', quote: 'Empty quote', callout: '', text: "Write, press 'space' for AI, '/' for commands…" };
const MD = [[/^####\s$/, 'header_4'], [/^###\s$/, 'sub_sub_header'], [/^##\s$/, 'sub_header'], [/^#\s$/, 'header'], [/^[-*+]\s$/, 'bulleted_list'], [/^1[.)]\s$/, 'numbered_list'], [/^\[\s?\]\s$/, 'to_do'], [/^>\s$/, 'toggle'], [/^"\s$/, 'quote'], [/^```$/, 'code'], [/^---$/, 'divider']];
function Editable({ b, tag, cls, ph }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const rev = b._rev || 0; const want = richToHtml(b.title, blockCmt && blockCmt.id === b.id ? 'pending' : b.comments && b.comments.length ? 'posted' : '');
    if (el.__rev !== rev || (document.activeElement !== el && el.innerHTML !== want)) el.innerHTML = want;
    el.__rev = rev;
  });
  const onInput = (e) => {
    const el = e.currentTarget; b.title = domToRich(el); b.edited = NOW(); touch();
    const t = plain(b.title);
    if (mention && mention.id === b.id) { const k = t.lastIndexOf('@'); if (k < 0) closeMention(); else { mention.query = t.slice(k + 1, Math.max(k + 1, caretOffset(el))); if (mention.query.length > 40) closeMention(); else { mention.sel = 0; refresh(); } } persist(); return; }
    if (e.data === '@') { const off = caretOffset(el); const prev = off >= 2 ? t[off - 2] : ''; if (!prev || prev === ' ' || prev === '\n') { openMention(b.id, el); persist(); return; } }
    if (slash && slash.id === b.id) { const k = t.lastIndexOf('/'); if (k < 0) closeSlash(); else { slash.query = t.slice(k + 1); slash.sel = 0; refresh(); } persist(); return; }
    if (e.data === '/') { openSlash(b.id, el); persist(); return; }
    for (const [re, type] of MD) {
      if (!re.test(t)) continue;
      b.title = [];
      if (type === 'divider') { const [arr, i] = siblings(b.id); convert(b.id, 'divider'); const nb = newBlock('text', [], b.parent); arr.splice(i + 1, 0, nb.id); commit(); focusLater(nb.id, 0); return; }
      convert(b.id, type, type === 'code' ? { language: 'Plain text' } : {}); commit(); focusLater(b.id, 0); return;
    }
    persist();
  };
  const onKeyDown = (e) => {
    const el = e.currentTarget;
    if (mention && mention.id === b.id) {
      const items = mentionFlat(mention.query); const count = Math.max(items.length, 1);
      if (e.key === 'ArrowDown') { e.preventDefault(); mention.sel = (mention.sel + 1) % count; refresh(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); mention.sel = (mention.sel - 1 + count) % count; refresh(); return; }
      if (e.key === 'Enter') { e.preventDefault(); if (items[mention.sel]) applyMention(items[mention.sel]); return; }
      if (e.key === 'Escape') { e.preventDefault(); closeMention(); return; }
    }
    if (slash && slash.id === b.id) {
      const items = slashFlat(slash.query); const count = Math.max(items.length, 1);
      if (e.key === 'ArrowDown') { e.preventDefault(); slash.sel = (slash.sel + 1) % count; refresh(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); slash.sel = (slash.sel - 1 + count) % count; refresh(); return; }
      if (e.key === 'Enter') { e.preventDefault(); if (items[slash.sel]) applySlash(items[slash.sel]); return; }
      if (e.key === 'Escape') { e.preventDefault(); closeSlash(); return; }
    }
    if (e.key === 'Escape') { e.preventDefault(); b.title = domToRich(el); persist(); el.blur(); pickBlocks([b.id]); return; }
    if ((e.metaKey || e.ctrlKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'b' || k === 'i' || k === 'u') { e.preventDefault(); document.execCommand(k === 'b' ? 'bold' : k === 'i' ? 'italic' : 'underline'); b.title = domToRich(el); persist(); return; }
      if (k === 's' && e.shiftKey) { e.preventDefault(); document.execCommand('strikeThrough'); b.title = domToRich(el); persist(); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); splitAt(b.id, el); return; }
    if (e.key === 'Tab') { e.preventDefault(); b.title = domToRich(el); const off = caretOffset(el); if (e.shiftKey ? outdent(b.id) : indent(b.id)) { touch(); commit(); focusLater(b.id, off); } return; }
    if (e.key === 'Backspace') {
      const sel = getSelection(); if (caretOffset(el) !== 0 || !sel.isCollapsed) return;
      e.preventDefault(); b.title = domToRich(el);
      if (b.type !== 'text') { convert(b.id, 'text', { toggleable: false }); commit(); focusLater(b.id, 0); return; }
      if (S.blocks[b.parent] && S.blocks[b.parent].type !== 'column' && outdent(b.id)) { touch(); commit(); focusLater(b.id, 0); return; }
      const p = prevEditable(b.id); if (!p) return;
      const pb = S.blocks[p]; const at = plain(pb.title).length;
      pb.title = [...pb.title, ...b.title]; pb._rev = (pb._rev || 0) + 1;
      b.children.forEach((c) => { S.blocks[c].parent = b.parent; });
      const [arr, i] = siblings(b.id); arr.splice(i, 1, ...b.children); delete S.blocks[b.id];
      touch(); commit(); focusLater(p, at); return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const all = [...document.querySelectorAll('.nsp-page-content [data-ed]')]; const k = all.indexOf(el);
      const sel = getSelection(); if (!sel.rangeCount) return;
      const rr = sel.getRangeAt(0).getBoundingClientRect(); const box = el.getBoundingClientRect();
      if (e.key === 'ArrowUp' && rr.top - box.top < 20 && all[k - 1]) { e.preventDefault(); all[k - 1].focus(); setCaret(all[k - 1], 'end'); }
      if (e.key === 'ArrowDown' && box.bottom - rr.bottom < 20 && all[k + 1]) { e.preventDefault(); all[k + 1].focus(); setCaret(all[k + 1], 0); }
    }
  };
  const T = tag || 'div';
  return html`<${T} ref=${ref} class=${'nb-text ' + (cls || '')} contenteditable="true" spellcheck="true" data-ed=${b.id} data-ph=${ph ?? PH[b.type] ?? ''} onInput=${onInput} onKeyDown=${onKeyDown} onClick=${(e) => { const tok = e.target.closest && e.target.closest('.nm.page'); if (tok) { e.preventDefault(); go(tok.dataset.m.slice(2)); } }} onBlur=${() => { if (slash && slash.id === b.id) setTimeout(closeSlash, 150); }}></${T}>`;
}

/* ------------------------------------------------------------------ blocks */
const PY_KEYWORDS = new Set(['and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield']);
const PY_BUILTINS = new Set(['print', 'len', 'range', 'int', 'str', 'float', 'list', 'dict', 'set', 'tuple', 'open', 'sum', 'min', 'max', 'abs', 'map', 'filter', 'zip', 'enumerate', 'sorted', 'type', 'isinstance']);
// Same token boundaries and classes as Prism's python grammar: function only right after `def`,
// plain identifiers stay bare text between tokens.
function highlight(code, lang) {
  if (!/python/i.test(lang || '')) return esc(code);
  const re = /(#.*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|\b(\d+(?:\.\d+)?)\b|([A-Za-z_]\w*)|(:=|\*\*=?|\/\/=?|<[<=>]?|>[=>]?|[-+%=!]=?|\*=?|\/=?|[&|^~])|([{}[\];(),.:])/g;
  let out = ''; let last = 0; let m; let afterDef = false;
  const tok = (c, t) => `<span class="token ${c}">${esc(t)}</span>`;
  while ((m = re.exec(code))) {
    if (m.index > last) out += esc(code.slice(last, m.index));
    const t = m[0];
    if (m[1]) out += tok('comment', t);
    else if (m[2]) out += tok('string', t);
    else if (m[3]) out += tok('number', t);
    else if (m[4]) {
      if (afterDef) { out += tok('function', t); afterDef = false; }
      else if (t === 'True' || t === 'False' || t === 'None') out += tok('boolean', t);
      else if (PY_KEYWORDS.has(t)) { out += tok('keyword', t); afterDef = t === 'def'; }
      else if (PY_BUILTINS.has(t)) out += tok('builtin', t);
      else out += esc(t);
    } else if (m[5]) out += tok('operator', t);
    else out += tok('punctuation', t);
    last = m.index + t.length;
  }
  return out + esc(code.slice(last));
}
function CodeText({ b }) {
  const ref = useRef(null);
  useLayoutEffect(() => { const el = ref.current; if (el && document.activeElement !== el) el.innerHTML = highlight(plain(b.title), b.language); });
  return html`<div ref=${ref} class="cd-text" contenteditable="true" spellcheck="false" data-ed=${b.id}
    onInput=${(e) => { b.title = [[e.currentTarget.innerText.replace(/\n$/, '')]]; touch(); persist(); }}
    onBlur=${(e) => { e.currentTarget.innerHTML = highlight(plain(b.title), b.language); }}
    onKeyDown=${(e) => { if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '    '); } }}></div>`;
}
function Equation({ b }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    if (window.katex) { try { window.katex.render(plain(b.title), el, { displayMode: true, throwOnError: false, output: 'html' }); return; } catch (e) {} }
    el.textContent = plain(b.title);
  });
  return html`<div class="eq-box" ref=${ref} role="button"></div>`;
}
const TR_TABS = [['summary', 'checklist', 'Summary'], ['notes', 'pencilLine', 'Notes'], ['transcript', 'microphoneText', 'Transcript']];
// Measured: a 432px scroller pinned to the newest line, a sticky speaker bar, runs grouped by speaker with a rail.
function Transcript({ b }) {
  const [open, setOpen] = useState(false); const ref = useRef(null);
  const groups = [];
  (b.transcript || []).forEach((sg) => { const g = groups[groups.length - 1]; if (g && g.speaker === sg.speaker) g.items.push(sg); else groups.push({ speaker: sg.speaker, items: [sg] }); });
  useLayoutEffect(() => { if (ref.current && !open) ref.current.scrollTop = ref.current.scrollHeight; }, [open]);
  const speakerRow = (name) => html`<div class="tr-speaker"><span class="tr-rec"><${Icon} n="recordCircle" cls="i14"/></span><div>${name}</div></div>`;
  return html`<div class="tr-script"><div class=${'tr-scroll' + (open ? ' open' : '')} ref=${ref}><div class="tr-script-in">
    <div class="tr-script-top">${speakerRow(`${space.me.firstName || 'Your'}'s audio`)}<div class="tr-expand" role="button" onClick=${() => setOpen(!open)}><span>${open ? 'Collapse transcript' : 'Expand transcript'}</span><${Icon} n="arrowChevronDoubleUpAndDownSmall" cls="i14"/></div></div>
    <div class="tr-gap"></div>
    ${groups.map((g) => html`<div class="tr-group"><div class="tr-attr">${speakerRow(g.speaker)}</div><div class="tr-lines"><div class="tr-rail"></div><div class="tr-lines-in">${g.items.map((sg) => html`<div class="tr-time"><span>${sg.t}</span></div><div class="nsp-selectable nsp-text-block tr-line"><div class="nb-w"><div class="nb-hl"><div class="nb-text">${sg.text}</div></div></div></div>`)}</div></div></div>`)}
  </div></div></div>`;
}
function Children({ ids, nested }) {
  return ids.map((id, i) => html`<${Block} key=${id} id=${id} prev=${ids[i - 1]} next=${ids[i + 1]} nested=${nested} idx=${i}/>`);
}
function numberFor(id) { const [arr, i] = siblings(id); let n = 1; for (let k = i - 1; k >= 0 && S.blocks[arr[k]] && S.blocks[arr[k]].type === 'numbered_list'; k--) n++; return n; }
function depthOf(id) { let d = 0; let p = S.blocks[id].parent; while (S.blocks[p]) { if (S.blocks[p].type === 'bulleted_list') d++; p = S.blocks[p].parent; } return d; }
function Block({ id, prev, next, nested, idx }) {
  const b = S.blocks[id]; if (!b) return null;
  if ((b.type === 'page' || b.type === 'link_to_page') && (!S.pages[b.pageId] || S.pages[b.pageId].trashed)) return null;
  const cls = ['nsp-selectable', `nsp-${b.type}-block`];
  if (picked.has(id)) cls.push('nb-sel');
  const cs = colorStyle(b.color);
  const flip = (e) => { e.preventDefault(); b.open = !b.open; commit(); };
  let body = null;
  switch (b.type) {
    case 'header': case 'sub_header': case 'sub_sub_header': case 'header_4': {
      const lvl = { header: 1, sub_header: 2, sub_sub_header: 3, header_4: 4 }[b.type];
      const Tag = 'h' + (lvl + 1);
      if (b.toggleable) {
        cls.push('nb-toggle-heading');
        body = html`<div class="nb-w"><div class="nb-hl" style=${cs}><div class="nb-th-marker"><div class=${'tgl' + (b.open ? ' open' : '')} role="button" onMouseDown=${flip}><${Icon} n="arrowCaretDownFillSmall" cls="caret"/></div></div><div class="nb-col"><${Editable} b=${b} tag=${Tag} cls=${'nb-h h' + lvl}/></div></div>${b.open ? html`<div class="nb-th-kids"><${Children} ids=${b.children} nested/></div>` : ''}</div>`;
      } else body = html`<div class="nb-w"><div class="nb-hl" style=${cs}><${Editable} b=${b} tag=${Tag} cls=${'nb-h h' + lvl}/></div></div>`;
      break;
    }
    case 'bulleted_list': case 'numbered_list': case 'to_do': case 'toggle': {
      cls.push('nb-list');
      const listish = (x) => x && S.blocks[x] && LISTISH.has(S.blocks[x].type);
      if (!listish(prev)) cls.push(nested && idx === 0 ? 'nested-first' : 'grp-top');
      if (!listish(next)) cls.push(nested && !next ? 'nested-last' : 'grp-bot');
      if (b.type === 'to_do' && b.checked) cls.push('nb-todo-done');
      let marker;
      if (b.type === 'numbered_list') marker = html`<span class="nb-num" data-n=${numberFor(id) + '.'}></span>`;
      else if (b.type === 'bulleted_list') marker = html`<div class=${'nb-bul l' + ((depthOf(id) % 3) + 1)}></div>`;
      else if (b.type === 'to_do') marker = html`<div class="todo-wrap" role="checkbox" onMouseDown=${(e) => { e.preventDefault(); b.checked = !b.checked; touch(); commit(); }}><div class=${'todo' + (b.checked ? ' on' : '')}>${b.checked ? html`<${Icon} n="checkmarkFillSmall" cls="tick"/>` : ''}</div></div>`;
      else marker = html`<div class=${'tgl' + (b.open ? ' open' : '')} role="button" onMouseDown=${flip}><${Icon} n="arrowCaretDownFillSmall" cls="caret"/></div>`;
      let kids = '';
      if (b.type !== 'toggle' || b.open) {
        if (b.children.length) kids = html`<${Children} ids=${b.children} nested/>`;
        else if (b.type === 'toggle') kids = html`<div class="nb-empty-toggle" onMouseDown=${(e) => { e.preventDefault(); const nb = newBlock('text', [], b.id); b.children.push(nb.id); commit(); focusLater(nb.id, 0); }}>Empty toggle. Click or drop blocks inside.</div>`;
      }
      body = html`<div class="nb-w"><div class="nb-hl" style=${cs}><div class="nb-row"><div class="nb-marker">${marker}</div><div class="nb-col"><${Editable} b=${b}/>${kids}</div></div></div></div>`;
      break;
    }
    case 'quote':
      body = html`<div class="nb-w"><blockquote><div class="q-bar" style=${cs}><${Editable} b=${b}/></div></blockquote></div>`;
      break;
    case 'callout':
      body = html`<div class="nb-w"><div class="co-box"><div class="co-icon"><div class="co-icon-box" role="button"><div class="co-icon-in"><${Emoji} e=${b.icon || '💡'} size=${21.6}/></div></div></div><div class="co-body"><div class="nsp-selectable nsp-text-block"><div class="nb-w"><div class="nb-hl"><${Editable} b=${b} ph=""/></div></div></div>${b.children.length ? html`<${Children} ids=${b.children} nested/>` : ''}</div></div></div>`;
      break;
    case 'image': case 'video': case 'audio': case 'file': case 'bookmark':
      body = html`<${MediaBlock} b=${b}/>`;
      break;
    case 'divider':
      body = html`<div class="nb-w"><div class="dv"></div></div>`;
      break;
    case 'code':
      body = html`<div class="nb-w"><div class="cd-box"><div class="cd-lang" role="button">${b.language || 'Plain text'}</div><div class="cd-pad"><div class="cd-area"><${CodeText} b=${b}/></div></div></div></div>`;
      break;
    case 'equation':
      body = html`<div class="nb-w"><${Equation} b=${b}/></div>`;
      break;
    case 'table':
      body = html`<div class="nb-w"><div class="tb-scroll"><div class="tb-pad"><div class="tb-pad2"><div><div class="tb-grid"><table><tbody>${b.rows.map((r, ri) => html`<tr class=${ri === 0 && b.headerRow ? 'hdr' : ''}>${r.map((c, ci) => html`<td style=${`width:${(b.widths || [])[ci] || 120}px`}><div class="tb-cell" contenteditable="true" onInput=${(e) => { b.rows[ri][ci] = e.currentTarget.innerText; touch(); persist(); }}>${c}</div></td>`)}</tr>`)}</tbody></table></div></div></div></div></div></div>`;
      break;
    case 'column_list':
      body = html`<div class="nb-w">${b.children.map((c, i) => html`${i ? html`<div class="cl-gutter"><i></i></div>` : ''}<div class="nsp-column-block cl-col" style=${`width:calc((100% - ${46 * (b.children.length - 1)}px) / ${b.children.length})`}><${Children} ids=${S.blocks[c].children} nested/></div>`)}</div>`;
      break;
    case 'table_of_contents': {
      const page = S.pages[route()];
      const heads = (page && page.content ? page.content : []).map((x) => S.blocks[x]).filter((hb) => hb && /header/.test(hb.type)).map((hb) => [hb, { header: 0, sub_header: 1, sub_sub_header: 2, header_4: 3 }[hb.type]]);
      body = html`<div class="nb-w"><div class="toc">${heads.map(([hb, lv]) => html`<a href="#" onClick=${(e) => { e.preventDefault(); const t = document.querySelector(`[data-block-id="${hb.id}"]`); if (t) t.scrollIntoView({ block: 'start', behavior: 'smooth' }); }}><div class="toc-item" style=${`margin-left:${lv * 24}px`}><div class="toc-text">${plain(hb.title)}</div></div></a>`)}</div></div>`;
      break;
    }
    case 'transcription': {
      const tab = b.tab || 'summary';
      const kids = tab === 'summary' ? b.children : tab === 'notes' ? (b.notes || []) : [];
      body = html`<div class="nb-w">
        <div class="tr-head"><div class="tr-head-in"><div class="tr-icon" role="button"><div class="tr-icon-in"><${Icon} n="calendarDate10" cls="i24"/><${Icon} n="arrowChevronSingleDownSmall" cls="i16 chev"/></div></div><h2 class="tr-title">${plain(b.title) || html`<span class="tr-ph">AI Meeting Notes </span>`}<span class="nsp-text-mention-token"><span class="mention-at">@</span><span class="mention-date">${b.when || 'Today'}</span></span></h2></div></div>
        <div class="tr-body">
          <div class="tr-tabs-area"><div class="tr-tabs-row"><div class="tr-tabs">${TR_TABS.map(([k, ic, label]) => html`<div class=${'tr-tab' + (tab === k ? ' on' : '')} role="button" onClick=${() => { b.tab = k; commit(); }}><${Icon} n=${ic} cls="i20"/><span>${label}</span></div>`)}</div><div class="tr-tool" role="button"><${Icon} n="sliders" cls="i20"/></div></div>
            ${tab === 'summary' && b.share !== false ? html`<div class="tr-share"><div class="tr-share-label">Share this summary</div><div class="tr-share-btns"><div class="tr-btn" role="button" onClick=${() => { try { navigator.clipboard.writeText(location.href); } catch (e) {} }}><${Icon} n="link" cls="i20"/><span>Copy link</span></div><div class="tr-btn" role="button"><${Icon} n="envelope" cls="i20"/><span>Email</span></div><div class="tr-btn" role="button"><${Icon} n="squareGrid2X2" cls="i20"/><span>Slack</span></div><div class="tr-x" role="button" onClick=${() => { b.share = false; commit(); }}><${Icon} n="xMarkSmall" cls="i16"/></div></div></div>` : ''}
          </div>
          <div class="tr-content">${tab === 'transcript' ? html`<${Transcript} b=${b}/>` : html`<${Children} ids=${kids} nested/>`}</div>
        </div>
      </div>`;
      break;
    }
    case 'link_to_page':
    case 'page': {
      const pg = S.pages[b.pageId];
      body = html`<div class="nb-w"><a class="nb-page" href=${pathFor(b.pageId)} onClick=${(e) => { e.preventDefault(); go(b.pageId); }}><span class="nb-page-ic">${hasIcon(pg) ? html`<${PageIcon} ic=${pg.icon} size=${19.2}/>` : html`<${Icon} n=${pg && pg.content && pg.content.length ? 'page' : 'pageEmpty'} cls="i20"/>`}</span><span class="nb-page-title">${(pg && pg.title) || 'New page'}</span></a></div>`;
      break;
    }
    default:
      body = html`<div class="nb-w"><div class="nb-hl" style=${cs}><${Editable} b=${b}/></div>${b.children.length ? html`<div class="nb-indent"><${Children} ids=${b.children} nested/></div>` : ''}</div>`;
  }
  return html`<div class=${cls.join(' ')} data-block-id=${id}>${body}</div>`;
}

/* ------------------------------------------------------------------ page */
function SlashMenu() {
  const ref = useRef(null);
  useLayoutEffect(() => { const el = ref.current && ref.current.querySelector('.slash-row.on'); if (el) el.scrollIntoView({ block: 'nearest' }); });
  if (!slash) return null;
  const sections = slashSections(slash.query);
  let k = -1;
  const pos = `left:${slash.x}px;` + (slash.up ? `bottom:${innerHeight - slash.y}px` : `top:${slash.y}px`);
  const rows = sections.map((s) => html`<div class="slash-sec"><div class="slash-head">${s.g}</div>${s.items.map((m) => {
    k++; const mine = k;
    return html`<div class=${'slash-row' + (mine === slash.sel ? ' on' : '')} role="option" onMouseMove=${() => { if (slash && slash.sel !== mine) { slash.sel = mine; refresh(); } }} onMouseDown=${(e) => { e.preventDefault(); applySlash(m); }}><div class="slash-ic"><${Icon} n=${m.ic} as=${m.as} cls="i20"/></div><div class="slash-txt"><span class="slash-label">${m.n}</span>${m.sub ? html`<span class="slash-dot">·</span><span class="slash-sub">${m.sub}</span>` : ''}${m.badge ? html`<span class="slash-badge">${m.badge}</span>` : ''}${m.sc ? html`<span class="slash-sc">${m.sc}</span>` : ''}</div></div>`;
  })}</div>`);
  return html`<div class="slash-layer">
    ${slash.query ? '' : html`<div class="slash-chip" style=${`left:${slash.chipX}px;top:${slash.chipY}px`}><span class="slash-chip-in">/<span class="slash-chip-ph">Type to search</span></span></div>`}
    <div class="slash" ref=${ref} style=${pos}>
      <div class="slash-scroll">${sections.length ? rows : html`<div class="slash-none">No results</div>`}</div>
      <footer class="slash-foot"><div class="slash-foot-line"></div><div class="slash-foot-row" role="button" onMouseDown=${(e) => { e.preventDefault(); closeSlash(); }}><span>Close menu</span><span class="slash-foot-hint">esc</span></div></footer>
    </div>
  </div>`;
}
const OUTLINE_W = { header: 16, sub_header: 12, sub_sub_header: 8, header_4: 4 };
// Measured: a sticky 0-height strip in the right gutter of the scroller; bars 232px below it, right-aligned.
function Outline({ page }) {
  const heads = page.content.map((x) => S.blocks[x]).filter((hb) => hb && OUTLINE_W[hb.type]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const sc = document.querySelector('.nsp-frame > .nsp-scroller'); if (!sc) return undefined;
    const onScroll = () => {
      const limit = sc.getBoundingClientRect().top + sc.clientHeight * 0.3; let idx = 0;
      heads.forEach((hb, i) => { const el = document.querySelector(`[data-block-id="${hb.id}"]`); if (el && el.getBoundingClientRect().top < limit) idx = i; });
      setActive(idx);
    };
    sc.addEventListener('scroll', onScroll, { passive: true });
    return () => sc.removeEventListener('scroll', onScroll);
  }, [page.id, heads.length]);
  if (!heads.length) return null;
  const LVL = { header: 0, sub_header: 1, sub_sub_header: 2, header_4: 3 };
  // Measured: hovering the rail opens a 232px card 10px above it, rows 13px with 12px per heading level, current heading blue.
  return html`<div class="outline-sticky"><div class=${'nsp-outline' + (open ? ' open' : '')} onMouseEnter=${() => setOpen(true)} onMouseLeave=${() => setOpen(false)}>
    <div class="ol-list">${heads.map((hb, i) => { const w = OUTLINE_W[hb.type]; return html`<div class="ol-item"><i class=${i === active ? 'on' : ''} style=${`width:${w}px;margin-left:${16 - w}px`}></i></div>`; })}</div>
    ${open ? html`<div class="ol-pop"><div class="ol-pop-in">${heads.map((hb, i) => html`<a class=${'ol-row' + (i === active ? ' on' : '')} href="#" onClick=${(e) => { e.preventDefault(); const t = document.querySelector(`[data-block-id="${hb.id}"]`); if (t) t.scrollIntoView({ block: 'start', behavior: 'smooth' }); setActive(i); }}><div class="ol-row-in" style=${`margin-left:${LVL[hb.type] * 12}px`}><span>${plain(hb.title)}</span></div></a>`)}</div></div>` : ''}
  </div></div>`;
}
/* ------------------------------------------------------------------ toasts */
// Measured on live toasts: a 43px pill (11px 16px padding, 8px radius) centred 28px above the window bottom, sliding
// up 50px as it fades in; an optional action sits after the message in medium weight.
let toast = null; let toastTimer = 0;
function showToast(t) {
  clearTimeout(toastTimer); toast = { ...t, key: uid(), leaving: false }; refresh();
  toastTimer = setTimeout(() => { if (!toast) return; toast = { ...toast, leaving: true }; refresh(); toastTimer = setTimeout(() => { toast = null; refresh(); }, 200); }, 4000);
}
const copiedToast = () => showToast({ warn: true, text: 'Link copied, but only you can open it. Give people access before sharing.', action: 'Give access', onAction: () => { const b = document.querySelector('.tb-share'); if (b) openOverlay('share', b); } });
function Toast() {
  if (!toast) return null;
  const t = toast;
  return html`<div class="toast-wrap"><div class=${'toast' + (t.warn ? ' warn' : '') + (t.leaving ? ' out' : '')} key=${t.key}>
    <div class=${'toast-msg' + (t.action ? ' has-act' : '')}>${t.warn ? html`<${Icon} n="warning" cls="toast-warn"/>` : ''}<span>${t.text}</span></div>
    ${t.action ? html`<div class="toast-act" role="button" onClick=${() => { const fn = t.onAction; clearTimeout(toastTimer); toast = null; refresh(); if (fn) fn(); }}>${t.action}</div>` : ''}
  </div></div>`;
}
/* ------------------------------------------------------------------ map view */
// A map view keeps its tab and its "No place" menu; the map itself comes with the database work.
function MapView() {
  return html`<div class="mv-wrap"><div class="mv-map mv-soon">Maps are on the way. Rows with a place will show here.</div></div>`;
}
// Measured: "No place (n)" opens a 320px list of the rows that have no place yet, under a search box.
function NoPlaceMenu() {
  const r = overlay.r; const [q, setQ] = useState(''); const inRef = useRef(null);
  useEffect(() => { const t = setTimeout(() => inRef.current && inRef.current.focus(), 0); return () => clearTimeout(t); }, []);
  const rows = (S.rows[overlay.data.coll] || []).filter((x) => !q || (x.title || '').toLowerCase().includes(q.toLowerCase()));
  const open = (row) => { closeOverlay(); const pid = Object.keys(S.pages).find((k) => S.pages[k].rowOf && S.pages[k].rowOf.row === row.id); if (pid) go(pid); };
  return html`<div class="menu np-menu" role="menu" style=${`left:${r.left}px;top:${r.bottom + 4}px`}>
    <div class="pm-search"><div class="pm-search-in"><div class="pm-search-box"><input ref=${inRef} placeholder="Search for a page…" value=${q} onInput=${(e) => setQ(e.currentTarget.value)}/></div></div></div>
    <div class="menu-group">${rows.map((row) => html`<div class="mi" role="menuitem" onClick=${() => open(row)}><div class="mi-in"><div class="mi-ic np-ic"><${Icon} n="page" cls="i18"/></div><div class="mi-label">${row.title || 'Untitled'}</div></div></div>`)}</div>
  </div>`;
}
/* ------------------------------------------------------------------ block comments */
// Measured on a live block: choosing Comment slides the page 150px left, marks the block's text runs yellow, and hangs
// a 308px composer card 12px right of the text column, level with the block's first line.
let blockCmt = null; // { id } while a block's comment composer is open
const blockInPage = (id, pid) => { let b = S.blocks[id]; for (let i = 0; b && i < 50; i++) { if (b.parent === pid) return true; b = S.blocks[b.parent]; } return false; };
function openBlockComment(id) { blockCmt = { id }; picked = new Set(); commit(); }
function closeBlockComment() { if (!blockCmt) return; blockCmt = null; refresh(); }
function BlockCommentCard({ id }) {
  const ref = useRef(null); const edRef = useRef(null);
  const [txt, setTxt] = useState('');
  useLayoutEffect(() => {
    const card = ref.current; const lay = card && card.closest('.nsp-page-layout');
    const blk = document.querySelector(`[data-block-id="${id}"] [contenteditable]`) || document.querySelector(`[data-block-id="${id}"]`);
    if (card && lay && blk) card.style.top = (blk.getBoundingClientRect().top - lay.getBoundingClientRect().top) + 'px';
  });
  useEffect(() => {
    if (edRef.current) edRef.current.focus();
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target) && !(edRef.current && edRef.current.textContent.trim())) closeBlockComment(); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeBlockComment(); } };
    addEventListener('mousedown', onDown, true); addEventListener('keydown', onKey, true);
    return () => { removeEventListener('mousedown', onDown, true); removeEventListener('keydown', onKey, true); };
  }, []);
  const send = () => {
    const t = (edRef.current ? edRef.current.innerText : '').trim(); const b = S.blocks[id]; if (!t || !b) return;
    b.comments = [...(b.comments || []), { id: uid(), author: space.me.name, authorId: space.me.id, text: t, time: NOW() }]; touch(); blockCmt = null; commit();
  };
  return html`<div class="bc-card" ref=${ref}><div class="bc-row"><div class="pd-box"><div class="pd-edit-wrap"><div class="pd-edit" ref=${edRef} contenteditable="true" data-ph="Add a comment…" onInput=${(e) => setTxt(e.currentTarget.textContent)} onKeyDown=${(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}></div></div>
    <div class="pd-btns"><div class="pd-btn" role="button" aria-label="Attach file"><${Icon} n="paperClip" cls="i20"/></div><div class="pd-btn" role="button" aria-label="Mention a person, page, or date"><${Icon} n="at" cls="i20"/></div><div class=${'pd-btn send' + (txt.trim() ? ' on' : '')} role="button" aria-label="Send" onClick=${send}><${Icon} n="arrowUpCircleFill" cls="i24"/></div></div></div></div></div>`;
}
// Measured posted thread: a 308px bordered card 20px right of the composer's spot, its avatar row level with the block's
// first line; hovering it shows a 76px Add reaction | Resolve | More actions group.
const commentedBlocks = (page) => { const out = []; const walk = (ids) => (ids || []).forEach((id) => { const b = S.blocks[id]; if (!b) return; if (b.comments && b.comments.length && (!blockCmt || blockCmt.id !== id)) out.push(b); walk(b.children); }); walk(page.content); return out; };
function BlockThread({ b }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const card = ref.current; const lay = card && card.closest('.nsp-page-layout');
    const blk = document.querySelector(`[data-block-id="${b.id}"] [contenteditable]`) || document.querySelector(`[data-block-id="${b.id}"]`);
    if (card && lay && blk) card.style.top = (blk.getBoundingClientRect().top - lay.getBoundingClientRect().top - 13.5) + 'px';
  });
  const resolve = () => { b.resolvedComments = [...(b.resolvedComments || []), ...b.comments]; b.comments = []; touch(); commit(); };
  return html`<div class="bt-card" ref=${ref}><div class="bt-in">${b.comments.map((c) => html`<div class="bt-item">
    <div class="bt-head"><div class="pd-avatar"><img src=${space.avatar(c.authorId)} alt=""/></div><div class="bt-name">${c.author}</div><div class="bt-time">${relTime(c.time)}</div></div>
    <div class="bt-text">${c.text}</div></div>`)}</div>
    <div class="bt-acts"><div class="bt-btn" role="button" aria-label="Add reaction"><${Icon} n="cmtReact" cls="bt-ic"/></div><div class="bt-btn" role="button" aria-label="Resolve" onClick=${resolve}><${Icon} n="cmtResolve" cls="bt-ic"/></div><div class="bt-btn" role="button" aria-label="More actions"><${Icon} n="cmtMore" cls="bt-ic"/></div></div>
  </div>`;
}
/* ------------------------------------------------------------------ empty page */
// Measured on a brand-new page: a "Get started with" strip 54px above the frame bottom, four 32px pills and a round
// more button whose menu turns the page into a database, a form or a view, or imports.
const GsBulb = () => html`<${Icon} n="bulb" cls="gs-ic"/>`;
const GsTemplates = () => html`<${Icon} n="templates" cls="gs-ic"/>`;
const GsMeeting = () => html`<${Icon} n="meeting" cls="gs-ic"/>`;
// A new database starts the way a blank one should: a Name column and a Tags column, one view.
function makeDatabaseParts(type, name) {
  const cid = uid(); const vid = uid(); const tags = propId();
  S.collections[cid] = { id: cid, schema: { title: { name: 'Name', type: 'title' }, [tags]: { name: 'Tags', type: 'multi_select', options: [] } } };
  S.views[vid] = { id: vid, type, name, format: { table_properties: [{ property: 'title', visible: true, width: 280 }, { property: tags, visible: true, width: 200 }] } };
  S.rows[cid] = [];
  return { cid, vid };
}
function pageToDatabase(page, type, name) {
  const { cid, vid } = makeDatabaseParts(type, name);
  Object.assign(page, { kind: 'database', description: '', hideDescription: true, collection: cid, views: [vid], lastEdited: NOW() });
  commit();
}
function pageToMeeting(page) { const tb = newBlock('transcription', [], page.id); page.content.push(tb.id); page.lastEdited = NOW(); commit(); }
// Measured: the strip lays out Start a draft, Research a topic, Templates, AI Meeting Notes, Database, Form, Table...
// in one row as wide as the text column; whatever does not fit (plus Import) moves into the round more menu.
const GS_ITEMS = [...(READY.ai ? [['bulb', 'Start a draft', 'draft'], ['bulb', 'Research a topic', 'research']] : []), ['tpl', 'Templates', 'tpl'], ...(READY.meetings ? [['meet', 'AI Meeting Notes', 'meeting']] : []), ['viewTable', 'Database', 'db:table:Default view'], ['docPlainText', 'Form', 'db:form:Form'], ['viewTable', 'Table', 'db:table:Table'], ['viewBoard', 'Board', 'db:board:Board'], ['bulletedList', 'List', 'db:list:List'], ['viewTimeline', 'Timeline', 'db:timeline:Timeline'], ['viewCalendar', 'Calendar', 'db:calendar:Calendar view'], ['squareGrid2X2', 'Gallery', 'db:gallery:Gallery']];
const gsIcon = (ic) => (ic === 'bulb' ? GsBulb() : ic === 'tpl' ? GsTemplates() : ic === 'meet' ? GsMeeting() : html`<${Icon} n=${ic} cls="gs-ic"/>`);
const gsRun = (page, act) => { if (act === 'draft') startDraft(page); else if (act === 'research') startResearch(page); else if (act === 'tpl') go('marketplace'); else if (act === 'meeting') pageToMeeting(page); else if (act.startsWith('db:')) { const [, type, name] = act.split(':'); pageToDatabase(page, type, name); } };
function GetStarted({ page }) {
  const rowRef = useRef(null); const measRef = useRef(null);
  const [fit, setFit] = useState(4);
  useLayoutEffect(() => {
    const row = rowRef.current; const meas = measRef.current; if (!row || !meas) return;
    const avail = row.getBoundingClientRect().width; const ws = [...meas.children].map((c) => c.getBoundingClientRect().width);
    let used = 32; let n = 0; while (n < ws.length && used + ws[n] + 8 <= avail) { used += ws[n] + 8; n++; }
    if (n !== fit) setFit(n);
  });
  const pill = ([ic, label, act], i) => html`<div class="gs-pill" role="button" key=${label} onClick=${() => gsRun(page, act)}>${gsIcon(ic)}<span>${label}</span></div>`;
  return html`<div class="gs-wrap"><div class="gs-label">Get started with</div><div class="gs-row" ref=${rowRef}>
    ${GS_ITEMS.slice(0, fit).map(pill)}
    ${GS_ITEMS.length > fit || READY.importExport ? html`<div class="gs-pill gs-more" role="button" onClick=${(e) => openOverlay('gsMore', e.currentTarget, { pid: page.id, from: fit })}><${Icon} n="ellipsis20" as="ellipsis" cls="i20"/></div>` : ''}
    <div class="gs-measure" ref=${measRef} aria-hidden="true">${GS_ITEMS.map(pill)}</div>
  </div></div>`;
}
// Measured: a 200px card 4px above the round button, 28px rows (8px/10px inset, 8px gap), a hairline, then Import.
function GetStartedMore() {
  const r = overlay.r; const page = S.pages[overlay.data.pid]; const rest = GS_ITEMS.slice(overlay.data.from || 4);
  const go = (act) => () => { closeOverlay(); if (page) gsRun(page, act); };
  return html`<div class="menu gs-menu" role="menu" style=${`left:${r.left}px;bottom:${innerHeight - r.top + 4}px`}>
    ${rest.map(([ic, label, act]) => html`<div class="gs-mi" role="menuitem" onClick=${go(act)}>${ic === 'bulb' ? GsBulb() : ic === 'tpl' ? GsTemplates() : ic === 'meet' ? GsMeeting() : html`<${Icon} n=${ic} cls="i20"/>`}<span>${label}</span></div>`)}
    ${READY.importExport ? html`${rest.length ? html`<div class="gs-div"></div>` : ''}<div class="gs-mi" role="menuitem" onClick=${closeOverlay}><${Icon} n="arrowLineDown" cls="i20"/><span>Import</span></div>` : ''}
  </div>`;
}
// A page this person can only view or comment on: nothing typed, pasted or dropped reaches it. Moving around, selecting
// and copying still work.
const stopEdit = (e) => { e.preventDefault(); e.stopPropagation(); };
const stopKeys = (e) => {
  const moves = e.key.startsWith('Arrow') || e.key.startsWith('Page') || ['Home', 'End', 'Escape', 'Tab', 'Shift', 'Meta', 'Control', 'Alt'].includes(e.key);
  const copies = (e.metaKey || e.ctrlKey) && ['c', 'a', 'f'].includes(e.key.toLowerCase());
  if (!moves && !copies) stopEdit(e);
};
function Page({ page }) {
  const titleRef = useRef(null);
  useLayoutEffect(() => {
    const el = titleRef.current; if (!el || document.activeElement === el) return;
    if (pendingTitleFocus === page.id) { pendingTitleFocus = null; setTimeout(() => el.focus(), 0); }
    const want = page.titleMention ? esc(page.title) + `<span class="nsp-text-mention-token" contenteditable="false"><span class="mention-at">@</span><span class="mention-date">${esc(page.titleMention)}</span></span>` : null;
    if (want !== null) { if (el.innerHTML !== want) el.innerHTML = want; } else if (el.textContent !== page.title) el.textContent = page.title;
  });
  const onKey = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const first = page.content[0];
    if (first && S.blocks[first] && TEXTUAL.has(S.blocks[first].type)) focusLater(first, 0);
    else { const nb = newBlock('text', [], page.id); page.content.unshift(nb.id); focusLater(nb.id, 0); }
    commit();
  };
  const st = page.style || {};
  const editable = space.canEdit(page.id);
  const gsEmpty = editable && page.kind !== 'database' && page.kind !== 'stub' && !page.rowOf && !(page.content || []).length;
  const cmtHere = !!(blockCmt && blockInPage(blockCmt.id, page.id));
  const threads = commentedBlocks(page);
  return html`${page.cover ? html`<${Cover} page=${page}/>` : ''}<div class=${'nsp-page-layout' + (gsEmpty ? ' gs-empty' : '') + (cmtHere || threads.length ? ' cmt-open' : '') + (st.full ? ' full' : '') + (st.small ? ' small' : '') + (st.font && st.font !== 'default' ? ' font-' + st.font : '')}>
    <div class=${'page-header' + (hasIcon(page) ? '' : ' noicon') + (page.cover ? ' hascover' : '')}>
      ${hasIcon(page) ? html`<div class="nsp-record-icon page-icon" role="button" onClick=${(e) => openOverlay('iconPicker', e.currentTarget, { pageId: page.id })}><div class="page-icon-in"><${PageIcon} ic=${page.icon} size=${78}/></div></div>` : ''}
      <div class="nsp-page-controls page-controls">${hasIcon(page) ? '' : html`<button onClick=${(e) => addRandomIcon(page, e.currentTarget.closest('.page-header'))}><${Icon} n="emojiFaceFill" cls="i14"/><span>Add icon</span></button>`}${page.cover ? '' : html`<button onClick=${() => addRandomCover(page)}><${Icon} n="photoFill" cls="i14"/><span>Add cover</span></button>`}${commentOpen === page.id ? '' : html`<button onClick=${() => openComment(page)}><${Icon} n="commentFilledFill" cls="i14"/><span>Add comment</span></button>`}</div>
      <h1 ref=${titleRef} class="nsp-page-block-title" contenteditable=${editable ? 'true' : 'false'} spellcheck="true" data-ph="New page" onInput=${(e) => { page.title = e.currentTarget.textContent; page.lastEdited = NOW(); if (page.rowOf) { const rr = (S.rows[page.rowOf.coll] || []).find((x) => x.id === page.rowOf.row); if (rr) rr.title = page.title; } persist(); refresh(); }} onKeyDown=${onKey}></h1>
    </div>
    ${commentOpen === page.id || (page.comments && page.comments.length) ? html`<${PageDiscussion} key=${'d' + page.id} page=${page}/>` : ''}${page.rowOf ? html`<${RowProps} page=${page}/>` : ''}${editable ? '' : html`<div class="role-banner">${space.roleOf(page.id) === 'comment' ? 'You can comment on this page.' : 'You can view this page.'}</div>`}<div class="nsp-page-content" onBeforeInputCapture=${editable ? null : stopEdit} onPasteCapture=${editable ? null : stopEdit} onDropCapture=${editable ? null : stopEdit} onKeyDownCapture=${editable ? null : stopKeys}><${Children} ids=${page.content}/></div>${gsEmpty ? html`<${GetStarted} page=${page}/>` : ''}${cmtHere ? html`<${BlockCommentCard} key=${blockCmt.id} id=${blockCmt.id}/>` : ''}${threads.map((b) => html`<${BlockThread} key=${'t' + b.id} b=${b}/>`)}
  </div>`;
}

/* ------------------------------------------------------------------ database */
const PROP_MASK = { title: 'font', status: 'burst', select: 'arrowCircleDown', multi_select: 'list', date: 'calendar' };
// [background, text, dot] per option colour, read from the live pills.
// [background, text, dot] per option colour, from the theme tokens, so pills follow light and dark mode.
const OPT = {
  default: ['var(--ca-graBacTerTra)', 'var(--c-graTexPri)', 'var(--c-graTexAccPri)'], gray: ['var(--ca-graBacTerTra)', 'var(--c-graTexPri)', 'var(--c-graTexAccPri)'],
  blue: ['var(--ca-bluBacTerTra)', 'var(--c-bluTexPri)', 'var(--c-bluTexAccPri)'], green: ['var(--ca-greBacTerTra)', 'var(--c-greTexPri)', 'var(--c-greTexAccPri)'],
  red: ['var(--ca-redBacTerTra)', 'var(--c-redTexPri)', 'var(--c-redTexAccPri)'], yellow: ['var(--ca-yelBacTerTra)', 'var(--c-yelTexPri)', 'var(--c-yelTexAccPri)'],
  purple: ['var(--ca-purBacTerTra)', 'var(--c-purTexPri)', 'var(--c-purTexAccPri)'], orange: ['var(--ca-oraBacTerTra)', 'var(--c-oraTexPri)', 'var(--c-oraTexAccPri)'],
  brown: ['var(--ca-broBacTerTra)', 'var(--c-broTexPri)', 'var(--c-broTexAccPri)'], pink: ['var(--ca-pinBacTerTra)', 'var(--c-pinTexPri)', 'var(--c-pinTexAccPri)'],
};
const fmtDate = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '');
const fmtDateTime = (ms) => `${new Date(ms).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: TZ })} ${new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ })}`;
const fmtNum = (v, f) => { if (v === undefined || v === null || v === '') return ''; if (f === 'dollar') return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' }); if (f === 'number_with_commas') return v.toLocaleString('en-US'); return String(v); };
function HeaderCell({ c, p }) {
  const mask = MASKS[PROP_MASK[p.type]] || MASKS.list;
  return html`<div class="nsp-table-view-header-cell" style=${`width:${c.width}px`}><div class="th" role="button" onClick=${(e) => openOverlay('propMenu', e.currentTarget, { pid: c.property })}><div class="th-inner"><div class="th-icon"><div class="th-icon-box"><div class="th-mask" style=${`-webkit-mask-image:url("${mask}");mask-image:url("${mask}")`}></div></div></div><div class="th-text">${p.name}</div></div></div></div>`;
}
function Cell({ row, pid, prop, col }) {
  const v = row[pid];
  const open = (kind) => (e) => openOverlay(kind, e.currentTarget, { rowId: row.id, pid });
  const td = (pad, inner, onClick) => html`<div class=${'nsp-table-view-cell' + (col.wrap ? ' wrap' : '')} style=${`width:${col.width}px`} onClick=${onClick}><div class=${'td ' + pad}>${inner}</div></div>`;
  const opt = (name) => (prop.options || []).find((o) => o.value === name);
  const pill = (o, status) => { const [bg, fg, dot] = OPT[o.color] || OPT.default; return html`<div class=${'pill ' + (status ? 'status' : 'sel')} style=${`background:${bg};color:${fg}`}>${status ? html`<div class="dot" style=${`background:${dot}`}></div>` : ''}<span>${o.value}</span></div>`; };
  switch (prop.type) {
    case 'title': return td('p75', html`<div class="tt"><div class="tt-ic"><div class="tt-ic-box"><${Icon} n="pageEmpty" cls="i18"/></div></div><div class="tt-text"><span>${v}</span></div><div class=${'tt-open' + (peekRow === row.id ? ' on' : '')} role="button" onClick=${(e) => { e.stopPropagation(); closeOverlay(); openRow(row); }}><div class="tt-open-in"><${Icon} n="peekSide" cls="i16"/><span>${peekRow === row.id ? 'CLOSE' : 'Open'}</span></div></div></div>`, open('cellText'));
    case 'status': { const o = opt(v); return td('p8', o ? html`<div class="pills">${pill(o, true)}</div>` : '', open('cellSelect')); }
    case 'select': { const o = opt(v); return td('p8', o ? html`<div class="pills">${pill(o, false)}</div>` : '', open('cellSelect')); }
    case 'multi_select': return td('p8', html`<div class="pills">${(v || []).map((x) => opt(x)).filter(Boolean).map((o) => pill(o, false))}</div>`, open('cellSelect'));
    case 'date': return td('p75', fmtDate(v), open('cellDate'));
    case 'number': return td('p75 td-num', fmtNum(v, prop.number_format), open('cellText'));
    case 'checkbox': return td('p10', html`<div class=${'cb' + (v ? ' on' : '')} role="checkbox" onClick=${() => { row[pid] = !v; commit(); }}>${v ? html`<${Icon} n="checkmarkFillSmall" cls="tick"/>` : ''}</div>`);
    case 'auto_increment_id': return td('p75', v ? `${prop.prefix}-${v}` : '');
    case 'created_time': return td('p75', fmtDateTime(row.created || NOW()));
    case 'last_edited_time': return td('p75', fmtDateTime(row.edited || row.created || NOW()));
    case 'formula': return td('p75 td-num', '');
    case 'person': return td('p75', (v || []).map((x) => space.personName(x) || x).join(', '), open('cellPerson'));
    case 'files': return td('p75', html`<div class="file-chips">${(Array.isArray(v) ? v : []).map((f) => html`<span class="file-chip">${(f && f.name) || 'File'}</span>`)}</div>`, open('cellFiles'));
    default: return td('p75', v || '', ['text', 'url', 'email', 'phone_number'].includes(prop.type) ? open('cellText') : undefined);
  }
}
function Database({ page }) {
  const coll = S.collections[page.collection]; const vid = page.activeView && page.views.includes(page.activeView) ? page.activeView : page.views[0]; const view = S.views[vid]; const rows = S.rows[page.collection];
  // A task opened from My Tasks or the inbox peeks its row as soon as this database's rows are here.
  useEffect(() => { if (peekAfterLoad && (rows || []).some((r) => r.id === peekAfterLoad)) { peekRow = peekAfterLoad; peekAfterLoad = null; refresh(); } });
  const cols = view.format.table_properties.filter((c) => c.visible && coll.schema[c.property]);
  const shown = viewRows(rows, coll, view);
  const gprop = (view.type || 'table') === 'table' && view.group_by && coll.schema[view.group_by] && groupable(coll.schema[view.group_by].type) ? coll.schema[view.group_by] : null;
  const groups = gprop ? groupRows(shown, view.group_by, gprop).map((g) => ({ ...g, option: (gprop.options || []).find((o) => o.value === g.value) })) : null;
  const collapsed = new Set(Array.isArray(view.collapsed) ? view.collapsed : []);
  const toggleGroup = (key) => { const next = collapsed.has(key) ? [...collapsed].filter((k) => k !== key) : [...collapsed, key]; if (next.length) view.collapsed = next; else delete view.collapsed; commit(); };
  const groupPill = (o) => { const [bg, fg, dot] = OPT[o.color] || OPT.default; const status = gprop.type === 'status'; return html`<div class=${'pill ' + (status ? 'status' : 'sel')} style=${`background:${bg};color:${fg}`}>${status ? html`<div class="dot" style=${`background:${dot}`}></div>` : ''}<span>${o.value}</span></div>`; };
  const tableRow = (r) => html`<div class=${'nsp-table-view-row' + (dbSel.has(r.id) ? ' sel' : '')} key=${r.id} data-row-id=${r.id}><div class="row-gutter"><div class="blk-plus" role="button" data-tip-html=${TIP_PLUS} onClick=${() => { const i = rows.indexOf(r); rows.splice(i + 1, 0, newRow(view, coll)); commit(); }}><${Icon} n="plus" cls="i20"/></div><div class="blk-drag" role="button" data-tip-html=${TIP_DRAG} onMouseDown=${(e) => rowDragDown(e, rows, r, view)}><${Icon} n="dragHandle" cls="i20"/></div><div class=${'row-check' + (dbSel.has(r.id) ? ' on' : '')} role="checkbox" onClick=${() => { if (dbSel.has(r.id)) dbSel.delete(r.id); else dbSel.add(r.id); refresh(); }}>${dbSel.has(r.id) ? html`<${Icon} n="checkmarkFillSmall" cls="tick"/>` : ''}</div></div>${cols.map((c) => html`<${Cell} row=${r} pid=${c.property} prop=${coll.schema[c.property]} col=${c}/>`)}</div>`;
  const calcRow = (list) => html`<div class="db-calc-row">${cols.map((c) => { const res = c.calc ? calculate(c.calc, list, c.property, coll.schema[c.property], filterCtx) : null; return html`<div class=${'db-calc' + (res ? ' on' : '')} style=${`width:${c.width}px`} role="button" data-calc=${c.property} onClick=${(e) => openOverlay('calcMenu', e.currentTarget, { pid: c.property })}>${res ? html`<span class="calc-label">${res.label}</span><span class="calc-value">${res.value}</span>` : html`<span class="calc-hint">Calculate</span>`}</div>`; })}</div>`;
  // Measured: a map view's toolbar drops Sort.
  const tools = [['filterSmall', 'nsp-collection-filter'], ['arrowUpDownSmall', 'nsp-collection-sort'], ...(READY.automations ? [['lightningSmall', 'nsp-collection-automation-edit-view']] : []), ...(READY.ai ? [['magicWandSmall', '']] : []), ['magnifyingGlassSmall', 'nsp-collection-search'], ['slidersSmall', 'nsp-collection-edit-view']].filter((t) => !(view.type === 'map' && t[0] === 'arrowUpDownSmall'));
  return html`<div class="db-page">
    <div class=${'db-head has-ctl' + (page.hideDescription ? ' no-desc' : '')}><div class="db-head-inner">
      <div class="db-controls">${hasIcon(page) ? '' : html`<button onClick=${(e) => addRandomIcon(page, e.currentTarget.closest('.db-head'))}><${Icon} n="emojiFaceFill" cls="i14"/><span>Add icon</span></button>`}<button><${Icon} n="photoFill" cls="i14"/><span>Add cover</span></button><button onClick=${() => { page.hideDescription = !page.hideDescription; commit(); }}><${Icon} n="infoCircleFill" cls="i14"/><span>${page.hideDescription ? 'Add description' : 'Hide description'}</span></button></div>
      <div class="db-title-row">${hasIcon(page) ? html`<div class="nsp-record-icon db-icon" role="button" onClick=${(e) => openOverlay('iconPicker', e.currentTarget, { pageId: page.id })}><${PageIcon} ic=${page.icon} size=${36}/></div>` : ''}<h1 class="db-title" contenteditable="true" spellcheck="true" data-ph="New database" onInput=${(e) => { page.title = e.currentTarget.textContent; persist(); }}>${page.title}</h1></div>${page.hideDescription ? '' : html`<div class="db-desc">${page.description}</div>`}</div></div>
    <div class=${'db-bar' + (view.type === 'form' ? ' formbar' : '')}>
      <div class="db-tabs">${page.views.map((id) => { const vw = S.views[id]; const on = id === vid; return S.renamingView === id ? html`<div class="nsp-collection-view-tab-button db-tab"><${Icon} n=${VIEW_ICON[vw.type] || 'viewTable'} cls="i20"/><input class="db-tab-input" value=${vw.name} ref=${(el) => { if (el && document.activeElement !== el) { el.focus(); el.select(); } }} onKeyDown=${(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); vw.name = e.currentTarget.value || vw.name; S.renamingView = null; commit(); } }} onBlur=${(e) => { if (S.renamingView !== id) return; vw.name = e.currentTarget.value || vw.name; S.renamingView = null; commit(); }}/></div>` : html`<div class=${'nsp-collection-view-tab-button db-tab' + (on ? '' : ' off')} role="button" onClick=${(e) => { if (on) openOverlay('viewMenu', e.currentTarget, { vid: id }); else { page.activeView = id; commit(); } }}><${Icon} n=${VIEW_ICON[vw.type] || 'viewTable'} cls="i20"/><span class="lbl">${vw.name}</span></div>`; })}<div class="db-addview" role="button" aria-label="Add view" onClick=${(e) => openOverlay('addView', e.currentTarget)}><${Icon} n="plusSmall" cls="i16"/></div></div>${dbSel.size ? html`<div class="db-selbar"><span class="db-selcount">${dbSel.size} selected</span><div class="db-selbtn" role="button" onClick=${() => { const keep = rows.filter((x) => !dbSel.has(x.id)); rows.splice(0, rows.length, ...keep); dbSel.clear(); commit(); }}><${Icon} n="trash" cls="i16"/></div><div class="db-selbtn" role="button" onClick=${() => { dbSel.clear(); refresh(); }}><${Icon} n="xMarkSmall" cls="i16"/></div></div>` : ''}
      <div class="db-tools">${view.type === 'map' ? html`<div class="db-noplace" role="button" onClick=${(e) => openOverlay('noPlace', e.currentTarget, { coll: page.collection })}>No place (${rows.length})</div>` : ''}${view.type === 'form' ? html`<div class="form-tools">${READY.automations ? html`<div class="ft-ic" role="button" aria-label="Automations"><${Icon} n="lightningSmall" cls="i16"/></div>` : ''}${READY.ai ? html`<div class="ft-ic" role="button" aria-label="AI Autofill"><${Icon} n="magicWandSmall" cls="i16"/></div>` : ''}<div class="ft-ic" role="button" aria-label="Edit form, add questions and more…" onClick=${() => { viewSettings = viewSettings ? null : { vid }; refresh(); }}><${Icon} n="slidersSmall" cls="i16"/></div>${space.canEdit(page.id) ? html`<div class="ft-preview" role="button" onClick=${() => { if (formPreview.has(view.id)) formPreview.delete(view.id); else formPreview.add(view.id); refresh(); }}><${Icon} n="eye" cls="i20"/><span>${formPreview.has(view.id) ? 'Edit form' : 'Preview'}</span></div>` : ''}${READY.publish ? html`<div class="ft-share" role="button">Share form</div>` : ''}</div>` : ''}${(view.type === 'calendar' || view.type === 'timeline') && viewRows(rows, coll, view).some((x) => { const dp = datePropOf(view, coll); return dp && !x[dp]; }) ? html`<div class="cal-nodate" role="button" onClick=${(e) => openOverlay('noDate', e.currentTarget, { vid })}>No date (${viewRows(rows, coll, view).filter((x) => { const dp = datePropOf(view, coll); return dp && !x[dp]; }).length})</div>` : ''}${tools.map(([n, c]) => c === 'nsp-collection-search' && dbSearchOpen.has(view.id) ? html`<div class="db-search"><${Icon} n="magnifyingGlassSmall" cls="i16"/><input placeholder="Type to search…" value=${dbSearch.get(view.id) || ''} ref=${(el) => { if (el && !el.dataset.on) { el.dataset.on = '1'; el.focus(); } }} onInput=${(e) => { dbSearch.set(view.id, e.currentTarget.value); refresh(); }} onBlur=${(e) => { if (!e.currentTarget.value) { dbSearchOpen.delete(view.id); refresh(); } }} onKeyDown=${(e) => { if (e.key === 'Escape') { e.stopPropagation(); dbSearch.delete(view.id); dbSearchOpen.delete(view.id); refresh(); } }}/></div>` : html`<div class=${'db-tool ' + c} role="button" onClick=${(e) => { if (c === 'nsp-collection-sort' && liveSorts(view, coll).length) openOverlay('sortEditor', document.querySelector('[data-sorts]') || e.currentTarget, {}); else if (c === 'nsp-collection-sort' || c === 'nsp-collection-filter') openOverlay('propPicker', e.currentTarget, { mode: c.endsWith('sort') ? 'sort' : 'filter' }); if (c === 'nsp-collection-edit-view') { viewSettings = viewSettings ? null : { vid }; refresh(); } if (c === 'nsp-collection-search') { dbSearchOpen.add(view.id); refresh(); } }}><${Icon} n=${n} cls="i16"/></div>`)}<div class="nsp-collection-view-item-add db-new"><div class="db-new-main" role="button" onClick=${() => { rows.unshift(newRow(view, coll)); commit(); }}>New</div><div class="db-new-more" role="button" onClick=${(e) => openOverlay('newMenu', e.currentTarget)}><${Icon} n="chevronDown20" as="arrowChevronSingleDownFill" cls="i16"/></div></div></div>
    </div>
    ${liveSorts(view, coll).length || (view.filters || []).length ? html`<div class="db-sortbar">${(view.filters || []).map((f) => { const fp = coll.schema[f.pid]; const fm = (fp && MASKS[PROP_MASK[fp.type]]) || MASKS.list; return html`<div class=${'db-chip db-fchip' + (filterReady(f, fp) ? '' : ' idle')} role="button" data-filter=${f.id} onClick=${(e) => openOverlay('filterEditor', e.currentTarget, { fid: f.id })}><div class="th-mask db-fmask" style=${`-webkit-mask-image:url("${fm}");mask-image:url("${fm}")`}></div><span>${describeFilter(f, fp, (id) => space.personName(id))}</span><${Icon} n="arrowChevronSingleDownSmall" cls="i12"/></div>`; })}${liveSorts(view, coll).length ? html`<div class="db-chip" role="button" data-sorts="1" onClick=${(e) => openOverlay('sortEditor', e.currentTarget, {})}><${Icon} n=${liveSorts(view, coll).length > 1 ? 'arrowUpDown' : liveSorts(view, coll)[0].dir === 'desc' ? 'arrowStraightDown' : 'arrowStraightUp'} cls="i14"/><span>${describeSorts(sortsOf(view), coll.schema)}</span><${Icon} n="arrowChevronSingleDownSmall" cls="i12"/></div>` : ''}</div>` : ''}
    ${viewSettings && S.views[viewSettings.vid] && page.views.includes(viewSettings.vid) ? (viewSettings.chartEdit ? html`<${ChartSettings} page=${page} coll=${coll} vid=${viewSettings.vid}/>` : html`<${ViewSettings} page=${page} coll=${coll} vid=${viewSettings.vid}/>`) : ''}
    ${view.type === 'board' ? html`<${BoardView} page=${page} coll=${coll} view=${view} rows=${rows}/>` : view.type === 'gallery' ? html`<${GalleryView} coll=${coll} view=${view} rows=${rows}/>` : view.type === 'list' ? html`<${ListView} coll=${coll} view=${view} rows=${rows}/>` : view.type === 'calendar' ? html`<${CalendarView} coll=${coll} view=${view} rows=${rows}/>` : view.type === 'timeline' ? html`<${TimelineView} coll=${coll} view=${view} rows=${rows}/>` : view.type === 'feed' ? html`<${FeedView} coll=${coll} view=${view} rows=${rows}/>` : view.type === 'chart' ? html`<${ChartView} coll=${coll} view=${view} rows=${rows}/>` : view.type === 'dashboard' ? html`<${DashboardView}/>` : view.type === 'form' ? html`<${FormView} coll=${coll} view=${view}/>` : view.type === 'map' ? html`<${MapView} coll=${coll} view=${view} rows=${rows}/>` : html`
    <div class=${'nsp-table-view' + (view.lines === false ? ' nolines' : '') + (view.hideIcon ? ' noicon' : '') + (view.wrapAll ? ' wrapall' : '')}>
      <div class="nsp-table-view-header-row">${cols.map((c) => html`<${HeaderCell} c=${c} p=${coll.schema[c.property]}/>`)}</div>
      ${groups ? groups.map((g) => html`<div class="tg" key=${'g:' + g.key}>
        <div class="tg-head"><div class=${'tg-caret' + (collapsed.has(g.key) ? '' : ' open')} role="button" aria-label=${collapsed.has(g.key) ? 'Show group' : 'Hide group'} onClick=${() => toggleGroup(g.key)}><${Icon} n="arrowChevronSingleRightSmall" cls="i16"/></div><div class="tg-label">${g.option ? groupPill(g.option) : html`<span class="board-none">${g.label}</span>`}</div><div class="board-count">${g.rows.length}</div></div>
        ${collapsed.has(g.key) ? '' : html`${g.rows.map(tableRow)}<div class="db-add"><div class="nsp-table-view-add-row" role="button" onClick=${() => { rows.push({ ...newRow(view, coll), [view.group_by]: g.value === null ? undefined : g.value }); commit(); }}><span><${Icon} n="plusSmall" cls="i16"/>New page</span></div></div>${calcRow(g.rows)}`}
      </div>`) : html`${shown.map(tableRow)}<div class="db-add"><div class="nsp-table-view-add-row" role="button" onClick=${() => { rows.push(newRow(view, coll)); commit(); }}><span><${Icon} n="plusSmall" cls="i16"/>New page</span></div></div>${calcRow(shown)}`}
    </div>`}
  </div>`;
}

/* ------------------------------------------------------------------ chrome */
function RowIcon({ page }) {
  const ic = page.icon;
  if (ic && ic.emoji) return html`<${Emoji} e=${ic.emoji} size=${18} weight=${500}/>`;
  if (ic && ic.name) return html`<${PageIcon} ic=${ic} size=${18}/>`;
  if (ic && ic.img) return html`<img class="sb-img" src=${space.fileUrl(ic.img)} alt=""/>`;
  if (ic && ic.svg === 'viewTable') return html`<${Icon} n="viewTable" cls="i20"/>`;
  return html`<${Icon} n="page" cls="i18"/>`;
}
const SECTION_DEFS = [
  ...(READY.meetings ? [{ key: 'meetings', label: 'Meetings', actions: ['ellipsisSmall'] }] : []),
  { key: 'recents', label: 'Recents', actions: ['ellipsisSmall'] },
  // Favorites, Shared and Workspace appear only once they hold something.
  { key: 'favorites', label: 'Favorites', actions: ['ellipsisSmall'] },
  { key: 'shared', label: 'Shared', actions: ['ellipsisSmall'] },
  { key: 'workspace', label: 'Workspace', actions: ['plusSmall', 'ellipsisSmall'] },
  ...(READY.ai ? [{ key: 'agents', label: 'Agents', actions: ['arrowDiagonalUpRightSmall', 'ellipsisSmall'] }] : []),
  { key: 'private', label: 'Private', actions: ['arrowDiagonalUpRightSmall', 'plusSmall', 'ellipsisSmall'] },
  { key: 'apps', label: 'Apps', actions: ['ellipsisSmall'] },
];
// Canvas, Study and Calendar belong to the React app; choosing one keeps the sidebar and hands over the main column.
// The old Library stays one click away until its notes move into pages (docs/space/PLAN.md, M10).
const APPS = [['appCanvas', 'Canvas', '/canvas'], ['appStudy', 'Study', '/study'], ['appCalendar', 'Calendar', '/calendar'], ['bookshelf', 'Old Library', '/library/classic']];
function subPagesOf(pid) { return space.childPages(pid); }
let pendingTitleFocus = null;
function createPage(parent, section) {
  const pid = uid();
  S.pages[pid] = { id: pid, kind: 'page', icon: null, title: '', content: [], lastEdited: NOW(), parent: parent || null, ...(parent ? {} : { section: section || 'private' }) };
  const link = () => { const par = S.pages[parent]; if (!par || !par.content || par.content.some((x) => S.blocks[x] && S.blocks[x].pageId === pid)) return; const b = newBlock('page', [], parent); b.pageId = pid; par.content.push(b.id); };
  if (parent && S.pages[parent] && S.pages[parent].content) { link(); S.sidebar.expanded = { ...(S.sidebar.expanded || {}), [parent]: true }; }
  else if (parent) { space.addChild(parent, pid); S.sidebar.expanded = { ...(S.sidebar.expanded || {}), [parent]: true }; space.ensurePage(parent).then(() => { link(); commit(); }); }
  else (section === 'workspace' ? S.sidebar.workspace : S.sidebar.private).unshift(pid);
  S.recents = [pid, ...S.recents.filter((x) => x !== pid)]; recentPin = pid;
  pendingTitleFocus = pid; commit(); go(pid); return pid;
}
function trashPage(pid) {
  const p = S.pages[pid]; if (!p || p.kind === 'stub') return;
  const drop = (id) => { subPagesOf(id).forEach((k) => { drop(k); S.pages[k].trashed = NOW(); S.recents = S.recents.filter((x) => x !== k); S.sidebar.private = S.sidebar.private.filter((x) => x !== k); }); };
  drop(pid);
  p.trashed = NOW();
  S.sidebar.private = S.sidebar.private.filter((x) => x !== pid); S.sidebar.workspace = S.sidebar.workspace.filter((x) => x !== pid); S.recents = S.recents.filter((x) => x !== pid);
  S.trash = [pid, ...(S.trash || []).filter((x) => x !== pid)];
  const cur = S.pages[route()];
  if (route() === pid || (cur && cur.trashed)) go(p.parent && S.pages[p.parent] ? p.parent : 'home');
  commit();
  showToast({ text: 'Moved to Trash', action: 'Restore', onAction: () => restorePage(pid) });
}
const ancestorsOf = (page) => { const out = []; let cur = page.parent ? S.pages[page.parent] : null; while (cur) { out.unshift(cur); cur = cur.parent ? S.pages[cur.parent] : null; } return out; };
function PageRow({ pid, current, depth }) {
  const p = S.pages[pid]; if (!p || p.trashed) return null;
  const d = depth || 0; const open = !!(S.sidebar.expanded && S.sidebar.expanded[pid]); const kids = open ? subPagesOf(pid) : [];
  const toggle = (e) => { e.stopPropagation(); e.preventDefault(); if (!open) space.ensureChildren(pid); S.sidebar.expanded = { ...(S.sidebar.expanded || {}), [pid]: !open }; commit(); };
  const label = titlePartsOf(p) || [p.title || (p.kind === 'database' ? 'New database' : 'New page')];
  return html`<a class=${'sb-item page' + (pid === current ? ' active' : '')} onClick=${() => { if (p.kind !== 'stub') go(pid); }}><div class="sb-item-inner" style=${d ? `padding-left:${8 + d * 8}px` : ''}><div class="sb-item-icon"><span class="sb-ic-page"><${RowIcon} page=${p}/></span><span class=${'sb-ic-tog' + (open ? ' open' : '')} role="button" aria-label="Open" onClick=${toggle}><${Icon} n="arrowChevronSingleDownFillSmall" cls="i12"/></span></div><div class="sb-item-label">${label.map((t) => html`<span>${t}</span>`)}</div><div class="sb-row-actions"><div class="sb-act" role="button" aria-label="Add a page inside" onClick=${(e) => { e.stopPropagation(); e.preventDefault(); if (p.kind === 'page') createPage(pid); }}><${Icon} n="plusSmall" cls="i16"/></div><div class="sb-act" role="button" aria-label="Delete, duplicate, and more…" onClick=${(e) => { e.stopPropagation(); e.preventDefault(); openOverlay('rowMenu', e.currentTarget, { pid }); }}><${Icon} n="ellipsisSmall" cls="i16"/></div></div></div></a>${open ? (kids.length ? kids.map((k) => html`<${PageRow} key=${k} pid=${k} current=${current} depth=${d + 1}/>`) : html`<div class="sb-item sb-empty"><div class="sb-item-inner" style=${`padding-left:${38 + (d + 1) * 8}px`}><div class="sb-item-label">No pages inside</div></div></div>`) : ''}`;
}
const MoreRow = ({ k }) => html`<a class="sb-item more" onClick=${() => { S.sidebar.show = { ...(S.sidebar.show || {}), [k]: showCount(k) + 10 }; commit(); }}><div class="sb-item-inner"><div class="sb-item-icon"><${Icon} n="ellipsis20" as="ellipsis" cls="i20"/></div><div class="sb-item-label">More</div></div></a>`;
const favPages = () => Object.values(S.pages).filter((p) => p.favorite && !p.trashed && p.kind !== 'stub').sort((a, b) => (a.favoritedAt || 0) - (b.favoritedAt || 0)).map((p) => p.id);
function SectionBody({ k, current }) {
  const sb = S.sidebar;
  if (k === 'favorites') return html`<div class="sb-list">${favPages().map((pid) => html`<${PageRow} key=${pid} pid=${pid} current=${current}/>`)}</div>`;
  if (k === 'meetings') return html`<div class="sb-list tight">${sb.meetings.map((m) => html`<div class="sb-meet" role="button"><div class="sb-meet-ic"><i style=${m.color ? `background:${m.color}` : null}></i></div><div class="sb-meet-title">${m.title}</div><div class="sb-meet-time">${m.time}</div></div>`)}<div class="sb-meet muted" role="button" onClick=${() => openMeetingNote('', true)}><div class="sb-meet-ic"><${Icon} n="plusSmall" cls="i16"/></div><div class="sb-meet-title">New AI meeting note</div></div><div class="sb-meet muted" role="button"><div class="sb-meet-ic"><${Icon} n="arrowDiagonalUpRight" cls="i20"/></div><div class="sb-meet-title">View all</div></div></div>`;
  if (k === 'recents') return html`<div class="sb-list">${S.recents.filter((x) => (String(x).startsWith('chat:') ? S.aiChats && S.aiChats[x.slice(5)] : S.pages[x] && !S.pages[x].trashed)).slice(0, showCount('recents')).map((x) => (String(x).startsWith('chat:') ? html`<${ChatRecentRow} key=${x} id=${x.slice(5)}/>` : html`<${PageRow} key=${x} pid=${x} current=${current}/>`))}</div>${S.recents.length > showCount('recents') ? html`<${MoreRow} k="recents"/>` : ''}`;
  if (k === 'agents') return html`<div class="sb-list">${sb.agents.map((ag) => html`<a class="sb-item link"><div class="sb-item-inner"><div class="sb-item-icon"><i class="sb-agent-img"></i></div><div class="sb-item-label">${ag.title}</div></div></a>`)}<a class="sb-item link muted"><div class="sb-item-inner"><div class="sb-item-icon"><${Icon} n="plusSmall" cls="i16"/></div><div class="sb-item-label">New agent</div></div></a></div>`;
  if (k === 'private' || k === 'workspace' || k === 'shared') return html`<div class="sb-list">${sb[k].slice(0, showCount(k)).map((pid) => html`<${PageRow} key=${pid} pid=${pid} current=${current}/>`)}</div>${sb[k].length > showCount(k) ? html`<${MoreRow} k=${k}/>` : ''}`;
  return html`<div class="sb-list sb-apps">${APPS.map(([ic, label, path]) => html`<a class=${'sb-item link' + (location.pathname.startsWith(path) ? ' active' : '')} onClick=${() => space.openApp(path)}><div class="sb-item-inner"><div class="sb-item-icon"><${Icon} n=${ic} cls="i20"/></div><div class="sb-item-label">${label}</div></div></a>`)}</div>`;
}
const SB_TABS = [['home', 'home', 'Home'], ...(READY.ai ? [['chat', 'chatBubble', 'Chat']] : []), ...(READY.meetings ? [['meetings', 'paperMicrophone', 'Meetings']] : []), ...(READY.inbox ? [['inbox', 'inbox', 'Inbox']] : [])];
// Measured on the live Chat tab: agent tiles, then chats grouped by last update (Today, Yesterday, Past week, Past 30 days,
// Older) in 30px rows on a 31px pitch. Today's rows carry an ultra-compact age (Just now, 5m, 2h), older rows a short date,
// unread chats a blue dot, and the open chat a filled row. Only the first group header carries search, read-all and new.
const CHAT_GROUPS = [['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'Past week'], ['month', 'Past 30 days'], ['older', 'Older']];
const dayStart = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
function chatGroup(at) { const d0 = dayStart(NOW()); return at >= d0 ? 'today' : at >= d0 - 864e5 ? 'yesterday' : at >= d0 - 7 * 864e5 ? 'week' : at >= d0 - 30 * 864e5 ? 'month' : 'older'; }
// An ultra-compact age (weeks rounded down, "Now" under a minute): 5m, 2h, 2d, then a
// short date from day 3, weeks from day 8 to 27, a short date again from day 28, a full date in another year, years past one.
function chatLabel(at) {
  const now = NOW(); const f = now - at; const DAY = 864e5; const YEAR = 365 * DAY;
  if (f >= YEAR) return Math.floor(f / YEAR) + 'y';
  const fmt = (o) => new Date(at).toLocaleDateString('en-US', { ...o, timeZone: TZ });
  if (fmt({ year: 'numeric' }) !== new Date(now).toLocaleDateString('en-US', { year: 'numeric', timeZone: TZ })) return fmt({ year: 'numeric', month: '2-digit', day: '2-digit' });
  const d = Math.floor(f / DAY);
  if (d < 28 && d > 7) return Math.floor(d / 7) + 'w';
  if (d >= 3) return fmt({ month: 'short', day: 'numeric' });
  if (d >= 1) return d + 'd';
  const h = Math.floor(f / 36e5);
  if (h >= 1) return h + 'h';
  const m = Math.floor(f / 6e4);
  return m >= 1 ? m + 'm' : 'Now';
}
function chatRows() {
  return (S.sidebar.chats || []).map((c) => {
    const ch = c.id && S.aiChats ? S.aiChats[c.id] : null;
    const ms = ch && ch.messages && ch.messages.length ? ch.messages[ch.messages.length - 1].at || ch.messages[0].at : null;
    return { ...c, chat: ch, at: ms || c.at || NOW() };
  }).filter((c) => !c.id || c.chat).sort((x, y) => y.at - x.at);
}
const unreadChats = () => Object.values(S.aiChats || {}).filter((c) => c.unread).length;
function ChatBody() {
  const tiles = [['Nemesis AI', 'ai'], ['New agent', 'new']];
  const rows = chatRows();
  const groups = CHAT_GROUPS.map(([k, label]) => [label, rows.filter((r) => chatGroup(r.at) === k)]).filter(([, list]) => list.length);
  const cur = route() === 'ai' ? S.aiOpen : null;
  const openChat = (c) => { if (!c.chat) return; c.chat.unread = false; S.aiOpen = c.id; commit(); go('ai'); };
  const readAll = () => { Object.values(S.aiChats || {}).forEach((c) => { c.unread = false; }); commit(); };
  return html`<div class="sb-chat"><div class="sb-chat-group">
    <div class="sb-chat-in">
      <div class="sb-chat-head"><div class="sb-chat-label">Nemesis AI</div><div class="sb-act24 hov" role="button" aria-label="New agent"><${Icon} n="plusSmall" cls="i16"/></div></div>
      <div class="sb-tiles">${tiles.map(([label, kind]) => html`<a class="sb-tile" role="button" onClick=${() => { if (kind === 'ai') openNewChat(); }}><div class=${'sb-tile-av ' + kind}>${kind === 'new' ? html`<${Icon} n="plusSmall" cls="i20"/>` : kind === 'ai' ? html`<div class="sb-tile-in"><span class="ais-mark" dangerouslySetInnerHTML=${{ __html: ICONS.nemesisMark }}></span></div>` : html`<${Icon} n="book" cls="i20"/>`}</div><div class="sb-tile-label">${label}</div></a>`)}</div>
    </div>
    ${groups.map(([label, list], gi) => html`<div class="sb-chat-in older" key=${label}>
      <div class="sb-chat-head"><div class="sb-chat-label">${label}</div>${gi === 0 ? html`<div class="sb-chat-acts"><div class="sb-act24" role="button" aria-label="Search chats" onClick=${(e) => openOverlay('search', e.currentTarget)}><${Icon} n="magnifyingGlass" cls="i16"/></div><div class="sb-act24" role="button" aria-label="Mark all as read" onClick=${readAll}><${Icon} n="checkmarkSmall" cls="i16"/></div><div class="sb-act24" role="button" aria-label="New chat" onClick=${openNewChat}><${Icon} n="plusSmall" cls="i16"/></div></div>` : ''}</div>
      ${list.map((c) => html`<a class=${'sb-chat-row' + (c.id && c.id === cur ? ' on' : '')} key=${c.id || c.title} role="menuitem" onClick=${() => openChat(c)}><div class="sb-chat-row-in"><div class="sb-chat-ic">${html`<${Icon} n="chatBubble" cls="i20"/>`}</div><div class="sb-chat-title">${c.title}</div><div class="sb-chat-date">${chatLabel(c.at)}</div>${c.chat && c.chat.unread ? html`<i class="sb-chat-dot"></i>` : ''}</div></a>`)}
    </div>`)}
  </div></div>`;
}
function MeetingsBody() {
  const sb = S.sidebar;
  return html`<div class="sb-section mt"><div class="sb-sec static"><span class="sb-sec-label">Upcoming</span></div><div class="sb-list tight">${sb.upcoming.map((m) => html`<div class="sb-meet" role="button"><div class="sb-meet-ic"><i style=${`background:${m.color}`}></i></div><div class="sb-meet-title">${m.title}</div><div class="sb-meet-time">${m.time}</div></div>`)}</div><${MoreRow} k="upcoming"/></div>
  ${sb.notes.map((grp) => html`<div class="sb-section mt"><div class="sb-sec static"><span class="sb-sec-label">${grp.label}</span></div><div class="sb-notes">${grp.label === 'Today' ? html`<a class="sb-item muted first" onClick=${() => openMeetingNote('', true)}><div class="sb-item-inner"><div class="sb-item-icon"><${Icon} n="plusSmall" cls="i16"/></div><div class="sb-item-label">New AI meeting note</div></div></a>` : ''}${grp.items.map((title) => html`<a class="sb-item" onClick=${() => openMeetingNote(title, false, grp.label)}><div class="sb-item-inner"><div class="sb-item-icon"><${Icon} n="paperMicrophone" cls="i20"/></div><div class="sb-item-label">${title}</div></div></a>`)}</div></div>`)}`;
}
// The Inbox (docs/space/PLAN.md, M6): shares, comments and mentions for this person, newest first. Opening one marks it read
// and goes to the page, which switches workspace when the page lives in someone else's.
const inboxLine = (n) => {
  const who = (n.actor && n.actor.name) || 'Someone';
  // The title this browser knows is newer than the one sent with the notification, so it wins when the page is here.
  const title = (S.pages[n.page_id] && pageTitleText(S.pages[n.page_id])) || (n.page && n.page.props && n.page.props.title) || 'Untitled';
  return n.kind === 'share' ? `${who} shared ${title} with you` : n.kind === 'mention' ? `${who} mentioned you in ${title}` : n.kind === 'assign' ? `${who} assigned you to ${n.preview || 'a task'} in ${title}` : `${who} commented on ${title}`;
};
function InboxBody() {
  const box = space.inbox;
  const open = (n) => { if (!n.read) void space.markRead([n.id]); if (n.kind === 'assign' && n.record_id) openTask({ id: n.record_id, page_id: n.page_id }); else go(n.page_id); };
  return html`<div class="sb-inbox"><section class="sb-inbox-sec">
    <div class="sb-inbox-head"><div class="sb-chat-label">Inbox</div><div class="sb-chat-acts">${box.unread ? html`<div class="sb-act24" role="button" aria-label="Mark all as read" data-tip="Mark all as read" onClick=${() => void space.markRead(null)}><${Icon} n="checkmarkSmall" cls="i16"/></div>` : ''}</div></div>
    ${box.items.length ? box.items.map((n) => html`<a class=${'sb-chat-row inbox-row' + (n.read ? '' : ' unread')} key=${n.id} role="menuitem" onClick=${() => open(n)}><div class="sb-chat-row-in"><div class="sb-chat-ic"><img class="inbox-av" src=${(n.actor && n.actor.avatar) || initialsAvatar((n.actor && n.actor.name) || '?')} alt=""/></div><div class="inbox-text"><div class="sb-chat-title">${inboxLine(n)}</div>${n.preview && n.kind !== 'share' ? html`<div class="inbox-preview">${n.preview}</div>` : ''}</div><div class="sb-chat-date">${chatLabel(Date.parse(n.created_at))}</div>${n.read ? '' : html`<i class="sb-chat-dot"></i>`}</div></a>`) : html`<div class="inbox-empty">${box.loaded ? 'Nothing here yet. Pages shared with you, comments in your conversations and mentions of you show up here.' : 'Loading…'}</div>`}
  </section></div>`;
}
function Sidebar({ current }) {
  const tab = SB_TABS.some(([k]) => k === S.sidebar.tab) ? S.sidebar.tab : 'home';
  const links = [['bookshelf', 'Library'], ['checkmarkSquare', 'My Tasks'], ['templates', 'Templates'], ['questionMarkCircle', 'Help'], ['trash', 'Trash']];
  return html`<div ref=${sidebarRef} class=${'nsp-sidebar-container' + (S.sidebar.collapsed ? ' collapsed' : '')}><div class="nsp-sidebar">
    <div class="sb-ws" role="button" onClick=${(e) => openOverlay('workspace', e.currentTarget)}><div class="sb-ws-inner"><div class="sb-av"><img src=${space.avatar()} alt=""/></div><div class="sb-ws-name">${S.workspace}</div><span class="sb-ws-chev"><${Icon} n="arrowChevronSingleDownFillSmall" cls="i14"/></span></div></div>
    <div class="sb-collapse" role="button" data-tip="Close sidebar" onClick=${() => { S.sidebar.collapsed = true; commit(); }}><${Icon} n="arrowChevronDoubleBackward" cls="i20"/></div>
    <div class="sb-iconrow">
      <div class=${'sb-tabs' + (tab === 'home' ? '' : ' shifted')} role="tablist">${SB_TABS.map(([k, ic, label]) => html`<div class=${'sb-tab' + (tab === k ? ' active' : '')} role="tab" key=${k} onClick=${() => { S.sidebar.tab = k; commit(); }}><${Icon} n=${ic} cls="i22"/><div class="sb-tab-label"><span><span>${label}</span></span></div>${k === 'chat' && unreadChats() ? html`<span class="sb-badge">${unreadChats()}</span>` : ''}${k === 'inbox' && space.inbox.unread ? html`<span class="sb-badge">${space.inbox.unread > 9 ? '9+' : space.inbox.unread}</span>` : ''}</div>`)}</div>
      <div class="sb-search"><div class="sb-tab" role="button" onClick=${(e) => openOverlay('search', e.currentTarget)}><${Icon} n="magnifyingGlass" cls="i22"/></div></div>
    </div>
    <div class=${'sb-scroll tab-' + tab}>
      ${tab === 'chat' ? html`<${ChatBody}/>` : tab === 'meetings' ? html`<${MeetingsBody}/>` : tab === 'inbox' ? html`<${InboxBody}/>` : ''}
      ${tab !== 'home' ? '' : sectionOrder().map((k) => SECTION_DEFS.find((x) => x.key === k)).filter((def) => def && !(S.sidebar.hidden || {})[def.key] && (def.key !== 'favorites' || favPages().length) && (def.key !== 'shared' || S.sidebar.shared.length) && (def.key !== 'workspace' || S.sidebar.workspace.length)).map((def) => { const open = def.key === 'favorites' ? S.sidebar.open.favorites !== false : !!S.sidebar.open[def.key]; return html`<div class=${'sb-section' + (open ? ' open' : '')} key=${def.key}><div class="sb-sec" role="button" onClick=${() => { S.sidebar.open[def.key] = !open; commit(); }}><span class="sb-sec-label">${def.label}</span><span class=${'sb-sec-chev' + (open ? '' : ' closed')}><${Icon} n="arrowChevronSingleDownFillSmall" cls="i12"/></span><div class="sb-sec-actions">${def.actions.map((ic) => html`<div class="sb-act" role="button" onClick=${(e) => { e.stopPropagation(); if (ic === 'plusSmall') createPage(null, def.key === 'workspace' ? 'workspace' : 'private'); if (ic === 'ellipsisSmall') openOverlay('sectionMenu', e.currentTarget, { key: def.key }); if (ic === 'arrowDiagonalUpRightSmall') go('library/' + (def.key === 'private' ? 'private' : def.key === 'agents' ? 'agents' : 'recents')); }}><${Icon} n=${ic} cls="i16"/></div>`)}</div></div>${open ? html`<${SectionBody} k=${def.key} current=${current}/>` : ''}</div>`; })}
      ${tab !== 'home' ? '' : html`<div class="sb-links">${links.map(([ic, label, dot]) => html`<a class=${'sb-item link' + ((label === 'Library' && route().startsWith('library')) || (label === 'My Tasks' && route() === 'tasks') || (label === 'Templates' && route().startsWith('marketplace')) ? ' active' : '')} onClick=${(e) => sidebarLink(label, e.currentTarget)}><div class="sb-item-inner"><div class="sb-item-icon"><${Icon} n=${ic} cls="i22"/>${dot ? html`<span class="sb-dot"></span>` : ''}</div><div class="sb-item-label">${label}</div></div></a>`)}</div>`}
    </div>
    <div class="sb-bottom">
      ${READY.ai ? html`<div class="sb-newchat" role="button" onClick=${openNewChat}><${Icon} n="aiFace" cls="i20"/><span class="label">New chat</span><kbd>⌘O</kbd></div>` : ''}
      <div class=${'sb-compose' + (overlay && overlay.kind === 'composeMenu' ? ' open' : '')} role="button" aria-label="New page" onClick=${(e) => openOverlay('composeMenu', e.currentTarget)}><${Icon} n=${overlay && overlay.kind === 'composeMenu' ? 'xMark' : 'compose'} cls=${overlay && overlay.kind === 'composeMenu' ? 'i20' : 'i22'}/></div>
    </div>
  </div></div>`;
}

/* ------------------------------------------------------------------ block handles, selection, drag */
let picked = new Set();
let hov = null; // { id, left, top } in viewport px
let dragState = null;
const hovSubs = new Set();
const setHov = (h) => { if ((h && h.id) === (hov && hov.id) && (!h || (h.left === hov.left && h.top === hov.top))) return; hov = h; hovSubs.forEach((f) => f()); };
const blockEl = (id) => document.querySelector(`.nsp-page-content [data-block-id="${id}"]`);
// Measured: "+" 24x24 sits 52px left of the block, the 18x24 drag handle 28px left, both centred on the first line.
function handleAnchor(id) {
  const el = blockEl(id); if (!el) return null;
  const r = el.getBoundingClientRect(); let top = r.top + 4;
  const ed = el.querySelector('[data-ed]');
  if (el.classList.contains('nsp-transcription-block')) top = r.top + 8;
  else if (ed && ed.closest('[data-block-id]') === el) { const cs = getComputedStyle(ed); const lh = parseFloat(cs.lineHeight) || 24; top = ed.getBoundingClientRect().top + (parseFloat(cs.paddingTop) || 0) + (lh - 24) / 2; }
  return { id, left: r.left, top };
}
function blockFromPoint(e) {
  const t = e.target; if (!t || !t.closest) return undefined;
  if (t.closest('.blk-handles')) return undefined;
  const own = t.closest('.nsp-page-content [data-block-id]');
  if (own) return own.dataset.blockId;
  const content = document.querySelector('.nsp-page-content');
  if (!content || !t.closest('.nsp-scroller')) return null;
  const cr = content.getBoundingClientRect();
  if (e.clientY < cr.top || e.clientY > cr.bottom || e.clientX < cr.left - 96 || e.clientX > cr.right + 96) return null;
  if (hov) { const hb = blockEl(hov.id); if (hb) { const r = hb.getBoundingClientRect(); if (e.clientY >= r.top && e.clientY < r.bottom && e.clientX < r.left) return undefined; } }
  const probe = document.elementFromPoint(Math.min(Math.max(e.clientX, cr.left + 2), cr.right - 2), e.clientY);
  const pb = probe && probe.closest && probe.closest('.nsp-page-content [data-block-id]');
  return pb ? pb.dataset.blockId : null;
}
// Synchronous on purpose: requestAnimationFrame never fires in a hidden tab.
addEventListener('mousemove', (e) => {
  if (overlay || dragState) return;
  const id = blockFromPoint(e);
  if (id !== undefined) setHov(id ? handleAnchor(id) : null);
}, { passive: true });
addEventListener('scroll', () => { if (hov) setHov(null); }, true);
addEventListener('keydown', () => { if (hov) setHov(null); }, true);
function pickBlocks(ids) { picked = new Set(ids); refresh(); }
function removeBlock(id) {
  if (!S.blocks[id]) return;
  const [arr, i] = siblings(id); if (i >= 0) arr.splice(i, 1);
  const drop = (x) => { const bb = S.blocks[x]; if (!bb) return; (bb.children || []).forEach(drop); delete S.blocks[x]; };
  drop(id);
}
function cloneBlock(id, parent) {
  const b = S.blocks[id]; const nb = JSON.parse(JSON.stringify(b));
  nb.id = uid(); nb.parent = parent; nb._rev = 0; S.blocks[nb.id] = nb;
  nb.children = (b.children || []).map((c) => cloneBlock(c, nb.id));
  return nb.id;
}
function duplicateBlocks(ids) {
  const out = [];
  ids.forEach((id) => { const b = S.blocks[id]; if (!b) return; const [arr, i] = siblings(id); const nid = cloneBlock(id, b.parent); arr.splice(i + 1, 0, nid); out.push(nid); });
  touch(); picked = new Set(out); commit();
}
function deleteBlocks(ids) { ids.forEach(removeBlock); touch(); picked = new Set(); commit(); }
const visibleBlockIds = () => [...document.querySelectorAll('.nsp-page-content [data-block-id]')].map((el) => el.dataset.blockId);
addEventListener('mousedown', (e) => {
  const t = e.target;
  if (picked.size && !(t.closest && t.closest('.blk-handles, .menu'))) { picked = new Set(); refresh(); }
}, true);
addEventListener('keydown', (e) => {
  if (overlay || !picked.size) return;
  const a = document.activeElement; if (a && (a.isContentEditable || /INPUT|TEXTAREA/.test(a.tagName))) return;
  const ids = [...picked];
  if (e.key === 'Escape') { e.preventDefault(); pickBlocks([]); return; }
  if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); deleteBlocks(ids); return; }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateBlocks(ids); return; }
  if ((e.metaKey || e.ctrlKey) && e.key === '/') { e.preventDefault(); const h = handleAnchor(ids[0]); if (h) openOverlay('blockMenu', null, { id: ids[0], anchor: { left: h.left - 28, right: h.left - 10, top: h.top, bottom: h.top + 24 } }); return; }
  if (e.key === 'Enter') { e.preventDefault(); const id = ids[ids.length - 1]; picked = new Set(); if (S.blocks[id]) focusLater(id, 'end'); refresh(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const all = visibleBlockIds(); const k = all.indexOf(e.key === 'ArrowDown' ? ids[ids.length - 1] : ids[0]); const n = all[k + (e.key === 'ArrowDown' ? 1 : -1)]; if (n) pickBlocks([n]); }
});
function plusClick(e) {
  if (!hov) return; const b = S.blocks[hov.id]; if (!b) return;
  let target;
  if (!e.altKey && b.type === 'text' && !plain(b.title) && !b.children.length) target = b;
  else { const [arr, i] = siblings(b.id); target = newBlock('text', [], b.parent); arr.splice(e.altKey ? i : i + 1, 0, target.id); }
  target.title = [['/']]; target._rev = (target._rev || 0) + 1;
  touch(); pendingSlash = target.id; focusLater(target.id, 'end'); setHov(null); commit();
}
function startDrag(id, ev) {
  const el = blockEl(id); if (!el) return;
  const r = el.getBoundingClientRect();
  const ghost = el.cloneNode(true); ghost.classList.add('blk-ghost');
  [ghost, ...ghost.querySelectorAll('[data-block-id],[data-ed],[contenteditable]')].forEach((x) => { x.removeAttribute('data-block-id'); x.removeAttribute('data-ed'); x.removeAttribute('contenteditable'); });
  Object.assign(ghost.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px' });
  const drop = document.createElement('div'); drop.className = 'blk-drop'; drop.style.display = 'none';
  space.root.append(ghost, drop);
  dragState = { id, ghost, drop, dx: ev.clientX - r.left, dy: ev.clientY - r.top, target: null, where: null };
  pickBlocks([id]); setHov(null); document.body.style.cursor = 'grabbing';
}
function moveDrag(ev) {
  const d = dragState; if (!d) return;
  d.ghost.style.left = ev.clientX - d.dx + 'px'; d.ghost.style.top = ev.clientY - d.dy + 'px';
  const content = document.querySelector('.nsp-page-content'); if (!content) return;
  const cr = content.getBoundingClientRect();
  const probe = document.elementFromPoint(Math.min(Math.max(ev.clientX, cr.left + 2), cr.right - 2), ev.clientY);
  let tEl = probe && probe.closest && probe.closest('.nsp-page-content [data-block-id]');
  if (tEl && (tEl.dataset.blockId === d.id || tEl.closest(`[data-block-id="${d.id}"]`))) tEl = null;
  if (!tEl) { d.target = null; d.drop.style.display = 'none'; } else {
    const r = tEl.getBoundingClientRect(); d.where = ev.clientY < r.top + r.height / 2 ? 'before' : 'after'; d.target = tEl.dataset.blockId;
    Object.assign(d.drop.style, { display: 'block', left: r.left + 'px', width: r.width + 'px', top: (d.where === 'before' ? r.top : r.bottom) - 2 + 'px' });
  }
  const sc = document.querySelector('.nsp-frame > .nsp-scroller');
  if (sc) { const sr = sc.getBoundingClientRect(); if (ev.clientY < sr.top + 40) sc.scrollTop -= 12; else if (ev.clientY > sr.bottom - 40) sc.scrollTop += 12; }
}
function endDrag() {
  const d = dragState; dragState = null; document.body.style.cursor = '';
  if (!d) return; d.ghost.remove(); d.drop.remove();
  if (d.target && S.blocks[d.target] && S.blocks[d.id]) {
    const b = S.blocks[d.id]; const [arr, i] = siblings(d.id); arr.splice(i, 1);
    const t = S.blocks[d.target]; const [tarr, ti] = siblings(t.id);
    tarr.splice(d.where === 'before' ? ti : ti + 1, 0, d.id); b.parent = t.parent; touch(); commit();
  } else refresh();
}
function dragDown(e) {
  if (e.button !== 0 || !hov) return;
  e.preventDefault();
  const id = hov.id; const hr = e.currentTarget.getBoundingClientRect(); const sx = e.clientX; const sy = e.clientY; let moved = false;
  const onMove = (ev) => { if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return; if (!moved) { moved = true; startDrag(id, ev); } moveDrag(ev); };
  const onUp = (ev) => {
    removeEventListener('mousemove', onMove, true); removeEventListener('mouseup', onUp, true);
    if (moved) { endDrag(ev); return; }
    pickBlocks([id]);
    openOverlay('blockMenu', null, { id, anchor: { left: hr.left, top: hr.top, right: hr.right, bottom: hr.bottom } });
  };
  addEventListener('mousemove', onMove, true); addEventListener('mouseup', onUp, true);
}
const TIP_PLUS = '<div>Click<span class="dim"> to add below</span></div><div>Option-click<span class="dim"> to add above</span></div>';
const TIP_DRAG = '<div>Drag<span class="dim"> to move</span></div><div>Click<span class="dim"> or </span><kbd>⌘/</kbd><span class="dim"> to open menu</span></div>';
function BlockHandles() {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((x) => x + 1); hovSubs.add(f); return () => hovSubs.delete(f); }, []);
  if (!hov || dragState) return null;
  return html`<div class="blk-handles" style=${`left:${hov.left - 52}px;top:${hov.top}px`}>
    <div class="blk-plus" style=${overlay ? 'visibility:hidden' : ''} role="button" aria-label="Click to add below. Option-click to add a block above" data-tip-html=${TIP_PLUS} onClick=${plusClick}><${Icon} n="plus" cls="i20"/></div>
    <div class="blk-drag" role="button" aria-label="Drag to move, click to open menu" data-tip-html=${TIP_DRAG} onMouseDown=${dragDown}><${Icon} n="dragHandle" cls="i20"/></div>
  </div>`;
}

/* ------------------------------------------------------------------ overlays (menus, search) */
let overlay = null; // { kind, r, data }
function openOverlay(kind, el, data) {
  const r = el ? el.getBoundingClientRect() : { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  overlay = { kind, r: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }, data: data || {} };
  closeSlash(); refresh();
}
function closeOverlay() { if (overlay) { overlay = null; refresh(); } }
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && overlay) { e.preventDefault(); closeOverlay(); return; }
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key === 'k' || e.key === 'p')) { e.preventDefault(); openOverlay('search'); }
  if ((e.metaKey || e.ctrlKey) && e.key === ',') { e.preventDefault(); openOverlay('settings', null, { page: 'Preferences' }); }
});
const MenuItem = ({ ic, as, label, sc, chev, tone, onClick, val, valSm, beta, badge, desc }) => html`<div class=${'mi' + (tone ? ' ' + tone : '') + (desc ? ' tall' : '')} role="menuitem" onClick=${onClick}><div class="mi-in"><div class="mi-ic"><${Icon} n=${ic} as=${as} cls="i20"/></div>${beta || badge ? html`<div class="mi-label flexl"><span>${label}</span><span class=${beta ? 'mi-beta' : 'mi-badge'}>${beta || badge}</span></div>` : html`<div class="mi-label">${label}${desc ? html`<div class="mi-desc">${desc}</div>` : ''}</div>`}${val ? html`<div class=${'mi-val' + (valSm ? ' sm' : '')}>${val}</div>` : ''}${sc ? html`<div class="mi-sc">${sc}</div>` : ''}${chev ? html`<div class="mi-chev"><${Icon} n="arrowChevronSingleRightSmall" cls="i16"/></div>` : ''}</div></div>`;
function WorkspaceMenu() {
  const n = space.info.members || 1;
  return html`<div class="menu ws-menu" style="left:8px;top:42px">
    <div class="ws-head"><div class="ws-head-ic"><img src=${space.avatar()} alt=""/></div><div class="ws-head-txt"><div class="ws-head-name">${S.workspace}</div><div class="ws-head-sub">${n === 1 ? '1 member' : n + ' members'}</div></div></div>
    <div class="ws-rule"><div></div></div>
    <div class="ws-item blue" role="menuitem" onClick=${() => { closeOverlay(); space.openApp('/pricing'); }}><div class="ws-ic"><${Icon} n="arrowInCircleUp" cls="i20"/></div><span>Upgrade</span></div>
    <div class="ws-item" role="menuitem" onClick=${() => openOverlay('settings', null, { page: 'Preferences' })}><div class="ws-ic"><${Icon} n="gear" cls="i20"/></div><span>Settings</span></div>
    ${READY.members ? html`<div class="ws-item" role="menuitem" onClick=${() => openOverlay('settings', null, { page: 'People' })}><div class="ws-ic"><${Icon} n="envelope" cls="i20"/></div><span>Invite members</span></div>` : ''}
    <div class="ws-rule2"><div></div></div>
    <div class="ws-acct"><div class="ws-acct-head"><span>${space.me.email}</span></div>
      ${(space.info.spaces || []).map((sp) => html`<div class="ws-acct-row" role="menuitem" onClick=${() => { closeOverlay(); if (sp.id !== space.info.id) void space.switchSpace(sp.id); }}><div class="ws-acct-ic"><img src=${space.avatar()} alt=""/></div><span class="ws-acct-name">${sp.name}</span>${sp.role === 'guest' ? html`<span class="ws-acct-guest">Guest</span>` : ''}${sp.id === space.info.id ? html`<span class="ws-check"><${Icon} n="checkmark" cls="i20"/></span>` : ''}</div>`)}
    </div>
    <div class="ws-rule2"><div></div></div>
    <div class="ws-logout" role="menuitem" onClick=${() => { closeOverlay(); space.host.signOut(); }}>Log out</div>
  </div>`;
}
function RowMenu({ data }) {
  const p = S.pages[data.pid] || {};
  const isDb = p.kind === 'database';
  const left = Math.min(Math.max(8, overlay.r.left), innerWidth - 273);
  const top = Math.max(8, Math.min(overlay.r.bottom + 4, innerHeight - 412));
  const favorite = !!p.favorite;
  return html`<div class="menu row-menu" style=${`left:${left}px;top:${top}px`}>
    <div class="menu-group"><div class="menu-head">${isDb ? 'Database' : 'Page'}</div>
      <${MenuItem} ic="star" label=${favorite ? 'Remove from Favorites' : 'Add to Favorites'} onClick=${() => { p.favorite = !favorite; p.favoritedAt = NOW(); commit(); closeOverlay(); }}/>
      <${MenuItem} ic="eyeSlash" label="Remove from Recents" onClick=${() => { S.recents = S.recents.filter((x) => x !== data.pid); commit(); closeOverlay(); }}/></div>
    <div class="menu-group">
      <${MenuItem} ic="link" label="Copy link" onClick=${() => { try { navigator.clipboard.writeText(space.pageUrl(data.pid)); } catch (e) {} closeOverlay(); }}/>
      ${READY.pageOps ? html`<${MenuItem} ic="duplicate" label="Duplicate" chev/>` : ''}
      ${READY.pageOps ? html`<${MenuItem} ic="compose" label="Rename" sc="⌘⇧R"/>` : ''}
      ${READY.pageOps ? html`<${MenuItem} ic="arrowTurnUpRight" label="Move to" sc="⌘⇧P"/>` : ''}
      <${MenuItem} ic="trash" label="Move to Trash" onClick=${() => { closeOverlay(); trashPage(data.pid); }}/></div>
    <div class="menu-group">
      <${MenuItem} ic="arrowDiagonalUpRight" label="Open in new tab" sc="⌘⇧↵" onClick=${() => { open(space.pageUrl(data.pid), '_blank'); closeOverlay(); }}/>
      ${READY.pageOps ? html`<${MenuItem} ic="peekSide" label="Open in side peek" sc="⌥Click"/>` : ''}</div>
    <div class="menu-group"><div class="menu-meta"><div>Last edited by ${space.editedBy(data.pid)}</div><div>${fmtWhen(p.lastEdited || NOW())}</div></div></div>
  </div>`;
}
/* Search, measured on the live app: the recents list, the results list, and the page preview. */
const pageTitleText = (p) => (titlePartsOf(p) ? titlePartsOf(p).join('') : p.title) || (p && p.kind === 'database' ? 'New database' : 'New page');
const parentTitleOf = (p) => {
  if (p.rowOf) { const db = Object.values(S.pages).find((x) => x.collection === p.rowOf.coll); return db ? pageTitleText(db) : ''; }
  const a = ancestorsOf(p); return a.length ? pageTitleText(a[a.length - 1]) : '';
};
// Words match with or without a trailing s, the way "blocks" finds "block" in the live results.
const searchRe = (q) => {
  const ws = q.toLowerCase().split(/\s+/).filter(Boolean).map((w) => (w.length > 3 ? w.replace(/s$/, '') : w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + 's?');
  return ws.length ? new RegExp('(' + ws.join('|') + ')', 'gi') : null;
};
const hlParts = (text, re) => (re ? String(text).split(re).map((part, i) => (i % 2 ? html`<span class="srh">${part}</span>` : part)) : text);
function pageTexts(p) {
  const out = [];
  const walk = (ids) => (ids || []).forEach((id) => { const b = S.blocks[id]; if (!b) return; const t = plain(b.title); if (t) out.push(t); if (b.rows) b.rows.forEach((r) => r.forEach((c) => out.push(typeof c === 'string' ? c : plain(c)))); walk(b.children); });
  walk(p.content);
  return out;
}
function snippetOf(p, reI) {
  for (const t of pageTexts(p)) {
    const m = reI.exec(t); if (!m) continue;
    let s = Math.max(0, m.index - 40);
    if (s > 0) { const sp = t.indexOf(' ', s); if (sp >= 0 && sp < m.index) s = sp + 1; }
    return t.slice(s, s + 180) + (s + 180 < t.length ? '...' : '');
  }
  return '';
}
function searchResults(q) {
  const re = searchRe(q); if (!re) return { re, rows: [] };
  const reI = new RegExp(re.source, 'i'); const here = route(); const rows = [];
  Object.values(S.pages).forEach((p) => {
    if (!p || p.trashed) return;
    const title = pageTitleText(p); const parent = parentTitleOf(p);
    const hits = (title.match(re) || []).length; const pHit = !!parent && reI.test(parent);
    const snip = hits || pHit ? '' : snippetOf(p, reI);
    if (!hits && !pHit && !snip) return;
    rows.push({ p, title, parent, snip, cur: p.id === here, score: hits * 100 + (pHit ? 10 : 0) + (snip ? 1 : 0) });
  });
  rows.sort((a, b) => b.score - a.score || (b.p.lastEdited || 0) - (a.p.lastEdited || 0));
  return { re, rows };
}
// The preview draws a page with its own smaller type scale; block colours, dividers and the contents block are left out.
const pvRich = (segs) => (segs || []).map(([t, d]) => {
  const mn = d && d.find((x) => x[0] === 'p' || x[0] === 'u' || x[0] === 'd');
  if (mn) return mentionHtml(mn).replace(/<[^>]*>/g, '');
  let h = esc(t);
  if (!d || !d.length) return h;
  const has = (k) => d.find((x) => x[0] === k);
  if (has('c')) h = `<span class="spv-ic-code">${h}</span>`;
  const st = [];
  if (has('b')) st.push('font-weight:600');
  if (has('i')) st.push('font-style:italic');
  const deco = [has('s') ? 'line-through' : '', has('_') || has('a') ? 'underline' : ''].filter(Boolean).join(' ');
  if (deco) st.push('text-decoration:' + deco);
  const hc = has('h');
  if (hc) { const c = String(hc[1] || ''); const k = COLOR_KEY[c.replace(/_background$/, '')]; if (k) st.push(c.endsWith('_background') ? `background:var(--c-${k}BacSec)` : `color:var(--c-${k}TexAccPri)`); }
  return st.length ? `<span style="${st.join(';')}">${h}</span>` : h;
}).join('');
const PV_HEAD = { header: 'spv-h1', sub_header: 'spv-h2', sub_sub_header: 'spv-h3', header_4: 'spv-h4' };
const pvRichEl = (segs, cls) => html`<div class=${cls || null} dangerouslySetInnerHTML=${{ __html: pvRich(segs) }}></div>`;
function pvNodes(ids) {
  const out = []; let i = 0; ids = ids || [];
  while (i < ids.length) {
    const b = S.blocks[ids[i]]; if (!b) { i++; continue; }
    if (b.type === 'bulleted_list' || b.type === 'numbered_list') {
      const type = b.type; const grp = [];
      while (i < ids.length && S.blocks[ids[i]] && S.blocks[ids[i]].type === type) grp.push(S.blocks[ids[i++]]);
      const items = grp.map((g) => html`<li><span dangerouslySetInnerHTML=${{ __html: pvRich(g.title) }}></span>${g.children && g.children.length ? html`<div>${pvNodes(g.children)}</div>` : ''}</li>`);
      out.push(type === 'bulleted_list' ? html`<ul class="spv-ul">${items}</ul>` : html`<ol class="spv-ol">${items}</ol>`);
      continue;
    }
    i++;
    const n = pvBlock(b); if (n) out.push(n);
  }
  return out;
}
function pvBlock(b) {
  switch (b.type) {
    case 'header': case 'sub_header': case 'sub_sub_header': case 'header_4':
      return b.toggleable ? html`<div class=${'spv-tgl ' + PV_HEAD[b.type] + ' spv-tglh'}><div class="spv-tgl-ic"><${Icon} n="arrowCaretDownFillSmall" cls="spv-caret"/></div>${pvRichEl(b.title)}</div>` : pvRichEl(b.title, PV_HEAD[b.type]);
    case 'to_do':
      return html`<div class=${'spv-todo' + (b.checked ? ' done' : '')}><div class=${'spv-box' + (b.checked ? ' on' : '')}><i></i>${b.checked ? html`<svg viewBox="0 0 14 14" fill="none"><path d="M3.3 7.4 5.7 9.8 10.7 4.2" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path></svg>` : ''}</div>${pvRichEl(b.title, 'spv-tx')}</div>`;
    case 'toggle':
      return html`<div class="spv-tgl"><div class="spv-tgl-ic"><${Icon} n="arrowCaretDownFillSmall" cls="spv-caret"/></div>${pvRichEl(b.title)}</div>`;
    case 'quote': return pvRichEl(b.title, 'spv-quote');
    case 'callout': return html`<div class="spv-callout"><div class="spv-callout-ic">${b.icon || '💡'}</div>${pvRichEl(b.title)}</div>`;
    case 'code': return html`<div class="spv-code" dangerouslySetInnerHTML=${{ __html: highlight(plain(b.title), b.language) }}></div>`;
    case 'equation': return html`<div class="spv-eq"><span>📈</span><span>Equation</span></div>`;
    case 'table': return html`<div class="spv-table"><div class="spv-th"><span>Table</span></div><div class="spv-tbody">${[0, 1, 2, 3, 4, 5].map(() => html`<div class="spv-tr"><div></div><div></div><div></div></div>`)}</div></div>`;
    case 'column_list': return (b.children || []).map((c) => pvNodes((S.blocks[c] || {}).children));
    case 'page': case 'link_to_page': { const pg = S.pages[b.pageId]; return pg && !pg.trashed ? html`<div>${pageTitleText(pg)}</div>` : null; }
    case 'divider': case 'table_of_contents': case 'image': case 'video': case 'audio': case 'file': case 'bookmark': return null;
    default: return pvRichEl(b.title);
  }
}
function PagePreview({ p, top }) {
  const parent = parentTitleOf(p);
  const copy = (e) => { e.stopPropagation(); try { navigator.clipboard.writeText(space.pageUrl(p.id)); } catch (err) {} };
  const open = (e) => { e.stopPropagation(); closeOverlay(); if (p.kind !== 'stub') go(p.id); };
  return html`<div class="spv" style=${`top:${top}px`}>
    <div class="spv-bar"><div class="spv-grp"><div class="spv-btn" role="button" onClick=${copy}><${Icon} n="link" cls="spv-link"/></div><div class="spv-btn" role="button" onClick=${open}><${Icon} n="openDiagonal" cls="spv-open"/></div></div></div>
    <div class="spv-cover">${p.cover && p.cover.src ? (String(p.cover.src).startsWith('css:') ? html`<div class="spv-cover-fill" style=${'background:' + p.cover.src.slice(4)}></div>` : html`<img src=${space.fileUrl(p.cover.src)} alt=""/>`) : ''}${hasIcon(p) ? html`<div class="spv-icon"><${PageIcon} ic=${p.icon} size=${48}/></div>` : ''}</div>
    <div class="spv-body">
      ${parent ? html`<div class="spv-crumb">${parent}</div>` : ''}
      <div class="spv-title">${pageTitleText(p)}</div>
      ${p.collection ? '' : html`<div class="spv-content">${pvNodes(p.content)}</div>`}
    </div>
  </div>`;
}
function SearchModal() {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [kb, setKb] = useState(false);
  const inputRef = useRef(null);
  useEffect(() => { if (inputRef.current) inputRef.current.focus(); }, []);
  const here = route(); const query = q.trim();
  const recents = [...S.recents, ...S.sidebar.private].filter((v, i, arr) => arr.indexOf(v) === i && v !== here).map((pid) => S.pages[pid]).filter((p) => p && !p.trashed);
  const { re, rows } = query ? searchResults(query) : { re: null, rows: [] };
  const n = query ? rows.length : recents.length;
  const pageAt = (i) => (query ? rows[i] && rows[i].p : recents[i]);
  const pick = (p) => { closeOverlay(); if (p && p.kind !== 'stub') go(p.id); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setKb(true); setSel((sel + 1) % Math.max(n, 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setKb(true); setSel((sel - 1 + n) % Math.max(n, 1)); }
    if (e.key === 'Enter') { e.preventDefault(); pick(pageAt(sel)); }
  };
  const hover = (i) => () => { if (sel !== i || kb) { setSel(i); setKb(false); } };
  const rowCls = (i, extra) => 'search-row' + (extra || '') + (i === sel ? ' on' : '') + (i === sel && kb ? ' kb' : '');
  const badge = (t) => html`<div class="sr-badge"><div>${t}</div></div>`;
  const cur = pageAt(sel);
  const list = query
    ? html`<div class="search-head res"><span>Search results (${rows.length})</span>${READY.searchFilters ? html`<div class="sr-sort" role="button"><span>Best matches</span><${Icon} n="arrowChevronSingleDownSmall" cls="sr-sort-ic"/></div>` : ''}</div>${rows.length ? rows.map((r, i) => html`<a class=${rowCls(i, ' res')} key=${r.p.id} onMouseMove=${hover(i)} onClick=${() => pick(r.p)}><div class="sr-in"><div class="sr-ic"><${RowIcon} page=${r.p}/></div><div class="sr-col"><div class="sr-line"><div class="sr-title">${hlParts(r.title, re)}</div>${r.cur ? badge('Current Page') : r.p.collection ? badge('Database') : ''}</div><div class="sr-meta">${r.parent ? html`<span class="sr-path">${hlParts(r.parent, re)}</span><span>•</span>` : ''}<span>${space.editedBy(r.p.id)}</span><span>•</span><span>${ago(r.p.lastEdited || NOW() - 86400000)}</span></div>${r.snip ? html`<div class="sr-snip">${hlParts(r.snip, re)}</div>` : ''}</div></div></a>`) : html`<div class="search-empty">No results</div>`}`
    : html`<div class="search-head">Today</div>${recents.map((p, i) => { const parent = parentTitleOf(p); return html`<a class=${rowCls(i)} key=${p.id} onMouseMove=${hover(i)} onClick=${() => pick(p)}><div class="search-row-in"><div class="search-ic"><${RowIcon} page=${p}/></div><div class="search-title">${pageTitleText(p)}</div>${parent ? html`<span class="search-dash">·</span><span class="search-parent">${parent}</span>` : ''}</div></a>`; })}`;
  return html`<div class="search" role="dialog" onKeyDown=${onKey}>
    <div class="search-top"><div class="search-bar"><${Icon} n="magnifyingGlass" cls="i22"/><input ref=${inputRef} class="search-input" placeholder=${READY.ai ? `Search or ask a question in ${S.workspace}…` : `Search ${S.workspace}…`} value=${q} onInput=${(e) => { setQ(e.currentTarget.value); setSel(0); }}/></div>${READY.searchFilters ? html`<div class="search-tools"><div class="search-tool" role="button"><${Icon} n="sidebarRight" cls="i22"/></div><div class="search-tool" role="button"><${Icon} n="filterCircle" cls="i22"/></div></div>` : ''}</div>
    ${READY.searchFilters ? html`<div class="search-chips"><div class="chip" role="button"><${Icon} n="textFormat" cls="chip-ic"/><span>Title only</span></div><div class="chip" role="button"><${Icon} n="person" cls="chip-ic"/><span>Created by</span><${Icon} n="arrowChevronSingleDownSmall" cls="chip-chev"/></div><div class="chip" role="button"><${Icon} n="page" cls="chip-ic"/><span>In</span><${Icon} n="arrowChevronSingleDownSmall" cls="chip-chev"/></div><div class="chip add" role="button"><${Icon} n="plusSmall" cls="chip-plus"/><span>Filter</span></div></div>` : ''}
    <div class="search-body"><div class="search-list"><div class="search-group">${list}</div></div>
      <div class="search-preview">${cur ? html`<${PagePreview} key=${cur.id} p=${cur} top=${query ? 0 : 33.9}/>` : ''}</div></div>
    <div class="search-foot"><span class="search-foot-l"><${Icon} n="commandSmall" cls="i12"/><${Icon} n="arrowTurnDownLeftSmall" cls="i12"/><span>Open in new tab</span></span><span class="search-foot-r"><span class="sf-thumbs" style=${query ? '' : 'visibility:hidden'}><span class="sf-btn"><${Icon} n="handThumbsUpSmall" cls="i16"/></span><span class="sf-btn"><${Icon} n="handThumbsDownSmall" cls="i16"/></span></span><span class="sf-btn big"><${Icon} n="slidersSmall" cls="i16"/></span></span></div>
  </div>`;
}
const ToggleItem = ({ ic, label, on, onClick }) => html`<div class="mi" role="menuitemcheckbox" aria-checked=${on ? 'true' : 'false'} onClick=${onClick}><div class="mi-in"><div class="mi-ic"><${Icon} n=${ic} cls="i20"/></div><div class="mi-label">${label}</div><span class=${'toggle' + (on ? ' on' : '')}></span></div></div>`;
const FONTS = [['default', 'Default', 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'], ['serif', 'Serif', 'Lyon-Text, Georgia, ui-serif, serif'], ['mono', 'Mono', 'iawriter-mono, Nitti, Menlo, Courier, monospace']];
function PageMenu() {
  const page = S.pages[route()]; if (!page) return null;
  const st = page.style || {};
  const set = (k, v) => { page.style = { ...st, [k]: v }; commit(); };
  const right = Math.max(12, innerWidth - overlay.r.right - 2);
  return html`<div class="menu page-menu" style=${`right:${right}px;top:44px`}>
    <div class="pm-scroll">
      <div class="pm-search"><div class="pm-search-in"><div class="pm-search-box"><${Icon} n="magnifyingGlassSmall" cls="i16"/><input placeholder="Search actions…" autofocus/></div></div></div>
      <div class="menu-group pm-fonts"><div class="pm-fonts-in">${FONTS.map(([k, label, family], i) => html`<div class=${'pm-font' + ((st.font || 'default') === k ? ' on' : '')} role="button" onClick=${() => set('font', k)}><div class="pm-ag" style=${`font-family:${family};font-size:${24 + i}px`}>Ag</div><div class="pm-font-label">${label}</div></div>`)}</div></div>
      <div class="menu-group">
        <${MenuItem} ic="link" label="Copy link" sc="⌘⌥L" onClick=${() => { try { navigator.clipboard.writeText(location.href); } catch (e) {} closeOverlay(); copiedToast(); }}/>
        <${MenuItem} ic="clipboard" label="Copy page contents" onClick=${() => { try { navigator.clipboard.writeText(pageText(page)); } catch (e) {} closeOverlay(); showToast({ text: 'Copied page contents' }); }}/>
        ${READY.pageOps ? html`<${MenuItem} ic="duplicate" label="Duplicate" sc="⌘D"/>` : ''}
        ${READY.pageOps ? html`<${MenuItem} ic="arrowTurnUpRight" label="Move to" sc="⌘⇧P"/>` : ''}
        <${MenuItem} ic="trash" label="Move to Trash" onClick=${() => { closeOverlay(); trashPage(page.id); }}/></div>
      <div class="menu-group">
        <${ToggleItem} ic="textSmall" label="Small text" on=${!!st.small} onClick=${() => set('small', !st.small)}/>
        <${ToggleItem} ic="arrowExpandHorizontal" label="Full width" on=${!!st.full} onClick=${() => set('full', !st.full)}/>
        ${READY.pageOps ? html`<${MenuItem} ic="sliders" label="Customize page"/>` : ''}</div>
      <div class="menu-group">
        <${ToggleItem} ic="lockFill" label="Lock page" on=${!!st.locked} onClick=${() => set('locked', !st.locked)}/>
        ${READY.ai ? html`<${MenuItem} ic="aiFace" label="Use with AI" chev/>` : ''}</div>
      ${READY.ai ? html`<div class="menu-group"><${MenuItem} ic="commentPencil" label="Suggest edits"/><${MenuItem} ic="textTranslate" label="Translate" chev/></div>` : ''}
      ${READY.pageOps && page.lastEdited >= SESSION_T0 ? html`<div class="menu-group"><${MenuItem} ic="arrowUTurnUpLeft" label="Undo" sc="⌘Z"/></div>` : ''}
      ${READY.importExport ? html`<div class="menu-group"><${MenuItem} ic="arrowLineDown" label="Import"/><${MenuItem} ic="arrowLineUp" label="Export"/></div>` : ''}
      ${READY.history ? html`<div class="menu-group"><${MenuItem} ic="clock" label="Updates & analytics"/><${MenuItem} ic="stack" label="Version history" beta="Beta"/></div>` : ''}
      ${READY.notifyPrefs ? html`<div class="menu-group"><${MenuItem} ic="bell" label="Notify me" val="Comments" chev/></div>` : ''}
      <div class="menu-group"><div class="menu-meta"><div>${plural(pageWords(page), 'word')}</div><div>Last edited by ${space.editedBy(page.id)}</div><div>${fmtWhen(page.lastEdited || NOW())}</div></div></div>
    </div>
  </div>`;
}
const ROLE_LABEL = { full: 'Full access', edit: 'Can edit', comment: 'Can comment', read: 'Can view' };
const ROLE_ORDER = ['full', 'edit', 'comment', 'read'];
const asSentence = (m) => { const t = String(m || '').trim(); return t ? t[0].toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? '' : '.') : 'Something went wrong. Try again.'; };
// A role picker inside the Share menu: the four roles, and Remove for someone already on the page.
function RoleMenu({ value, onPick, removable }) {
  const [open, setOpen] = useState(false);
  const pick = (r) => () => { setOpen(false); onPick(r); };
  return html`<div class="shp-role"><div class="shp-access" role="button" onClick=${() => setOpen(!open)}><span>${ROLE_LABEL[value] || value}</span><${Icon} n="arrowChevronSingleDownSmall" cls="i14"/></div>${open ? html`<div class="menu shp-role-menu"><div class="menu-group">${ROLE_ORDER.map((r) => html`<div class="mi" role="menuitem" onClick=${pick(r)}><div class="mi-in"><div class="mi-label">${ROLE_LABEL[r]}</div>${r === value ? html`<div class="mi-check"><${Icon} n="checkmarkSmall" cls="i16"/></div>` : ''}</div></div>`)}</div>${removable ? html`<div class="menu-group"><div class="mi" role="menuitem" onClick=${pick(null)}><div class="mi-in"><div class="mi-label">Remove</div></div></div></div>` : ''}</div>` : ''}</div>`;
}
// Sharing a page (docs/space/PLAN.md, M5): invite by email with a role, see who has access, change or remove it.
// ws_invite and ws_set_access decide everything; this only asks and shows the answer.
function SharePopover() {
  const [tab, setTab] = useState('share');
  const [access, setAccess] = useState(null);
  const [typed, setTyped] = useState('');
  const [role, setRole] = useState('edit');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const left = Math.max(8, Math.min(overlay.r.right - 456, innerWidth - 464));
  const page = S.pages[route()];
  const pid = page ? page.id : null;
  const load = () => { if (pid) space.pageAccess(pid).then((a) => { if (a && !a.error) setAccess(a); }, (e) => setNote({ text: asSentence(e.message), warn: true })); };
  useEffect(load, [pid]);
  const full = !access || access.role === 'full';
  const send = async () => {
    const emails = splitEmails(typed);
    if (!emails.length || busy || !pid) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await space.invite(pid, emails, role);
      setTyped('');
      setNote({ text: r.invited ? `Invited ${r.invited} ${r.invited === 1 ? 'person' : 'people'}.` : 'Everyone you added can already open this page.' });
      load();
    } catch (e) {
      setNote({ text: asSentence(e.message), warn: true });
    }
    setBusy(false);
  };
  const change = (target) => async (r) => { try { const a = await space.setAccess(pid, target, r); if (a && !a.error) setAccess(a); } catch (e) { setNote({ text: asSentence(e.message), warn: true }); } };
  const me = space.me;
  const owner = access && access.owner;
  const row = (av, name, email, right) => html`<div class="shp-member"><div class="shp-av">${av}</div><div class="shp-who"><div class="shp-name">${name}</div>${email ? html`<div class="shp-email">${email}</div>` : ''}</div>${right}</div>`;
  const label = (r) => html`<div class="shp-access static"><span>${ROLE_LABEL[r] || r}</span></div>`;
  const named = (p) => (p.id === me.id ? html`${p.name} <span class="shp-you">(You)</span>` : p.name);
  return html`<div class="menu share-pop" style=${`left:${left}px;top:44px`}>
    <div class="shp-tabs"><div class="shp-tabs-l">${[['share', 'Share'], ...(READY.publish ? [['publish', 'Publish']] : [])].map(([k, lab]) => html`<div class=${'shp-tab' + (tab === k ? ' on' : '')} onClick=${() => setTab(k)}><div class="shp-tab-in">${lab}</div></div>`)}</div></div>
    ${tab === 'share' ? html`<div>
      ${READY.invites && full ? html`<div class="shp-invite"><div class="shp-input"><input placeholder="Email, separated by commas" value=${typed} onInput=${(e) => setTyped(e.currentTarget.value)} onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } }}/></div><${RoleMenu} value=${role} onPick=${(r) => { if (r) setRole(r); }}/><div class=${'shp-invite-btn' + (busy || !typed.trim() ? ' off' : '')} role="button" onClick=${send}>${busy ? 'Inviting…' : 'Invite'}</div></div>` : ''}
      ${note ? html`<div class=${'shp-note' + (note.warn ? ' warn' : '')}>${note.text}</div>` : ''}
      <div class="shp-list">
        ${owner ? row(html`<img src=${space.avatar(owner.id)} alt=""/>`, named(owner), owner.email, label('full')) : row(html`<img src=${space.avatar()} alt=""/>`, html`${me.name} <span class="shp-you">(You)</span>`, me.email, label(access ? access.role : 'full'))}
        ${(access ? access.people : []).map((p) => row(html`<img src=${space.avatar(p.id)} alt=""/>`, named(p), p.email, full && !p.inherited && p.id !== me.id ? html`<${RoleMenu} value=${p.role} removable onPick=${change({ user: p.id })}/>` : label(p.role)))}
        ${(access ? access.pending : []).map((p) => row(html`<span class="shp-pending-ic"><${Icon} n="envelope" cls="i20"/></span>`, p.email, 'Invited, has not opened it yet', html`<${RoleMenu} value=${p.role} removable onPick=${change({ email: p.email })}/>`))}
      </div>
      ${full ? '' : html`<div class="shp-note">Only people with full access can invite others.</div>`}
      <div class="shp-general"><div class="shp-general-label">General access</div><div class="shp-general-row"><div class="shp-lock"><${Icon} n="lockFill" cls="i18"/></div><div class="shp-general-sel"><span>${page ? space.sectionLabel(page) === 'Private' ? 'Only people invited' : 'Everyone at ' + S.workspace : 'Only people invited'}</span></div></div></div>
      <div class="shp-bottom"><div class="shp-adv-row">${READY.publish ? html`<div class="shp-adv" role="button"><${Icon} n="gear" cls="i20"/><span>Advanced</span></div>` : ''}<div class="shp-copy" role="button" onClick=${() => { try { navigator.clipboard.writeText(page ? space.pageUrl(page.id) : location.href); } catch (e) {} }}><${Icon} n="link" cls="i16"/><span>Copy link</span></div></div></div>
    </div>` : READY.publish ? html`<div class="shp-publish"><div class="shp-pub-title">Publish to web</div><div class="shp-pub-sub">Anyone with the link can read it, without signing in.</div><div class="shp-invite-btn wide" role="button">Publish</div></div>` : ''}
  </div>`;
}

/* ------------------------------------------------------------------ block action menu + submenus (measured) */
const TYPE_NAME = { text: 'Text', header: 'Heading 1', sub_header: 'Heading 2', sub_sub_header: 'Heading 3', header_4: 'Heading 4', bulleted_list: 'Bulleted list', numbered_list: 'Numbered list', to_do: 'To-do list', toggle: 'Toggle list', quote: 'Quote', callout: 'Callout', code: 'Code', equation: 'Block equation', divider: 'Divider', table: 'Table', column_list: 'Columns', table_of_contents: 'Table of contents', page: 'Page' };
const TURN_INTO = [
  { n: 'Text', ic: 'textNormal', t: 'text' }, { n: 'Heading 1', ic: 'textH1', t: 'header' }, { n: 'Heading 2', ic: 'textH2', t: 'sub_header' }, { n: 'Heading 3', ic: 'textH3', t: 'sub_sub_header' }, { n: 'Heading 4', ic: 'textH4', t: 'header_4' },
  { n: 'Page', ic: 'pageMenu', as: 'page', t: 'page' }, { n: 'Page in', ic: 'docSend', chev: true },
  { n: 'Bulleted list', ic: 'listBullet', t: 'bulleted_list' }, { n: 'Numbered list', ic: 'listNumber', t: 'numbered_list' }, { n: 'To-do list', ic: 'checklist', t: 'to_do' }, { n: 'Toggle list', ic: 'listToggle', t: 'toggle' },
  { n: 'Code', ic: 'code', t: 'code' }, { n: 'Quote', ic: 'quote', t: 'quote' }, { n: 'Callout', ic: 'calloutBlock', t: 'callout' }, { n: 'Block equation', ic: 'sumSquare', t: 'equation' }, { n: 'Synced block', ic: 'blockSync' },
  { n: 'Toggle heading 1', ic: 'textH1Toggle', t: 'header', tog: true }, { n: 'Toggle heading 2', ic: 'textH2Toggle', t: 'sub_header', tog: true }, { n: 'Toggle heading 3', ic: 'textH3Toggle', t: 'sub_sub_header', tog: true }, { n: 'Toggle heading 4', ic: 'textH4Toggle', t: 'header_4', tog: true },
  { n: '2 columns', ic: 'rectangleSplit2', cols: 2 }, { n: '3 columns', ic: 'rectangleSplit3', cols: 3 }, { n: '4 columns', ic: 'rectangleSplit4', cols: 4 }, { n: '5 columns', ic: 'rectangleSplit5', cols: 5 },
];
const COLOR_NAMES = ['default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
const capWord = (x) => x.charAt(0).toUpperCase() + x.slice(1);
const typeName = (b) => (b.toggleable && /header/.test(b.type) ? 'Toggle heading ' + { header: 1, sub_header: 2, sub_sub_header: 3, header_4: 4 }[b.type] : TYPE_NAME[b.type] || 'Block');
function fmtWhen(t) {
  const d = new Date(t); const day = (x) => x.toLocaleDateString('en-US', { timeZone: TZ });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
  if (day(d) === day(new Date(NOW()))) return `Today at ${time}`;
  if (day(d) === day(new Date(NOW() - 86400000))) return `Yesterday at ${time}`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: TZ })}, ${time}`;
}
const countWords = (x) => (String(x || '').trim() ? String(x).trim().split(/\s+/).length : 0);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
function pageWords(page) { let n = 0; const walk = (ids) => (ids || []).forEach((id) => { const b = S.blocks[id]; if (!b) return; n += countWords(plain(b.title)); (b.rows || []).forEach((r) => r.forEach((c) => { n += countWords(c); })); walk(b.children); }); walk(page.content); return n; }
function applyColor(ids, val) {
  const clear = val === 'default' || val === 'default_background';
  ids.forEach((id) => { const b = S.blocks[id]; if (b) { b.color = clear ? undefined : val; b._rev = (b._rev || 0) + 1; } });
  if (!clear) S.lastColor = val;
  touch(); commit();
}
function toColumns(id, n) {
  const b = S.blocks[id]; const [arr, i] = siblings(id); const cl = newBlock('column_list', [], b.parent);
  for (let k = 0; k < n; k++) { const col = newBlock('column', [], cl.id); cl.children.push(col.id); if (k === 0) { col.children.push(id); b.parent = col.id; } else { const t = newBlock('text', [], col.id); col.children.push(t.id); } }
  arr.splice(i, 1, cl.id); touch();
}
function toPage(id) {
  const b = S.blocks[id]; const pid = uid(); const host = pageOfBlock(id);
  S.pages[pid] = { id: pid, kind: 'page', icon: null, title: plain(b.title), content: b.children.slice(), lastEdited: NOW(), parent: isUuid(host) ? host : null, ...(isUuid(host) ? {} : { section: 'private' }) };
  b.children.forEach((c) => { S.blocks[c].parent = pid; });
  Object.assign(b, { type: 'page', pageId: pid, title: [], children: [], toggleable: false, color: undefined }); b._rev = (b._rev || 0) + 1; touch();
}
function turnInto(ids, item) {
  ids.forEach((id) => {
    const b = S.blocks[id]; if (!b) return;
    if (item.cols) { toColumns(id, item.cols); return; }
    if (item.t === 'page') { toPage(id); return; }
    const txt = plain(b.title);
    if (item.t === 'code' || item.t === 'equation') { convert(id, item.t, { toggleable: false }); b.title = [[txt]]; if (item.t === 'code' && !b.language) b.language = 'Plain text'; return; }
    convert(id, item.t, { toggleable: !!item.tog, open: item.tog || item.t === 'toggle' ? (b.open ?? true) : b.open });
    if (item.t === 'callout' && !b.icon) b.icon = '💡';
  });
  commit();
}
function Swatch({ c, bg, on }) {
  const k = COLOR_KEY[c];
  const ring = on ? 'var(--c-bluBorStr) 0 0 0 2px inset' : `${(OPT[c] || OPT.default)[0]} 0 0 0 1px inset`;
  const fill = bg ? (k ? `;background:var(--c-${k}BacSec)` : '') : `;color:${k ? `var(--c-${k}TexSec)` : 'var(--c-texPri)'}`;
  return html`<div class="sw" style=${`box-shadow:${ring}${fill}`}>${bg ? '' : 'A'}</div>`;
}
// Measured: submenus sit 4px over the parent's right edge, vertically centred on the row, max 70vh.
function SubMenu({ sub, cls, onMove, children }) {
  const ref = useRef(null); const [top, setTop] = useState(null);
  useLayoutEffect(() => { const el = ref.current; if (!el) return; const h = el.offsetHeight; const t = Math.max(8, Math.min((sub.top + sub.bottom) / 2 - h / 2, innerHeight - h - 8)); if (top === null || Math.abs(t - top) > 0.5) setTop(t); });
  return html`<div class=${'menu submenu ' + (cls || '')} ref=${ref} style=${`left:${sub.x}px;top:${top === null ? -9999 : top}px`} onMouseMove=${onMove}>${children}</div>`;
}
function BlockMenu({ data }) {
  const ref = useRef(null); const inputRef = useRef(null);
  const [pos, setPos] = useState(null); const [q, setQ] = useState(''); const [sub, setSub] = useState(null); const [hi, setHi] = useState(-1); const [subMoved, setSubMoved] = useState(false);
  const keyRef = useRef(null);
  useEffect(() => {
    const onWinKey = (e) => { const inp = inputRef.current; if (!inp || document.activeElement === inp) return; if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) inp.focus(); else if (/^(ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Enter)$/.test(e.key) && keyRef.current) keyRef.current(e); };
    addEventListener('keydown', onWinKey, true); return () => removeEventListener('keydown', onWinKey, true);
  }, []);
  useLayoutEffect(() => {
    if (pos || !ref.current) return;
    const h = ref.current.offsetHeight; const a = data.anchor; let left = a.left - 5 - 265; if (left < 8) left = a.right + 5;
    setPos({ left, top: Math.max(8, Math.min((a.top + a.bottom) / 2 - h / 2, innerHeight - h - 8)) });
  });
  const b = S.blocks[data.id]; if (!b) return null;
  const ids = picked.size ? [...picked] : [data.id];
  const done = () => closeOverlay();
  const textual = TEXTUAL.has(b.type) || b.type === 'code' || b.type === 'equation';
  const openSub = (kind, el) => { if (!el || !ref.current) return; const r = el.getBoundingClientRect(); setSubMoved(false); setSub({ kind, top: r.top, bottom: r.bottom, x: ref.current.getBoundingClientRect().right - 4 }); };
  const acts = [
    textual && { n: 'Turn into', ic: 'arrowSquarePathUpDown', sub: 'turn', g: 1 },
    textual && { n: 'Color', ic: 'blockColor', sub: 'color', g: 1 },
    { n: 'Copy link to block', ic: 'link', sc: '⌘⌃L', g: 2, run: () => { try { navigator.clipboard.writeText(location.href); } catch (e) {} done(); } },
    { n: 'Duplicate', ic: 'duplicate', sc: '⌘D', g: 2, run: () => { done(); duplicateBlocks(ids); } },
    { n: 'Move to', ic: 'arrowTurnUpRight', sc: '⌘⇧P', g: 2, run: () => openOverlay('moveTo', null, { ids, anchor: data.anchor }) },
    { n: 'Delete', ic: 'trash', sc: 'Del', g: 2, run: () => { done(); deleteBlocks(ids); } },
    { n: 'Comment', ic: 'commentFilled', sc: '⌘⇧M', g: 3, run: () => { done(); openBlockComment(data.id); } },
    READY.ai && { n: 'Suggest edits', ic: 'commentPencil', sc: '⌘⇧⌥X', g: 3, run: done },
    READY.ai && { n: 'Ask AI', ic: 'aiFace', sc: '⌘J', g: 4, run: done },
    READY.ai && { n: 'Skills', ic: 'paperBolt', sub: 'skills', g: 4 },
  ].filter(Boolean);
  const f = norm(q);
  const turnHits = f ? TURN_INTO.filter((it) => (it.t || it.cols) && norm('turn into ' + it.n).includes(f)).map((it) => ({ n: it.n, ic: it.ic, as: it.as, run: () => { done(); turnInto(ids, it); } })) : [];
  const colorHits = f ? COLOR_NAMES.flatMap((c) => [[c, false], [c, true]]).filter(([c, bg]) => norm(`${c} ${bg ? 'background' : 'text'}`).includes(f)).map(([c, bg]) => ({ n: `${capWord(c)} ${bg ? 'background' : 'text'}`, sw: [c, bg], run: () => { done(); applyColor(ids, bg ? c + '_background' : c); } })) : [];
  const flat = f ? [...acts.filter((a) => a.run && norm(a.n).includes(f)), ...turnHits, ...colorHits] : acts;
  const rowEls = () => (ref.current ? [...ref.current.querySelectorAll('.bm-scroll .mi')] : []);
  const activate = (a, el) => { if (a.sub) openSub(a.sub, el); else if (a.run) a.run(); };
  const onKey = (e) => {
    const n = flat.length; if (!n) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((hi + 1) % n); } else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((hi - 1 + n) % n); } else if (e.key === 'Enter' || (e.key === 'ArrowRight' && hi >= 0 && flat[hi].sub)) { e.preventDefault(); const k = hi < 0 ? 0 : hi; activate(flat[k], rowEls()[k]); } else if (e.key === 'ArrowLeft' && sub) { e.preventDefault(); setSub(null); }
  };
  keyRef.current = onKey;
  const row = (a, k) => html`<div class=${'mi' + (k === hi || (sub && a.sub === sub.kind) ? ' hi' : '')} role="menuitem" onMouseEnter=${(e) => { setHi(k); if (a.sub) openSub(a.sub, e.currentTarget); else setSub(null); }} onClick=${(e) => activate(a, e.currentTarget)}><div class="mi-in">${a.sw ? html`<${Swatch} c=${a.sw[0]} bg=${a.sw[1]}/>` : html`<div class="mi-ic"><${Icon} n=${a.ic} as=${a.as} cls="i20"/></div>`}<div class="mi-label">${a.n}</div>${a.sc ? html`<div class="mi-sc">${a.sc}</div>` : ''}${a.sub ? html`<div class="mi-chev"><${Icon} n="arrowChevronSingleRightSmall" cls="i16"/></div>` : ''}</div></div>`;
  let k = -1; const txt = plain(b.title);
  const body = f
    ? html`<div class="menu-group">${flat.length ? flat.map((a) => row(a, ++k)) : html`<div class="menu-meta">No results</div>`}</div>`
    : html`${[1, 2, 3, 4].map((g) => acts.filter((a) => a.g === g)).filter((grp) => grp.length).map((grp, gi) => html`<div class="menu-group">${gi === 0 ? html`<div class="menu-head">${typeName(b)}</div>` : ''}${grp.map((a) => row(a, ++k))}</div>`)}<div class="menu-group"><div class="menu-meta"><div>Last edited by ${space.editedBy(pageOfBlock(data.id))}</div><div>${fmtWhen(b.edited || NOW())}</div>${textual ? html`<div>${plural(countWords(txt), 'word')}, ${plural(txt.length, 'character')}</div>` : ''}</div></div>`;
  const cur = (it) => it.t && it.t === b.type && !!it.tog === !!b.toggleable;
  const lastUsed = S.lastColor || 'yellow_background';
  const colorRow = (c, bg, sc) => {
    const val = bg ? c + '_background' : c; const on = !sc && (b.color ? b.color === val : c === 'default' && !bg);
    return html`<div class="mi" role="menuitem" onClick=${() => { done(); applyColor(ids, val); }}><div class="mi-in"><${Swatch} c=${c} bg=${bg} on=${on}/><div class="mi-label">${capWord(c)} ${bg ? 'background' : 'text'}</div>${sc ? html`<div class="mi-sc">${sc}</div>` : ''}${on ? html`<div class="mi-check"><${Icon} n="checkmarkSmall" cls="i16"/></div>` : ''}</div></div>`;
  };
  let subBody = null;
  if (sub && sub.kind === 'turn') subBody = html`<div class="menu-group">${TURN_INTO.map((it, i) => html`<div class=${'mi' + (i === 0 && !subMoved ? ' ring' : '')} role="menuitem" onClick=${() => { if (it.t || it.cols) { done(); turnInto(ids, it); } }}><div class="mi-in"><div class="mi-ic"><${Icon} n=${it.ic} as=${it.as} cls="i20"/></div><div class="mi-label">${it.n}</div>${cur(it) ? html`<div class="mi-check"><${Icon} n="checkmarkSmall" cls="i16"/></div>` : ''}${it.chev ? html`<div class="mi-chev"><${Icon} n="arrowChevronSingleRightSmall" cls="i16"/></div>` : ''}</div></div>`)}</div>`;
  if (sub && sub.kind === 'color') { const lb = lastUsed.endsWith('_background'); subBody = html`<div class="menu-group"><div class="menu-head">Last used</div>${colorRow(lb ? lastUsed.slice(0, -11) : lastUsed, lb, '⌘⇧H')}</div><div class="menu-group"><div class="menu-head">Text color</div>${COLOR_NAMES.map((c) => colorRow(c, false))}</div><div class="menu-group"><div class="menu-head">Background color</div>${COLOR_NAMES.map((c) => colorRow(c, true))}</div>`; }
  if (READY.ai && sub && sub.kind === 'skills') subBody = html`<div class="menu-group">${['Improve writing', 'Proofread', 'Explain', 'Reformat'].map((n) => html`<div class="mi" role="menuitem" onClick=${done}><div class="mi-in"><div class="mi-label">${n}</div></div></div>`)}</div>`;
  return html`<div class="menu block-menu" ref=${ref} style=${pos ? `left:${pos.left}px;top:${pos.top}px` : 'left:-9999px;top:0'} onKeyDown=${onKey}>
    <div class="bm-search"><div class="bm-search-in"><div class="bm-search-box"><input ref=${inputRef} placeholder="Search actions…" value=${q} onInput=${(e) => { setQ(e.currentTarget.value); setHi(e.currentTarget.value ? 0 : -1); setSub(null); }}/></div></div></div>
    <div class="bm-scroll">${body}</div>
  </div>${subBody ? html`<${SubMenu} sub=${sub} cls=${sub.kind === 'color' ? 'colors' : ''} onMove=${() => { if (!subMoved) setSubMoved(true); }}>${subBody}<//>` : ''}`;
}
function MoveToMenu({ data }) {
  const [q, setQ] = useState(''); const inputRef = useRef(null);
  useEffect(() => { if (inputRef.current) inputRef.current.focus(); }, []);
  const here = route();
  const list = Object.values(S.pages).filter((p) => p.kind === 'page' && p.id !== here && (!q || p.title.toLowerCase().includes(q.toLowerCase())));
  const a = data.anchor || { left: innerWidth / 2, top: 120 };
  const left = Math.max(8, a.left - 5 - 320); const top = Math.max(8, Math.min(a.top - 40, innerHeight - 380));
  const move = (pid) => {
    (data.ids || []).forEach((id) => { const b = S.blocks[id]; if (!b) return; const [arr, i] = siblings(id); arr.splice(i, 1); b.parent = pid; S.pages[pid].content.push(id); });
    S.pages[pid].lastEdited = NOW(); touch(); picked = new Set(); closeOverlay(); commit();
  };
  return html`<div class="menu move-menu" style=${`left:${left}px;top:${top}px`}>
    <div class="bm-search"><div class="bm-search-in"><div class="bm-search-box"><input ref=${inputRef} placeholder="Move block to…" value=${q} onInput=${(e) => setQ(e.currentTarget.value)}/></div></div></div>
    <div class="bm-scroll"><div class="menu-group"><div class="menu-head">Suggested</div>${list.length ? list.map((p) => html`<div class="mi" role="menuitem" onClick=${() => move(p.id)}><div class="mi-in"><div class="mi-ic"><${RowIcon} page=${p}/></div><div class="mi-label">${p.title || 'New page'}</div></div></div>`) : html`<div class="menu-meta">No pages</div>`}</div></div>
  </div>`;
}


/* ------------------------------------------------------------------ inline selection menu (measured: 192x323, 16px right of the selection, bottom 9px above it) */
let fmt = null; // { id, left, top, offs, link }
let pendingSel = null; let fmtHold = 0;
function applySel() {
  if (!pendingSel) return; const { id, a, z } = pendingSel; pendingSel = null;
  const el = document.querySelector(`[data-ed="${id}"]`); if (!el) return; el.focus();
  const range = document.createRange(); let placedA = false;
  let left = a; let right = z; const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let t;
  while ((t = tw.nextNode())) {
    const L = t.nodeValue.length;
    if (!placedA && left <= L) { range.setStart(t, left); placedA = true; }
    if (right <= L) { range.setEnd(t, right); break; }
    left -= L; right -= L;
  }
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range); fmtHold = Date.now();
}
function selectionIn(host) {
  const sel = getSelection(); if (!sel.rangeCount) return null; const r = sel.getRangeAt(0); if (!host.contains(r.startContainer)) return null;
  const pre = document.createRange(); pre.selectNodeContents(host); pre.setEnd(r.startContainer, r.startOffset);
  const a = pre.toString().length; return [a, a + r.toString().length];
}
function showFmt() {
  const sel = getSelection(); if (!sel.rangeCount || sel.isCollapsed || picked.size || slash) { if (fmt) fmtLog('skip:' + (!sel.rangeCount ? 'norange' : sel.isCollapsed ? 'collapsed' : picked.size ? 'picked' : 'slash')); return hideFmt(); }
  const range = sel.getRangeAt(0); const node = range.commonAncestorContainer; const el = node.nodeType === 1 ? node : node.parentElement;
  const host = el && el.closest && el.closest('.nsp-page-content [data-ed]');
  if (!host || host.classList.contains('cd-text')) { fmtLog('nohost'); return hideFmt(); }
  const r = range.getBoundingClientRect(); let top = r.top - 9 - 323; if (top < 52) top = r.bottom + 9;
  fmt = { id: host.dataset.ed, left: Math.min(r.right + 16, innerWidth - 200), top, offs: selectionIn(host) }; fmtLog('show'); refresh();
}
function hideFmt() { if (fmt) { fmt = null; refresh(); } }
const fmtLog = (m) => { try { const ds = document.documentElement.dataset; ds.fmtLog = ((ds.fmtLog || '') + ' ' + m).slice(-300); } catch (e) {} };
// A microtask, not a timer: timers are throttled to 1s in background tabs.
addEventListener('mouseup', (e) => { if (e.target.closest && e.target.closest('.fmt-menu, .submenu')) return; Promise.resolve().then(showFmt); });
addEventListener('keyup', (e) => { if (e.shiftKey && /Arrow|Home|End/.test(e.key)) showFmt(); });
addEventListener('keydown', (e) => { if (fmt && !e.metaKey && !e.ctrlKey && (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Enter') && !(document.activeElement && document.activeElement.closest && document.activeElement.closest('.fmt-menu'))) hideFmt(); }, true);
document.addEventListener('selectionchange', () => {
  if (!fmt || Date.now() - fmtHold < 250 || fmt.link) return;
  const a = document.activeElement; if (a && a.closest && a.closest('.fmt-menu')) return;
  const sel = getSelection(); if (!sel.rangeCount || sel.isCollapsed) { fmtLog('selchange'); hideFmt(); }
});
// Scrolling keeps the menu pinned to the selection; it hides only when the selection is gone.
addEventListener('scroll', (e) => {
  if (!fmt || fmt.link || (e.target.closest && e.target.closest('.fmt-menu, .submenu'))) return;
  const sel = getSelection(); if (!sel.rangeCount || sel.isCollapsed) { fmtLog('scroll'); hideFmt(); return; }
  const r = sel.getRangeAt(0).getBoundingClientRect(); let top = r.top - 9 - 323; if (top < 52) top = r.bottom + 9;
  const left = Math.min(r.right + 16, innerWidth - 200);
  if (left !== fmt.left || top !== fmt.top) { fmt.left = left; fmt.top = top; refresh(); }
}, true);
const mergeRich = (segs) => segs.reduce((out, sg) => { if (!sg[0]) return out; const last = out[out.length - 1]; if (last && JSON.stringify(last[1] || []) === JSON.stringify(sg[1] || [])) out[out.length - 1] = last[1] ? [last[0] + sg[0], last[1]] : [last[0] + sg[0]]; else out.push(sg); return out; }, []);
function editMarks(fn) {
  if (!fmt) return; const host = document.querySelector(`[data-ed="${fmt.id}"]`); const b = S.blocks[fmt.id]; if (!host || !b) return;
  const [a, z] = selectionIn(host) || fmt.offs || [0, 0]; if (a === z) return;
  const segs = domToRich(host); const [L, rest] = splitRich(segs, a); const [M, Rr] = splitRich(rest, z - a);
  b.title = mergeRich([...L, ...fn(M), ...Rr]); b._rev = (b._rev || 0) + 1; b.edited = NOW(); touch();
  fmt.offs = [a, z]; fmt.link = false; pendingSel = { id: fmt.id, a, z }; fmtHold = Date.now(); commit();
}
const hasMark = (d, m) => (d || []).some((x) => x[0] === m);
function toggleMark(m) { editMarks((M) => { const all = M.every(([, d]) => hasMark(d, m)); return M.map(([t, d]) => { const nd = (d || []).filter((x) => x[0] !== m); if (!all) nd.push([m]); return nd.length ? [t, nd] : [t]; }); }); }
function setMark(m, v) { editMarks((M) => M.map(([t, d]) => { const nd = (d || []).filter((x) => x[0] !== m); if (v) nd.push([m, v]); return nd.length ? [t, nd] : [t]; })); }
function clearMarks() { editMarks((M) => M.map(([t]) => [t])); }
function FmtMenu() {
  const [sub, setSub] = useState(null);
  if (!fmt) return null;
  const b = S.blocks[fmt.id]; if (!b) return null;
  const keep = (e) => { if (!(e.target.closest && e.target.closest('input'))) e.preventDefault(); };
  const typeIt = TURN_INTO.find((it) => it.t === b.type && !!it.tog === !!b.toggleable) || TURN_INTO[0];
  const openSub = (kind) => (e) => { const r = e.currentTarget.getBoundingClientRect(); const mr = e.currentTarget.closest('.fmt-menu').getBoundingClientRect(); setSub({ kind, top: r.top, bottom: r.bottom, x: mr.right - 4 }); };
  const k = b.color && !b.color.endsWith('_background') ? COLOR_KEY[b.color] : null;
  const btn = (ic, act, cls) => html`<div class=${'fm-btn' + (cls || '')} role="button" onClick=${() => { setSub(null); if (act) act(); }}><${Icon} n=${ic} cls="i20"/></div>`;
  if (fmt.link) return html`<div class="fmt-menu fm-linkbox" style=${`left:${fmt.left}px;top:${fmt.top + 323 - 44}px`} onMouseDown=${keep}><div class="fm-ai"><input autofocus placeholder="Paste link" onKeyDown=${(e) => { if (e.key === 'Enter' && e.currentTarget.value) { e.preventDefault(); setMark('a', e.currentTarget.value); } if (e.key === 'Escape') { e.preventDefault(); hideFmt(); } }}/></div></div>`;
  const colorRow = (c, bg, sc) => html`<div class="mi" role="menuitem" onClick=${() => { setSub(null); setMark('h', c === 'default' ? null : bg ? c + '_background' : c); if (c !== 'default') S.lastColor = bg ? c + '_background' : c; }}><div class="mi-in"><${Swatch} c=${c} bg=${bg}/><div class="mi-label">${capWord(c)} ${bg ? 'background' : 'text'}</div>${sc ? html`<div class="mi-sc">${sc}</div>` : ''}</div></div>`;
  const last = S.lastColor || 'yellow_background'; const lb = last.endsWith('_background');
  const subBody = !sub ? null : sub.kind === 'turn'
    ? html`<div class="menu-group">${TURN_INTO.map((it) => html`<div class="mi" role="menuitem" onClick=${() => { if (it.t || it.cols) { const id = fmt.id; hideFmt(); turnInto([id], it); } }}><div class="mi-in"><div class="mi-ic"><${Icon} n=${it.ic} as=${it.as} cls="i20"/></div><div class="mi-label">${it.n}</div>${it === typeIt ? html`<div class="mi-check"><${Icon} n="checkmarkSmall" cls="i16"/></div>` : ''}</div></div>`)}</div>`
    : html`<div class="menu-group"><div class="menu-head">Last used</div>${colorRow(lb ? last.slice(0, -11) : last, lb, '⌘⇧H')}</div><div class="menu-group"><div class="menu-head">Text color</div>${COLOR_NAMES.map((c) => colorRow(c, false))}</div><div class="menu-group"><div class="menu-head">Background color</div>${COLOR_NAMES.map((c) => colorRow(c, true))}</div>`;
  return html`<div class="fmt-menu" style=${`left:${fmt.left}px;top:${fmt.top}px`} onMouseDown=${keep}>
    <div class="fm-row" role="button" onMouseEnter=${openSub('turn')} onClick=${openSub('turn')}><${Icon} n=${typeIt.ic} as=${typeIt.as} cls="i20"/><div class="fm-label">${b.type === 'text' ? 'Normal Text' : typeIt.n}</div><span class="fm-chev"><${Icon} n="arrowChevronSingleRightSmall" cls="i16"/></span></div>
    <div class="fm-sep"></div>
    <div class="fm-grid-row" onMouseEnter=${() => sub && sub.kind === 'turn' && setSub(null)}><div class="fm-btn" role="button" onClick=${openSub('color')}><div class="fm-sw" style=${`color:${k ? `var(--c-${k}TexSec)` : 'var(--c-texPri)'}`}>A</div></div>${btn('textBold', () => toggleMark('b'))}${btn('textItalic', () => toggleMark('i'))}${btn('textUnderline', () => toggleMark('_'))}${btn('textX', clearMarks, ' w28')}</div>
    <div class="fm-grid-row" onMouseEnter=${() => setSub(null)}>${btn('link', () => { fmt.link = true; refresh(); })}${btn('textStrikethrough', () => toggleMark('s'))}${btn('code', () => toggleMark('c'))}</div>
    <div class="fm-sep"></div>
    <div class="fm-cmt-row" onMouseEnter=${() => setSub(null)}><div class="fm-cmt" role="button" onClick=${() => { const id = fmt.id; hideFmt(); openBlockComment(id); }}><${Icon} n="commentFilled" cls="i20"/><span>Comment</span></div></div>
    ${READY.ai ? html`<div class="fm-sep nb"></div><div class="fm-skills" onMouseEnter=${() => setSub(null)}><div class="fm-skills-head"><span>Skills</span><div class="sb-act24" role="button"><${Icon} n="sliders" cls="i16"/></div></div><div class="fm-skill-list">${['Improve writing', 'Proofread', 'Explain', 'Reformat'].map((n) => html`<div class="fm-skill" role="button"><span>${n}</span><div class="sb-act24"><${Icon} n="pencilLineSmall" cls="i16"/></div></div>`)}</div></div>` : ''}
    ${READY.ai ? html`<div class="fm-ai"><input placeholder="Edit with AI"/><kbd>⌘⌃E</kbd></div>` : ''}
  </div>${subBody ? html`<div onMouseDown=${keep}><${SubMenu} sub=${sub} cls=${sub.kind === 'color' ? 'colors' : ''}>${subBody}<//></div>` : ''}`;
}


/* ------------------------------------------------------------------ AI page */
const AI_CHIPS = [['squareGrid2X2', 'Create Slides'], ['viewTable', 'Spreadsheets'], ['docTextMagnifyingGlass', 'Research'], ['cursorClick', 'Visualize']];
function openNewChat() { S.aiOpen = null; commit(); go('ai'); }
addEventListener('keydown', (e) => { if (READY.ai && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'o') { e.preventDefault(); openNewChat(); } });
function AiComposer({ onSend }) {
  const ref = useRef(null); const [has, setHas] = useState(false); const [focus, setFocus] = useState(false);
  useEffect(() => { if (ref.current) ref.current.focus(); }, []);
  const send = () => { const el = ref.current; const t = el ? el.innerText.trim() : ''; if (!t) return; el.textContent = ''; setHas(false); onSend(t); };
  return html`<div class=${'ai-box' + (focus ? ' focus' : '')}>
    <div class="ai-input" ref=${ref} contenteditable="true" data-ph="Do anything with AI…" onInput=${(e) => setHas(!!e.currentTarget.textContent.trim())} onFocus=${() => setFocus(true)} onBlur=${() => setFocus(false)} onKeyDown=${(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}></div>
    <div class="ai-bar"><div class="ai-bar-l"><div class="ai-round" role="button"><${Icon} n="plus" cls="i20"/></div><div class="ai-round" role="button"><${Icon} n="sliders" cls="i20"/></div></div><div class="ai-bar-r"><div class="ai-model" role="button">Auto</div><div class=${'ai-send' + (has ? ' on' : '')} role="button" onClick=${send}><${Icon} n="arrowStraightUpFillSmall" cls="i16"/></div></div></div>
  </div>`;
}
// A conversation's bar: a 24px avatar, AI / chat title crumbs (28px, 6px inset), and new chat,
// share, pin and more on a 30px pitch at the right.
function AiTopbar() {
  const chat = S.aiChats[S.aiOpen];
  return html`<div class="nsp-topbar ai-full-bar"><div class="ai-crumbs"><div class="ais-av" role="button"><${AiFace} size=${24}/></div><div class="ai-crumb" role="button" onClick=${openNewChat}>Nemesis AI</div><span class="ai-slash">/</span><div class="ai-crumb" role="button"><span class="ai-crumb-t">${chat.title}</span><${Icon} n="arrowChevronSingleDownSmall" cls="i16"/></div></div><div class="ai-bar-r">${[['chatBubblePlus', 'New chat', openNewChat], ['squareAndArrowUp', 'Share'], ['pin', 'Pin chat'], ['ellipsis', 'More actions']].map(([ic, label, fn]) => html`<div class="ais-hb" role="button" aria-label=${label} onClick=${fn}><${Icon} n=${ic} cls="i20"/></div>`)}</div></div>`;
}
// The new-chat page: a 44px bar (AI / New AI chat, a new-chat button), then a 694px column centred in
// the frame and pinned 24px off the bottom: a 64px avatar with the Personalize pill, a 17px heading, four 32px suggestion
// rows on a 35px pitch, and a 100px composer with no page chip.
const AI_FULL_ROWS = [['magnifyingGlass', 'Search this workspace'], ['aiDescription', 'Summarize this page'], ['listBullet', 'Make a study plan'], ['filePdf', 'Explain a PDF or image']];
function AiFullTopbar() {
  return html`<div class="nsp-topbar ai-full-bar"><div class="ai-crumbs"><div class="ai-crumb" role="button" onClick=${openNewChat}>Nemesis AI</div><span class="ai-slash">/</span><div class="ai-crumb" role="button"><span>New AI chat</span><${Icon} n="arrowChevronSingleDownSmall" cls="i16"/></div></div><div class="ais-hb" role="button" aria-label="New chat" onClick=${openNewChat}><${Icon} n="chatBubblePlus" cls="i20"/></div></div>`;
}
function AiPage() {
  const chat = S.aiChats && S.aiOpen ? S.aiChats[S.aiOpen] : null;
  if (chat && chat.unread && !chat.running) chat.unread = false; // a chat read in full page is read
  const start = (t) => { S.aiChats = S.aiChats || {}; const id = 'c' + uid(); S.aiChats[id] = { id, title: t.slice(0, 80), messages: [{ role: 'user', text: t, at: NOW() }] }; S.aiOpen = id; S.sidebar.chats = [{ id, title: t.slice(0, 80), date: 'Today' }, ...S.sidebar.chats]; commit(); };
  const startFull = (t) => { const id = newSideChat(t, null); S.aiSide = { open: false, chat: id }; S.aiOpen = id; S.aiChats[id].working = 'Thinking'; commit(); aiLater(id, 1200, (c) => { c.messages.push({ role: 'assistant', kind: 'text', text: 'Nemesis AI is not answering in this workspace yet.' }, { role: 'assistant', kind: 'actions' }); c.running = false; c.working = null; }); };
  if (!chat) return html`<div class="ai-page ai-full"><div class="ai-full-col">
    <div class="ai-full-sp"></div>
    <div class="ai-full-top"><div class="aish-avw ai64"><div class="aish-av ai64"><${AiFace} size=${64}/></div><div class="aish-pz" role="button"><${Icon} n="pencilLine" cls="i14"/><span>Personalize</span></div></div><div class="ai-full-h">How can I help you today?</div></div>
    <div class="ai-full-menu"><div class="aish-menu-in" role="menu">${AI_FULL_ROWS.map(([ic, label, badge]) => html`<div class="aish-row" role="menuitem" onClick=${() => startFull(label)}><${Icon} n=${ic} cls="i20"/><span>${label}</span>${badge ? html`<span class="aish-new">${badge}</span>` : ''}</div>`)}</div></div>
    <div class="ai-full-dock"><${AiSideComposer} chat=${null} page=${null} onSend=${startFull}/></div>
  </div></div>`;
  return html`<div class="ai-page thread"><div class="ai-thread ais-full">${chat.messages.map((m, i) => html`<${AiSideItem} key=${i} chat=${chat} m=${m} last=${i === chat.messages.length - 1 && !chat.running && !chat.form}/>`)}${chat.running && chat.working ? html`<div class="ais-working"><span class="ais-spin"></span><span>${chat.working}</span></div>` : ''}</div><div class="ai-dock">${chat.form ? html`<${AiQuestionCard} key=${chat.id + ':' + chat.form.step} chat=${chat}/>` : html`<${AiSideComposer} chat=${chat} page=${null} onSend=${(t) => sendSideMessage(chat.id, t, null)}/>`}</div></div>`;
}


/* ------------------------------------------------------------------ AI side panel */
// Measured live on an empty page (Start a draft, Research a topic): a 360px column right of the page behind a 1px
// --c-borSec edge, a 44px header, a thread padded 16px, and the composer (or a question card) 16px off the bottom.
// Start a draft asks five questions on a card that replaces the composer, then writes a template into the page.
const DRAFT_QS = [
  { q: 'What is this draft about?', opts: ['Project update', 'Proposal', 'Meeting notes', 'Resume / portfolio', 'Personal statement'], search: true },
  { q: 'Who is it for?', opts: ['Just me', 'Manager', 'My team', 'Client', 'Public / online'], search: true },
  { q: 'What should happen after they read it?', opts: ['Stay informed', 'Approve a decision', 'Give feedback', 'Take action items', 'Buy into an idea'], search: true },
  { q: 'Do you want an outline or full draft?', opts: ['Outline', 'Full draft'] },
  { q: 'Do you have any notes or links to use?', opts: ['No, start from scratch', 'Yes, I’ll paste here', 'Yes, it’s a page in this workspace'], other: 'Or, describe your requirements…' },
];
const aiSideOpen = () => !!(S.aiSide && S.aiSide.open);
const aiSideChat = () => (aiSideOpen() && S.aiSide.chat && S.aiChats && S.aiChats[S.aiSide.chat]) || null;
const aiTime = (at) => new Date(at || NOW()).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
function closeAiSide() { S.aiSide = { open: false, chat: S.aiSide ? S.aiSide.chat : null }; commit(); }
function newSideChat(title, pid) {
  S.aiChats = S.aiChats || {};
  const id = 'c' + uid();
  S.aiChats[id] = { id, title, page: pid || null, running: true, unread: true, messages: [{ role: 'user', text: title, at: NOW() }] };
  S.sidebar.chats = [{ id, title, date: 'Today' }, ...S.sidebar.chats];
  S.recents = ['chat:' + id, ...(S.recents || []).filter((x) => x !== 'chat:' + id)];
  S.aiSide = { open: true, chat: id };
  commit();
  return id;
}
function aiLater(id, ms, fn) {
  const at = Date.now();
  setTimeout(() => { const c = S.aiChats && S.aiChats[id]; if (!c || (c.stopped && c.stopped >= at)) return; fn(c); commit(); }, ms);
}
function startDraft(page) {
  const id = newSideChat('Start a draft', page && page.id);
  S.aiChats[id].working = 'Crafting'; commit();
  aiLater(id, 1400, (c) => {
    c.messages.push({ role: 'assistant', kind: 'thought' }, { role: 'assistant', kind: 'text', text: 'I’ll get a first draft going. Answer these quick questions so I can tailor it, then I’ll write it on this page.' }, { role: 'assistant', kind: 'actions' });
    c.form = { step: 0, answers: [], sel: [], typed: [] }; c.running = false; c.working = null;
  });
}
function startResearch(page) {
  const id = newSideChat('Research a topic', page && page.id);
  S.aiChats[id].working = 'Thinking'; commit();
  aiLater(id, 1600, (c) => { c.messages.push({ role: 'assistant', kind: 'research' }, { role: 'assistant', kind: 'actions' }); c.running = false; c.working = null; });
}
function sendSideMessage(chatId, text, page) {
  let id = chatId && S.aiChats && S.aiChats[chatId] ? chatId : null;
  if (!id) id = newSideChat(text, page && page.id);
  else { const c = S.aiChats[id]; c.messages.push({ role: 'user', text, at: NOW() }); c.running = true; S.recents = ['chat:' + id, ...S.recents.filter((x) => x !== 'chat:' + id)]; }
  S.aiChats[id].working = 'Thinking'; commit();
  aiLater(id, 1200, (c) => { c.messages.push({ role: 'assistant', kind: 'text', text: 'Nemesis AI is not answering in this workspace yet.' }, { role: 'assistant', kind: 'actions' }); c.running = false; c.working = null; });
}
const rB = (t) => [t, [['b']]];
const rT = (t) => [t];
// The Project update template is the one the live app wrote, block for block; the others follow its shape.
function draftBlocks(kind, full) {
  const today = isoDate(new Date(NOW()));
  const H2 = (t) => ['sub_header', [rT(t)]]; const H3 = (t) => ['sub_sub_header', [rT(t)]]; const H4 = (t) => ['header_4', [rT(t)]];
  const P = (t) => ['text', [rT(t)]]; const todo = () => ['to_do', [rT('[Placeholder]')]];
  const bl = (label, rest) => ['bulleted_list', label ? [rB(label), rT(' ' + (rest || '[Placeholder]'))] : [rT(rest || '[Placeholder]')]];
  const meta = (...more) => ['text', [rB('Date:'), rT(' '), ['‣', [['d', today]]], rT('\n'), rB('Owner:'), rT(' ' + (space.me.firstName || 'Me')), ...more]];
  const table = (rows) => ['table', [], { rows, headerRow: true, widths: rows[0].map(() => 240) }];
  const T = {
    'Project update': [H2('Project update ({{date}})'), meta(rT('\n'), rB('Status:'), rT(' [Placeholder: On track / At risk / Off track]')),
      H3('1) Summary'), P('[2–4 sentences summarizing what changed since the last update, where things stand now, and what matters next.]'),
      H3('2) Key outcomes since last update'), bl('Shipped / completed:'), bl('In progress:'), bl('Decisions made:'),
      H3('3) Progress by workstream'), H4('Workstream A: [Placeholder name]'), bl('What we did:'), bl('What’s next:'), bl('Notes / links:'),
      H4('Workstream B: [Placeholder name]'), bl('What we did:'), bl('What’s next:'), bl('Notes / links:'),
      H3('4) Metrics / evidence (optional)'), table([['Metric', 'Current', 'Previous', 'Notes'], ['[Placeholder]', '[-]', '[-]', '[Placeholder]']]),
      H3('5) Risks & mitigations'), ['bulleted_list', [rB('Risk:'), rT(' [Placeholder]\n'), rB('Impact:'), rT(' [Placeholder]\n'), rB('Mitigation:'), rT(' [Placeholder]')]],
      H3('6) Blockers / help needed'), ['bulleted_list', [rB('Blocker:'), rT(' [Placeholder]\n'), rB('Owner:'), rT(' [Placeholder] • '), rB('Needed by:'), rT(' [Placeholder date]')]],
      H3('7) Next steps (1–2 weeks)'), todo(), todo(),
      H3('8) Appendix (optional)'), bl('', 'Links, notes, or artifacts: [Placeholder]')],
    Proposal: [H2('Proposal: [Placeholder title]'), meta(rT('\n'), rB('Status:'), rT(' Draft')),
      H3('1) Summary'), P('[2–3 sentences on what you are proposing and why it matters now.]'),
      H3('2) Problem'), bl('Current situation:'), bl('Why it matters:'),
      H3('3) Proposed approach'), bl('What we will do:'), bl('Out of scope:'),
      H3('4) Timeline and milestones'), table([['Milestone', 'Owner', 'Date'], ['[Placeholder]', '[Placeholder]', '[Placeholder date]']]),
      H3('5) Resources and cost'), bl('People:'), bl('Budget:'),
      H3('6) Risks'), bl('Risk:'), H3('7) Decision needed'), todo()],
    'Meeting notes': [H2('Meeting notes ({{date}})'), meta(rT('\n'), rB('Attendees:'), rT(' [Placeholder]')),
      H3('1) Agenda'), bl('', '[Placeholder]'), bl('', '[Placeholder]'),
      H3('2) Discussion'), P('[Key points raised, in the order they came up.]'),
      H3('3) Decisions'), bl('', '[Placeholder]'),
      H3('4) Action items'), todo(), todo()],
    'Resume / portfolio': [H2('[Your name]'), P('[Role or field] • [City] • [Email] • [Link]'),
      H3('Summary'), P('[2–3 sentences on what you do and what you are looking for.]'),
      H3('Experience'), H4('[Role], [Organization]'), bl('', '[Placeholder date range]'), bl('', '[What you did and the result]'),
      H3('Projects'), H4('[Project name]'), bl('', '[What it is and your part in it]'),
      H3('Education'), bl('', '[Degree or program], [School], [Year]'),
      H3('Skills'), bl('', '[Placeholder]')],
    'Personal statement': [H2('Personal statement'), P('[Program or opportunity] • [Word limit]'),
      H3('1) Opening'), P('[A specific moment or question that shows why this matters to you.]'),
      H3('2) What you have done'), P('[Two or three experiences and what each taught you.]'),
      H3('3) Why this program'), P('[What draws you here, in concrete terms.]'),
      H3('4) What you will bring'), P('[Your goals and how you plan to contribute.]'),
      H3('5) Closing'), P('[Tie back to the opening in one or two sentences.]')],
  };
  const out = T[kind] || [H2(kind), meta(), H3('1) Summary'), P('[Placeholder]'), H3('2) Details'), bl('', '[Placeholder]'), bl('', '[Placeholder]'), H3('3) Next steps'), todo()];
  return full ? out : out.filter((blk, i) => blk[0] !== 'text' || i === 1);
}
function submitDraft(id) {
  const c = S.aiChats[id]; if (!c || !c.form) return;
  const f = c.form; const answers = DRAFT_QS.map((q, i) => f.answers[i] || null);
  const qa = { role: 'assistant', kind: 'qa', items: DRAFT_QS.map((q, i) => [q.q, answers[i] || 'Skipped']) };
  const ai = c.messages.map((m) => m.kind).lastIndexOf('actions');
  if (ai >= 0) c.messages.splice(ai, 0, qa); else c.messages.push(qa);
  const kind = answers[0] || 'Draft'; const full = answers[3] !== 'Outline';
  c.form = null; c.running = true;
  c.messages.push({ role: 'assistant', kind: 'steps', label: 'Creating ' + kind.toLowerCase() + ' template', running: true });
  commit();
  aiLater(id, 2400, (c2) => {
    const st = c2.messages.find((m) => m.kind === 'steps' && m.running); if (st) st.running = false;
    const page = S.pages[c2.page];
    if (page && page.content) {
      const prevTitle = page.title || ''; const ids = [];
      draftBlocks(kind, full).forEach(([type, title, extra]) => { const b = newBlock(type, title, page.id); if (extra) Object.assign(b, JSON.parse(JSON.stringify(extra))); page.content.push(b.id); ids.push(b.id); });
      if (!prevTitle) page.title = kind;
      page.lastEdited = NOW();
      c2.messages.push({ role: 'assistant', kind: 'text', text: `All set. I drafted a “${kind}” ${full ? 'full-draft' : 'outline'} template on the current page, ready for you to fill in${kind === 'Project update' ? ' with your latest progress' : ''}.`, change: { title: 'Drafted ' + kind + ' template', page: page.id, ids, prevTitle } });
    }
    c2.messages.push({ role: 'assistant', kind: 'actions', undo: true });
    c2.running = false;
  });
}
function undoDraft(m) {
  const ch = m && m.change; if (!ch || ch.undone) return;
  const page = S.pages[ch.page];
  if (page) { page.content = page.content.filter((x) => !ch.ids.includes(x)); if (!ch.prevTitle) page.title = ''; }
  ch.ids.forEach((x) => { delete S.blocks[x]; });
  ch.undone = true; commit();
}
function AiFace({ size }) {
  return html`<div class="ais-face" style=${`width:${size}px;height:${size}px`}><span class="ais-mark" dangerouslySetInnerHTML=${{ __html: ICONS.nemesisMark }}></span></div>`;
}
function AiSideHeader({ chat }) {
  const hb = (n, label, fn) => html`<div class="ais-hb" role="button" aria-label=${label} onClick=${fn}><${Icon} n=${n} cls=${n === 'ellipsisSmall' ? 'i20 pri' : 'i20'}/></div>`;
  const fresh = () => { S.aiSide = { open: true, chat: null }; commit(); };
  const full = () => { S.aiOpen = chat ? chat.id : null; S.aiSide = { open: false, chat: S.aiSide.chat }; commit(); go('ai'); };
  return html`<div class="ais-head">
    <div class="ais-head-l">${chat ? html`<div class="ais-av" role="button"><${AiFace} size=${24}/></div>` : ''}<div class="ais-title" role="button"><div class="ais-title-t">${chat ? chat.title : 'New AI chat'}</div><${Icon} n="arrowChevronSingleDownSmall" cls="i16"/></div></div>
    <div class="ais-head-r">${hb('chatBubblePlus', 'New chat', fresh)}${chat ? hb('squareAndArrowUp', 'Share') : ''}${hb('peekSide', 'Open in full page', full)}${chat ? hb('pin', 'Pin chat') : ''}${chat ? hb('ellipsisSmall', 'More actions') : ''}${hb('arrowChevronDoubleForward', 'Close', closeAiSide)}</div>
  </div>`;
}
function AiSideThread({ chat }) {
  const ref = useRef(null); const n = chat.messages.length;
  useLayoutEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight; }, [n, chat.running, !!chat.form]);
  return html`<div class="ais-scroll" ref=${ref}><div class="ais-thread">
    ${chat.messages.map((m, i) => html`<${AiSideItem} key=${i} chat=${chat} m=${m} last=${i === n - 1 && !chat.running && !chat.form}/>`)}
    ${chat.running && chat.working ? html`<div class="ais-working"><span class="ais-spin"></span><span>${chat.working}</span></div>` : ''}
  </div></div>`;
}
const AI_ACTS = [['duplicateSmall', 'Copy response'], ['plusSmall', 'Insert into this page'], ['handThumbsUpSmall', 'Share positive feedback'], ['handThumbsDownSmall', 'Share negative feedback']];
function AiSideItem({ chat, m, last }) {
  if (m.role === 'user') return html`<div class="ais-user"><div class="ais-bubble-w"><div class="ais-bubble">${m.text}</div></div><div class="ais-user-meta"><span class="ais-time">${aiTime(m.at)}</span><div class="ais-ib" role="button" aria-label="Edit"><${Icon} n="pencilLineSmall" cls="i16"/></div><div class="ais-ib" role="button" aria-label="Copy text"><${Icon} n="duplicateSmall" cls="i16"/></div></div></div>`;
  if (m.kind === 'thought') return html`<div class="ais-c"><div class="ais-toggle" role="button"><span>Thought</span><${Icon} n="arrowChevronSingleRight" cls="i14"/></div></div>`;
  if (m.kind === 'text') return html`<div class="ais-c ais-text"><div>${m.text}</div>${m.change ? html`<div class=${'ais-change' + (m.change.undone ? ' undone' : '')} onClick=${() => { go(m.change.page); }}><div class="ais-change-t">${m.change.title}</div><div class="ais-change-acts"><div class="ais-show" role="button">Show changes</div><div class="ais-ib" role="button" aria-label="Undo" onClick=${(e) => { e.stopPropagation(); undoDraft(m); }}><${Icon} n="arrowUTurnUpLeftSmall" cls="i16"/></div></div></div>` : ''}</div>`;
  if (m.kind === 'research') return html`<${AiResearchReply}/>`;
  if (m.kind === 'qa') return html`<div class="ais-qa">${m.items.map(([q, a], i) => html`${i ? html`<div class="ais-qa-div"></div>` : ''}<div class="ais-qa-item"><div class="ais-qa-q">${q}</div><div class="ais-qa-a">${a}</div></div>`)}</div>`;
  if (m.kind === 'steps') return html`<${AiSteps} m=${m}/>`;
  if (m.kind === 'actions') {
    const changed = m.undo ? [...chat.messages].reverse().find((x) => x.change) : null;
    return html`<div class=${'ais-acts' + (last ? ' on' : '')}><div class="ais-acts-l">${AI_ACTS.map(([n, l]) => html`<div class="ais-ib" role="button" aria-label=${l}><${Icon} n=${n} cls="i16"/></div>`)}</div>${changed && !changed.change.undone ? html`<div class="ais-undo" role="button" onClick=${() => undoDraft(changed)}><${Icon} n="arrowUTurnUpLeftSmall" cls="i16"/><span>Undo</span></div>` : ''}</div>`;
  }
  return null;
}
function AiSteps({ m }) {
  const [open, setOpen] = useState(false);
  if (m.running) return html`<div class="ais-c"><div class="ais-toggle run" role="button"><span class="ais-spin"></span><span>${m.label}</span><${Icon} n="arrowChevronSingleRight" cls="i14 rot"/></div></div>`;
  return html`<div class="ais-c"><div class="ais-toggle" role="button" onClick=${() => setOpen(!open)}><span>2 steps</span><${Icon} n="arrowChevronSingleRight" cls=${'i14' + (open ? ' rot' : '')}/></div>${open ? html`<div class="ais-steps"><div class="ais-step"><i></i><span>Thought</span></div><div class="ais-step"><i></i><span>${m.label}</span></div></div>` : ''}</div>`;
}
function AiResearchReply() {
  const wants = ['quick overview (5–10 bullets)', 'deeper briefing (1–2 pages)', 'compare viewpoints / controversies', 'practical checklist / study guide'];
  return html`<div class="ais-c ais-md">
    <div>What topic should I research, and what’s the goal of the research?</div>
    <div class="ais-ol"><span class="ais-num">1.</span><div class="ais-li"><b>Topic/keyword(s):</b> (e.g., “causes of the 2008 financial crisis,” “how suspension bridges carry load,” “history of the printing press,” etc.)</div></div>
    <div class="ais-ol"><span class="ais-num">2.</span><div class="ais-li-col"><div class="ais-li"><b>What you want out of it:</b></div>${wants.map((t) => html`<div class="ais-ul"><span class="ais-dot"><i>•</i></span><div class="ais-li2">${t}</div></div>`)}</div></div>
    <div class="ais-ol"><span class="ais-num">3.</span><div class="ais-li"><b>Any constraints:</b> school level (undergrad/grad), preferred sources (guidelines, primary papers, textbooks), and whether you want it <b>saved into the blank page you’re on</b>.</div></div>
  </div>`;
}
function AiQuestionCard({ chat }) {
  const f = chat.form; const Q = DRAFT_QS[f.step]; const lastQ = f.step === DRAFT_QS.length - 1;
  const [typed, setTyped] = useState(f.typed[f.step] || ''); const [hi, setHi] = useState(0);
  const rootRef = useRef(null); const inRef = useRef(null);
  const opts = Q.opts.map((o, i) => [o, i]).filter(([o]) => !Q.search || !typed || o.toLowerCase().includes(typed.toLowerCase()));
  const sel = f.sel[f.step]; const count = opts.length + (Q.other ? 1 : 0);
  useEffect(() => { const el = Q.search ? inRef.current : rootRef.current; if (el) el.focus(); }, []);
  const choose = (i) => { f.sel[f.step] = i; commit(); };
  const advance = (skip) => {
    f.typed[f.step] = typed; const cur = f.sel[f.step];
    f.answers[f.step] = skip ? null : typeof cur === 'number' ? Q.opts[cur] : typed.trim() || null;
    if (lastQ) submitDraft(chat.id); else { f.step += 1; commit(); }
  };
  const back = () => { f.typed[f.step] = typed; f.step -= 1; commit(); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((hi + 1) % Math.max(1, count)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((hi - 1 + count) % Math.max(1, count)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (hi < opts.length && (typeof f.sel[f.step] !== 'number')) choose(opts[hi][1]); advance(false); }
    else if (!Q.search && e.target === rootRef.current && /^[1-9]$/.test(e.key)) { const k = +e.key - 1; if (k < opts.length) { choose(opts[k][1]); setHi(k); } }
  };
  const radio = (on) => html`<div class=${'aq-radio' + (on ? ' on' : '')}>${on ? html`<i></i>` : ''}</div>`;
  return html`<div class="aq" ref=${rootRef} tabIndex="-1" onKeyDown=${onKey}>
    <div class="aq-form" role="form">
      <div class="aq-head">${f.step ? html`<div class="aq-back-w"><div class="aq-back" role="button" aria-label="Previous question" onClick=${back}><${Icon} n="arrowStraightLeftSmall" cls="i16"/></div></div>` : ''}<div class="aq-q">${Q.q}</div><div class="aq-n">${f.step + 1} / ${DRAFT_QS.length}</div></div>
      ${Q.search ? html`<div class="aq-sw"><div class="aq-s"><input ref=${inRef} type="text" role="combobox" placeholder="Search or describe your requirements…" value=${typed} onInput=${(e) => { setTyped(e.currentTarget.value); setHi(0); }}/></div></div>` : ''}
      <div class="aq-list" role="listbox">
        ${opts.map(([o, i], k) => html`<div class=${'aq-opt' + (hi === k ? ' hi' : '')} role="option" aria-selected=${sel === i ? 'true' : 'false'} onMouseEnter=${() => setHi(k)} onClick=${() => { choose(i); setHi(k); }}>${radio(sel === i)}<div class="aq-label">${o}</div>${Q.search ? '' : html`<div class=${'aq-kbd' + (sel === i ? ' on' : '')}>${k + 1}</div>`}</div>`)}
        ${Q.other ? html`<div class=${'aq-opt other' + (hi === opts.length ? ' hi' : '')} role="option" aria-selected=${sel === 'other' ? 'true' : 'false'} onMouseEnter=${() => setHi(opts.length)}>${radio(sel === 'other')}<div class="aq-other" contenteditable="true" data-ph=${Q.other} onInput=${(e) => { const t = e.currentTarget.textContent; setTyped(t); if (t.trim()) { f.sel[f.step] = 'other'; commit(); } }}></div><div class=${'aq-kbd' + (sel === 'other' ? ' on' : '')}>${opts.length + 1}</div></div>` : ''}
      </div>
    </div>
    <div class="aq-foot"><div class="aq-skip" role="button" onClick=${() => advance(true)}>Skip</div><div class="aq-next" role="button" onClick=${() => advance(false)}>${lastQ ? 'Send' : 'Next'}</div></div>
  </div>`;
}
function AiSideComposer({ chat, page, onSend }) {
  const ref = useRef(null); const [has, setHas] = useState(false); const [focus, setFocus] = useState(false);
  useEffect(() => { if (ref.current && (!chat || chat.messages.length <= 1)) ref.current.focus(); }, []);
  const send = () => { const el = ref.current; const t = el ? el.innerText.trim() : ''; if (!t) return; el.textContent = ''; setHas(false); if (onSend) onSend(t); else sendSideMessage(chat && chat.id, t, page); };
  const stop = () => { chat.stopped = Date.now(); chat.running = false; chat.working = null; chat.messages.forEach((x) => { if (x.kind === 'steps') x.running = false; }); commit(); };
  return html`<div class=${'aisc' + (focus ? ' focus' : '')}>
    ${page ? html`<div class="aisc-chips"><div class="aisc-chip" role="button"><div class="aisc-chip-ic">${page.icon && page.icon.emoji ? html`<span class="aisc-emoji">${page.icon.emoji}</span>` : html`<${Icon} n="page" cls="i16"/>`}</div><div class="aisc-chip-t">${pageTitleText(page) || 'New page'}</div></div></div>` : ''}
    <div class="aisc-input" ref=${ref} contenteditable="true" data-ph="Do anything with AI…" onInput=${(e) => setHas(!!e.currentTarget.textContent.trim())} onFocus=${() => setFocus(true)} onBlur=${() => setFocus(false)} onKeyDown=${(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}></div>
    <div class="aisc-bar"><div class="aisc-l"><div class="ais-round" role="button" aria-label="Give context"><${Icon} n="plus" cls="i20"/></div><div class="ais-round" role="button" aria-label="Settings"><${Icon} n="sliders" cls="i20"/></div></div>
      <div class="aisc-r"><div class="ais-model" role="button">Auto</div>${chat && chat.running ? html`<div class="ais-send stop" role="button" aria-label="Stop AI message" onClick=${stop}><${Icon} n="mediaStopFillSmall" cls="i16"/></div>` : html`<div class=${'ais-send' + (has ? ' on' : '')} role="button" aria-label="Send" onClick=${send}><${Icon} n="arrowStraightUpFillSmall" cls="i16"/></div>`}</div></div>
  </div>`;
}
function AiSideHome({ page }) {
  const rows = AI_FULL_ROWS;
  return html`<div class="aish"><div class="aish-sp"></div><div class="aish-body">
    <div class="aish-top"><div class="aish-avw"><div class="aish-av"><${AiFace} size=${50}/></div><div class="aish-pz" role="button"><${Icon} n="pencilLine" cls="i14"/><span>Personalize</span></div></div><div class="aish-h">How can I help you today?</div></div>
    <div class="aish-menu"><div class="aish-menu-in" role="menu">${rows.map(([ic, label, badge]) => html`<div class="aish-row" role="menuitem" onClick=${() => sendSideMessage(null, label, page)}><${Icon} n=${ic} cls="i20"/><span>${label}</span>${badge ? html`<span class="aish-new">${badge}</span>` : ''}</div>`)}</div></div>
  </div></div>`;
}
function AiSidePanel({ page }) {
  if (!aiSideOpen()) return null;
  const chat = aiSideChat();
  return html`<aside class="ais" aria-label="Nemesis AI"><div class="ais-edge"></div><${AiSideHeader} chat=${chat}/>${chat ? html`<${AiSideThread} chat=${chat}/>` : html`<${AiSideHome} page=${page}/>`}<div class="ais-bottom">${chat && chat.form ? html`<${AiQuestionCard} key=${chat.id + ':' + chat.form.step} chat=${chat}/>` : html`<${AiSideComposer} key=${'c' + (chat ? chat.id : 'new')} chat=${chat} page=${page}/>`}</div></aside>`;
}
function ChatRecentRow({ id }) {
  const c = S.aiChats && S.aiChats[id]; if (!c) return null;
  return html`<a class="sb-item page chat" onClick=${() => { c.unread = false; S.aiSide = { open: true, chat: id }; commit(); }}><div class="sb-item-inner"><div class="sb-item-icon"><${Icon} n="chatBubble" cls="i20"/></div><div class="sb-item-label"><span>${c.title}</span></div>${c.unread ? html`<i class="sb-unread"></i>` : ''}</div></a>`;
}

/* ------------------------------------------------------------------ sidebar section "…" menus (measured: 220px, same rows as every menu) */
const sectionOrder = () => { const base = SECTION_DEFS.map((d) => d.key); const o = (S.sidebar.order || base).filter((k) => base.includes(k)); base.forEach((k) => { if (!o.includes(k)) o.push(k); }); return o; };
const showCount = (key) => (S.sidebar.show || {})[key] || 10;
function SectionMenu({ data }) {
  const key = data.key; const order = sectionOrder().filter((k) => !(S.sidebar.hidden || {})[k]); const idx = order.indexOf(key);
  const left = Math.max(8, Math.min(overlay.r.left, innerWidth - 228)); const top = Math.max(8, Math.min(overlay.r.bottom + 4, innerHeight - 220));
  const move = (dir) => { const full = sectionOrder(); const a = full.indexOf(key); const b = full.indexOf(order[idx + dir]); [full[a], full[b]] = [full[b], full[a]]; S.sidebar.order = full; closeOverlay(); commit(); };
  const show = showCount(key);
  const first = [];
  if (key === 'private') first.push(html`<${MenuItem} ic="arrowUpDown" label="Sort" val="Last edited" valSm chev/>`);
  if (key === 'recents' || key === 'agents' || key === 'private') first.push(html`<${MenuItem} ic="number" label="Show" val=${String(show)} valSm chev onClick=${() => { S.sidebar.show = { ...(S.sidebar.show || {}), [key]: { 5: 10, 10: 15, 15: 20, 20: 5 }[show] || 10 }; commit(); }}/>`);
  return html`<div class="menu sec-menu" style=${`left:${left}px;top:${top}px`}>
    ${first.length ? html`<div class="menu-group">${first}</div>` : ''}
    <div class="menu-group">${idx > 0 ? html`<${MenuItem} ic="arrowStraightUp" label="Move up" onClick=${() => move(-1)}/>` : ''}${idx < order.length - 1 ? html`<${MenuItem} ic="arrowStraightDown" label="Move down" onClick=${() => move(1)}/>` : ''}<${MenuItem} ic="xMark" label="Remove section" desc=${key === 'apps' ? 'Bring Apps back from Customize sidebar.' : ''} onClick=${() => { S.sidebar.hidden = { ...(S.sidebar.hidden || {}), [key]: true }; closeOverlay(); commit(); }}/></div>
    <div class="menu-group"><${MenuItem} ic="sliders" label="Customize sidebar" onClick=${closeOverlay}/></div>
  </div>`;
}


/* ------------------------------------------------------------------ meeting notes from the sidebar lists */
function openMeetingNote(title, fresh, when) {
  if (!S.meetingPages) S.meetingPages = {};
  const key = fresh ? 'new-' + uid() : title;
  let pid = S.meetingPages[key];
  if (!pid || !S.pages[pid] || S.pages[pid].trashed) {
    pid = uid();
    const label = when || 'Today';
    const time = new Date(NOW()).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
    const tb = newBlock('transcription', fresh ? [] : [[title + ' ']], pid);
    const blk = (type, text, extra) => { const b = newBlock(type, text ? [[text]] : [], tb.id); Object.assign(b, extra || {}); return b; };
    if (!fresh) [blk('sub_sub_header', 'Action items'), blk('to_do', 'Review the notes and confirm next steps', { checked: false }), blk('sub_sub_header', 'Discussion'), blk('bulleted_list', 'The summary appears here once the meeting is transcribed')].forEach((b) => tb.children.push(b.id));
    const note = blk('text', '');
    Object.assign(tb, { when: label, tab: fresh ? 'notes' : 'summary', share: !fresh, notes: [note.id], transcript: [], fresh: !!fresh });
    const mention = fresh ? `Today ${time}` : label;
    const hm = new Date(NOW()).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });
    S.pages[pid] = { id: pid, kind: 'page', icon: null, title: 'Meeting ', titleMention: mention, titleParts: ['Meeting ', '@' + mention], ...(fresh ? { titleDate: isoDate(new Date(NOW())) + 'T' + hm } : {}), content: [tb.id], lastEdited: NOW(), parent: null, section: 'private' };
    S.sidebar.private.unshift(pid);
    S.meetingPages[key] = pid;
  }
  commit(); go(pid);
}


/* ------------------------------------------------------------------ Library, Trash, Help (measured) */
function sidebarLink(label, el) {
  if (label === 'Templates') { go('marketplace'); return; }
  if (label === 'Library') go('library'); else if (label === 'My Tasks') go('tasks'); else if (label === 'Trash') { space.loadTrash(); openOverlay('trash', el); } else if (label === 'Help') openOverlay('help', el);
}
function restorePage(pid) {
  const p = S.pages[pid]; if (!p) return;
  Object.values(S.pages).forEach((x) => { let c = x; while (c) { if (c.id === pid) { delete x.trashed; break; } c = c.parent ? S.pages[c.parent] : null; } });
  if (!p.parent) { const list = p.section === 'workspace' ? S.sidebar.workspace : S.sidebar.private; if (!list.includes(pid)) list.unshift(pid); }
  S.trash = (S.trash || []).filter((x) => x !== pid); commit();
}
function destroyPage(pid) {
  const p = S.pages[pid]; if (!p) return;
  const dropB = (bid) => { const b = S.blocks[bid]; if (!b) return; (b.children || []).forEach(dropB); (b.notes || []).forEach(dropB); delete S.blocks[bid]; };
  const kill = (id) => { const pg = S.pages[id]; if (!pg) return; (pg.content || []).map((x) => S.blocks[x]).filter((b) => b && b.type === 'page').forEach((b) => kill(b.pageId)); (pg.content || []).forEach(dropB); delete S.pages[id]; S.recents = S.recents.filter((x) => x !== id); S.sidebar.private = S.sidebar.private.filter((x) => x !== id); S.sidebar.workspace = S.sidebar.workspace.filter((x) => x !== id); S.sidebar.shared = S.sidebar.shared.filter((x) => x !== id); S.trash = (S.trash || []).filter((x) => x !== id); };
  if (p.parent && S.pages[p.parent]) { const par = S.pages[p.parent]; par.content = par.content.filter((bid) => !(S.blocks[bid] && S.blocks[bid].type === 'page' && S.blocks[bid].pageId === pid)); }
  kill(pid);
  if (isUuid(route()) && !S.pages[route()]) go('home');
  commit();
}
/* ------------------------------------------------------------------ sidebar compose menu */
// Measured: the round button at the foot of the sidebar opens a 180px card 8px above it (Page, Chat, AI Meeting Notes,
// Database) on 32px rows with a 1px gap and a 4px inset, and turns into a close cross while it is open.
function newDatabasePage() {
  const { cid, vid } = makeDatabaseParts('table', 'Default view'); const pid = uid();
  S.pages[pid] = { id: pid, kind: 'database', title: '', description: '', collection: cid, views: [vid], icon: null, lastEdited: NOW(), parent: null, section: 'private' };
  S.sidebar.private.unshift(pid); commit(); go(pid);
}
function ComposeMenu() {
  const r = overlay.r; const [hi, setHi] = useState(0);
  const items = [['pageEmpty', 'Page', () => createPage(null)], ...(READY.ai ? [['chatBubble', 'Chat', openNewChat]] : []), ...(READY.meetings ? [['microphone', 'AI Meeting Notes', () => openMeetingNote('', true)]] : []), ['viewTable', 'Database', newDatabasePage]];
  return html`<div class="menu compose-menu" role="menu" style=${`left:${r.left}px;bottom:${innerHeight - r.top + 8}px`}>${items.map(([ic, label, fn], i) => html`<div class=${'cm-row' + (hi === i ? ' on' : '')} role="menuitem" onMouseEnter=${() => setHi(i)} onClick=${() => { closeOverlay(); fn(); }}><${Icon} n=${ic} cls="i20"/><span>${label}</span></div>`)}</div>`;
}
/* ------------------------------------------------------------------ media blocks */
// Measured on a live image block: an 8px padded row holding a 49px, 10px-radius placeholder (25px icon, 12px gap, 14px
// label) and a 540px Upload | Link | Unsplash | GIPHY popover hanging straight off its bottom edge.
const MEDIA = { image: ['photo', 'Add an image'], video: ['playButton', 'Embed or upload a video'], audio: ['volumeOn', 'Embed or upload audio'], file: ['paperClip', 'Upload or embed a file'], bookmark: ['bookmark', 'Add a web bookmark'] };
function MediaBlock({ b }) {
  const [ic, label] = MEDIA[b.type];
  if (!b.src) return html`<div class="nb-w nb-media"><div class="media-ph" role="button" onClick=${(e) => openOverlay('mediaPicker', e.currentTarget, { id: b.id })}><${Icon} n=${ic} cls="i25"/><span>${label}</span></div></div>`;
  const src = space.fileUrl(b.src);
  if (b.type === 'image') return html`<div class="nb-w nb-media has"><img class="media-img" src=${src} alt=${b.name || ''}/></div>`;
  if (b.type === 'video') return html`<div class="nb-w nb-media has"><video class="media-img" src=${src} controls></video></div>`;
  if (b.type === 'audio') return html`<div class="nb-w nb-media has"><audio class="media-audio" src=${src} controls></audio></div>`;
  return html`<div class="nb-w nb-media has"><a class="media-file" href=${src} target="_blank" rel="noreferrer"><${Icon} n=${ic} cls="i20"/><span>${b.name || b.src}</span></a></div>`;
}
function MediaPicker({ data }) {
  const b = S.blocks[data.id];
  const [tab, setTab] = useState('upload');
  const [link, setLink] = useState('');
  const fileRef = useRef(null); const linkRef = useRef(null);
  useLayoutEffect(() => { if (linkRef.current) linkRef.current.focus(); }, [tab]);
  if (!b) return null;
  const r = overlay.r;
  const left = Math.round(Math.max(8, Math.min(r.left + r.width / 2 - 270, innerWidth - 548)) * 10) / 10;
  const set = (src, name) => { b.src = src; if (name) b.name = name; overlay = null; touch(); commit(); };
  const tabs = [['upload', 'Upload'], ['link', 'Link']];
  const accept = { image: 'image/*', video: 'video/*', audio: 'audio/*' }[b.type] || '*/*';
  const onFile = (e) => { const file = e.currentTarget.files && e.currentTarget.files[0]; if (!file) return; overlay = null; refresh(); space.upload(file, pageOfBlock(b.id)).then((ref) => set(ref, file.name), () => showToast({ warn: true, text: 'That file could not be uploaded. Try again.' })); };
  const submit = () => { const v = link.trim(); if (v) set(v, v.split('/').pop()); };
  const noun = b.type === 'bookmark' ? 'link' : b.type;
  let body;
  if (tab === 'upload') body = html`<div class="mp-up"><div class="cp-up-btn" role="button" onClick=${() => fileRef.current && fileRef.current.click()}>Upload file</div><input ref=${fileRef} type="file" accept=${accept} hidden onChange=${onFile}/></div>`;
  else if (tab === 'link') body = html`<div class="cp-link"><div class="cp-row"><div class="cp-row-in"><div class="cp-input"><input ref=${linkRef} placeholder=${`Paste the ${noun} link…`} value=${link} onInput=${(e) => setLink(e.currentTarget.value)} onKeyDown=${(e) => { if (e.key === 'Enter') submit(); }}/></div></div></div><div class="cp-submit-row"><div class="cp-submit" role="button" onClick=${submit}>${b.type === 'bookmark' ? 'Create bookmark' : `Embed ${b.type}`}</div></div><div class="cp-note">${`Works with any ${noun} from the web.`}</div></div>`;
  else body = html`<div class="cp-link"><div class="cp-row"><div class="cp-row-in"><div class="cp-input"><input ref=${linkRef} placeholder=${tab === 'giphy' ? 'Search for GIFs…' : 'Search for an image…'}/></div></div></div></div>`;
  return html`<div class="menu media-picker" style=${`left:${left}px;top:${r.bottom}px`}><div class="ip-tabs"><div class="ip-tabl">${tabs.map(([k, label]) => html`<div class=${'ip-tab' + (tab === k ? ' on' : '')}><div class="ip-tab-btn" role="button" onClick=${() => setTab(k)}>${label}</div>${tab === k ? html`<div class="ip-uline"></div>` : ''}</div>`)}</div></div>${body}</div>`;
}
/* ------------------------------------------------------------------ settings window */
// The window keeps its measured frame (90vw by 100vh-100px, a 240px nav, an 800px column) and holds Nemesis's own settings.
const SET_NAV = () => [
  ['Account', [[space.me.name || 'Account', 'avatar', 'Account'], ['Preferences', 'sliders', 'Preferences']]],
  ['Workspace', [['General', 'gear', 'General'], ['People', 'people', 'People']]],
  ['Nemesis', [['Plans', 'arrowInCircleUpAnimated', 'Plans'], ['More settings', 'squareGrid2X2', 'More']]],
];
function SettingsModal({ data }) {
  const [pg, setPg] = useState(data.page || 'Preferences');
  const [q, setQ] = useState('');
  const [name, setName] = useState(space.me.name);
  const needle = q.trim().toLowerCase();
  const row = (title, desc, ctl) => html`<div class="set-row"><div class="set-row-txt"><div class="set-row-title">${title}</div>${desc ? html`<div class="set-row-desc">${desc}</div>` : ''}</div><div class="set-ctl">${ctl}</div></div>`;
  const pref = (() => { try { return localStorage.getItem('nemesis.web.theme') || 'system'; } catch (e) { return 'system'; } })();
  let body;
  if (pg === 'Account') {
    body = html`<div class="set-page"><div class="set-h1">Account</div>
      <div class="set-sec">${row('Preferred name', 'How your name shows on pages, comments and mentions.', html`<input class="set-input" value=${name} onInput=${(e) => setName(e.currentTarget.value)} onBlur=${() => space.saveName(name)} onKeyDown=${(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}/>`)}${row('Email', space.me.email, '')}</div>
      <div class="set-sec">${row('Log out', 'Signs you out of Nemesis on this device.', html`<div class="set-btn" role="button" onClick=${() => { closeOverlay(); space.host.signOut(); }}>Log out</div>`)}</div></div>`;
  } else if (pg === 'Preferences') {
    body = html`<div class="set-page"><div class="set-h1">Preferences</div>
      <div class="set-sec">${row('Appearance', 'How Nemesis looks on this device.', html`<select class="set-select" value=${pref} onChange=${(e) => { space.setTheme(e.currentTarget.value); refresh(); }}><option value="system">Use system setting</option><option value="light">Light</option><option value="dark">Dark</option></select>`)}${row('High contrast', 'Stronger text and borders.', html`<select class="set-select" value=${S.contrastPref || 'auto'} onChange=${(e) => { S.contrastPref = e.currentTarget.value; applyTheme(); commit(); }}><option value="auto">Automatic</option><option value="standard">Off</option><option value="high">On</option></select>`)}</div></div>`;
  } else if (pg === 'General') {
    body = html`<div class="set-page"><div class="set-h1">Workspace</div><div class="set-sec">${row('Name', 'Shown in the sidebar and on invitations.', html`<span class="set-row-title">${S.workspace}</span>`)}${row('Your role', '', html`<span class="set-row-title">${capWord(space.info.role || 'member')}</span>`)}</div></div>`;
  } else if (pg === 'People') {
    body = html`<div class="set-page"><div class="set-h1">People</div><div class="set-sec">${[...space.people.values()].map((p) => html`<div class="set-person"><img src=${space.avatar(p.id)} alt=""/><div><div class="set-person-name">${p.name}${p.id === space.me.id ? ' (You)' : ''}</div><div class="set-person-mail">${p.email || ''}</div></div><div class="set-person-role">${capWord(p.role || 'member')}</div></div>`)}<div class="set-note">${[...space.people.values()].some((p) => p.role === 'guest') ? 'Guests open only the pages shared with them.' : 'Share a page to work on it with someone. They join as a guest and see only what you share.'}</div></div></div>`;
  } else if (pg === 'Plans') {
    body = html`<div class="set-page"><div class="set-h1">Plans</div><div class="set-sec">${row('Your plan', 'What each plan includes, and how to change yours.', html`<div class="set-btn primary" role="button" onClick=${() => { closeOverlay(); space.openApp('/pricing'); }}>View plans</div>`)}</div></div>`;
  } else {
    body = html`<div class="set-page"><div class="set-h1">More settings</div><div class="set-sec">${row('Notifications, connected apps and study settings', 'These are in the rest of Nemesis for now.', html`<div class="set-btn" role="button" onClick=${() => { closeOverlay(); space.openApp('/settings'); }}>Open</div>`)}</div></div>`;
  }
  return html`<div class="set-card" role="dialog" aria-label="Settings">
    <div class="set-nav">
      <div class="set-search"><${Icon} n="magnifyingGlassSmall" cls="set-glass"/><input placeholder="Search settings" value=${q} onInput=${(e) => setQ(e.currentTarget.value)}/></div>
      <div class="set-nav-scroll">${SET_NAV().map(([group, items]) => { const shown = items.filter(([label]) => !needle || label.toLowerCase().includes(needle)); return shown.length ? html`<div class="set-group"><div class="set-ghead">${group}</div>${shown.map(([label, ic, key]) => html`<div class=${'set-item' + (pg === key ? ' on' : '') + (key === 'Plans' ? ' up' : '')} role="tab" aria-selected=${pg === key ? 'true' : 'false'} onClick=${() => setPg(key)}>${ic === 'avatar' ? html`<img class="set-av" src=${space.avatar()} alt=""/>` : html`<${Icon} n=${ic} cls="i20"/>`}<span>${label}</span></div>`)}</div>` : ''; })}</div>
    </div>
    <div class="set-main">${body}</div>
    <div class="set-close" role="button" aria-label="Close" onClick=${closeOverlay}><${Icon} n="xMarkFillSmall" cls="i22"/></div>
  </div>`;
}
/* ------------------------------------------------------------------ page comments */
// Measured on the live composer: 24px under the title, an 8px/12px padded row with a 24px avatar, a 14px editor and
// Attach, Mention and Send buttons (24px, 6px apart), a hairline underneath, then the page content 8px lower.
let commentOpen = null;
function openComment(page) {
  commentOpen = page.id; refresh();
  Promise.resolve().then(() => Promise.resolve()).then(() => { const el = document.querySelector('.pd-edit'); if (el) el.focus(); });
}
function PageDiscussion({ page }) {
  const [txt, setTxt] = useState('');
  const ref = useRef(null);
  const list = page.comments || [];
  const send = () => {
    const t = (ref.current ? ref.current.innerText : '').trim(); if (!t) return;
    page.comments = [...list, { id: uid(), author: space.me.name, authorId: space.me.id, text: t, time: NOW() }]; page.lastEdited = NOW();
    if (ref.current) ref.current.textContent = ''; setTxt(''); commit();
  };
  const onBlur = () => setTimeout(() => {
    const el = ref.current;
    if (commentOpen === page.id && !(el && el.textContent.trim()) && document.activeElement !== el) { commentOpen = null; refresh(); }
  }, 0);
  const avatar = html`<div class="pd-avatar"><img src=${space.avatar()} alt=""/></div>`;
  return html`<div class="pd-wrap">
    ${list.map((c) => html`<div class="pd-item"><div class="pd-avatar"><img src=${space.avatar(c.authorId)} alt=""/></div><div class="pd-body"><div class="pd-meta"><span class="pd-name">${c.author}</span><span class="pd-time">${relTime(c.time)}</span></div><div class="pd-text">${c.text}</div></div></div>`)}
    <div class="pd-row">${avatar}<div class="pd-box"><div class="pd-edit-wrap"><div class="pd-edit" ref=${ref} contenteditable="true" data-ph=${list.length ? 'Reply…' : 'Add a comment…'} onInput=${(e) => setTxt(e.currentTarget.textContent)} onKeyDown=${(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } else if (e.key === 'Escape') e.currentTarget.blur(); }} onBlur=${onBlur}></div></div>
      <div class="pd-btns"><div class="pd-btn" role="button" aria-label="Attach file"><${Icon} n="paperClip" cls="i20"/></div><div class="pd-btn" role="button" aria-label="Mention a person, page, or date"><${Icon} n="at" cls="i20"/></div><div class=${'pd-btn send' + (txt.trim() ? ' on' : '')} role="button" aria-label="Send comment" onMouseDown=${(e) => e.preventDefault()} onClick=${send}><${Icon} n="arrowInCircleUpFill" cls="i24"/></div></div></div></div>
  </div>`;
}
/* ------------------------------------------------------------------ page cover */
// Measured: the cover is 30vh across the whole frame, the page icon rides 42px up over its bottom edge, and hovering
// it shows a Change | Reposition | download group 12px in from its top right corner.
const coverUrl = (p) => p;
const coverPos = (s) => { const v = parseFloat(String(s || '').split(' ')[1]); return Number.isFinite(v) ? v : 50; };
function addRandomCover(page) {
  const all = COVER_GALLERY.flatMap((s) => s[1]);
  const x = all[Math.floor(Math.random() * all.length)];
  page.cover = { src: coverUrl(x[0]), pos: coverPos(x[2]) }; page.lastEdited = NOW(); commit();
}
let coverRepo = null; // { pageId, pos } while the cover is being dragged into place
function Cover({ page }) {
  const c = page.cover; const repo = coverRepo && coverRepo.pageId === page.id;
  const pos = repo ? coverRepo.pos : (c.pos ?? 50);
  const onDown = (e) => {
    if (!repo) return; e.preventDefault();
    const img = e.currentTarget; const box = img.getBoundingClientRect();
    const drawn = img.naturalWidth ? img.naturalHeight * Math.max(box.width / img.naturalWidth, box.height / img.naturalHeight) : box.height;
    const extra = Math.max(1, drawn - box.height); const y0 = e.clientY; const p0 = coverRepo.pos;
    const move = (ev) => { coverRepo.pos = Math.max(0, Math.min(100, p0 - ((ev.clientY - y0) / extra) * 100)); refresh(); };
    const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); };
    addEventListener('mousemove', move); addEventListener('mouseup', up);
  };
  return html`<div class=${'page-cover' + (repo ? ' repo' : '')}>
    ${String(c.src).startsWith('css:') ? html`<div class="page-cover-fill" style=${'background:' + c.src.slice(4)}></div>` : html`<img src=${space.fileUrl(c.src)} alt="" draggable="false" style=${`object-position:center ${pos}%`} onMouseDown=${onDown}/>`}
    ${repo ? html`<div class="cover-hint">Drag image to reposition</div>` : ''}
    <div class="cover-ctl">${repo
      ? html`<div class="cc-btn" role="button" onClick=${() => { c.pos = Math.round(coverRepo.pos * 10) / 10; coverRepo = null; page.lastEdited = NOW(); commit(); }}>Save position</div><div class="cc-btn" role="button" onClick=${() => { coverRepo = null; refresh(); }}>Cancel</div>`
      : html`<div class="cc-btn" role="button" aria-label="Update the page cover image" onClick=${(e) => openOverlay('coverPicker', e.currentTarget, { pageId: page.id })}>Change</div>${String(c.src).startsWith('css:') ? '' : html`<div class="cc-sep"></div><div class="cc-btn" role="button" aria-label="Reposition the cover image" onClick=${() => { coverRepo = { pageId: page.id, pos: c.pos ?? 50 }; refresh(); }}>Reposition</div>`}`}</div>
  </div>`;
}
// Measured: 540px card, 8px under the Change button, centred on it but kept 12.5px inside the window; Gallery and
// Unsplash are 485px tall, Upload 164.8px, Link 160.8px. Gallery tiles are 118.8x64 in fours, 70px a row.
function CoverPicker({ data }) {
  const page = S.pages[data.pageId];
  const [tab, setTab] = useState('gallery');
  const [link, setLink] = useState('');
  const [uq, setUq] = useState('');
  const fileRef = useRef(null); const linkRef = useRef(null);
  useLayoutEffect(() => { if (linkRef.current) linkRef.current.focus(); }, [tab]);
  if (!page) return null;
  const r = overlay.r; const W = 540;
  const left = Math.round(Math.max(12.5, Math.min(r.left + r.width / 2 - W / 2, innerWidth - 12.5 - W)) * 10) / 10;
  const top = r.bottom + 8;
  const setCover = (src, pos) => { page.cover = { src, pos: pos ?? 50 }; page.lastEdited = NOW(); commit(); };
  const tabs = html`<div class="ip-tabs"><div class="ip-tabl">${[['gallery', 'Gallery'], ['upload', 'Upload'], ['link', 'Link']].map(([k, label]) => html`<div class=${'ip-tab' + (tab === k ? ' on' : '')}><div class="ip-tab-btn" role="button" onClick=${() => setTab(k)}>${label}</div>${tab === k ? html`<div class="ip-uline"></div>` : ''}</div>`)}</div><div class="ip-tab"><div class="ip-tab-btn" role="button" onClick=${() => { delete page.cover; page.lastEdited = NOW(); overlay = null; commit(); }}>Remove</div></div></div>`;
  const onFile = (e) => { const file = e.currentTarget.files && e.currentTarget.files[0]; if (!file) return; overlay = null; refresh(); space.upload(file, page.id).then((ref) => setCover(ref, 50), () => showToast({ warn: true, text: 'That image could not be uploaded. Try again.' })); };
  let body;
  if (tab === 'gallery') {
    body = html`<div class="cp-scroll">${COVER_GALLERY.filter((s) => s[1].length).map(([name, items]) => html`<div class="cp-sec"><div class="cp-head"><span>${name}</span></div><div class="cp-grid">${items.map(([p, label, pos]) => html`<div class="cp-tile" role="button" aria-label=${label} onClick=${() => setCover(coverUrl(p), coverPos(pos))}>${p.startsWith('css:') ? html`<div class="cp-fill" style=${'background:' + p.slice(4)}></div>` : html`<img src=${coverUrl(p)} alt=${label} loading="lazy" style=${`object-position:${pos}`}/>`}</div>`)}</div></div>`)}</div>`;
  } else if (tab === 'upload') {
    body = html`<div class="cp-up"><div class="cp-up-box"><div class="cp-up-btn" role="button" onClick=${() => fileRef.current && fileRef.current.click()}>Upload file</div></div><input ref=${fileRef} type="file" accept="image/*" hidden onChange=${onFile}/><div class="cp-hint">or ⌘+V to paste an image</div><div class="cp-note">Images wider than 1500 pixels work best.</div></div>`;
  } else if (tab === 'link') {
    const submit = () => { const v = link.trim(); if (!v) return; setCover(v, 50); overlay = null; refresh(); };
    body = html`<div class="cp-link"><div class="cp-row"><div class="cp-row-in"><div class="cp-input"><input ref=${linkRef} placeholder="Paste an image link…" value=${link} onInput=${(e) => setLink(e.currentTarget.value)} onKeyDown=${(e) => { if (e.key === 'Enter') submit(); }}/></div></div></div><div class="cp-submit-row"><div class="cp-submit" role="button" onClick=${submit}>Submit</div></div><div class="cp-note">Works with any image from the web.</div></div>`;
  } else {
    body = html`<div class="cp-scroll"><div class="cp-row"><div class="cp-row-in"><div class="cp-input"><input ref=${linkRef} placeholder="Search for an image…" value=${uq} onInput=${(e) => setUq(e.currentTarget.value)}/></div></div></div></div>`;
  }
  return html`<div class=${'menu cover-picker ' + tab} style=${`left:${left}px;top:${top}px`}>${tabs}${body}</div>`;
}
/* ------------------------------------------------------------------ page icon picker */
// Measured on the live picker: a 408x390 card centred under the icon 4px below it, a 40px tab strip, a 36px
// filter row, 32px cells (24px emoji glyphs, 24px icon art) and a 51px category footer on the Emoji tab.
const EMOJI_FOOT = [['Recent', 'clock', 'recent'], ['People', 'emojiFace', 'People & Body'], ['Animals and nature', 'leaf', 'Animals & Nature'], ['Food and drink', 'carrot', 'Food & Drink'], ['Activities', 'soccerBall', 'Activities'], ['Travel and places', 'airplane', 'Travel & Places'], ['Objects', 'lightBulbBright', 'Objects'], ['Symbols', 'checkmarkCircle', 'Symbols'], ['Flags', 'flag', 'Flags'], ['Custom', 'squareGrid2X2', 'custom'], ['add', 'plusCircleFill', 'add']];
const ICON_COLOR_NAMES = [['gray', 'Default'], ['lightgray', 'Light Gray'], ['brown', 'Brown'], ['yellow', 'Yellow'], ['orange', 'Orange'], ['green', 'Green'], ['blue', 'Blue'], ['purple', 'Purple'], ['pink', 'Pink'], ['red', 'Red']];
const SKIN_TONES = ['', '\u{1F3FB}', '\u{1F3FC}', '\u{1F3FD}', '\u{1F3FE}', '\u{1F3FF}'];
const withSkin = (e, tone) => { if (!tone) return e; const cps = [...e]; if (!/\p{Emoji_Modifier_Base}/u.test(cps[0])) return e; let rest = cps.slice(1); if (rest[0] === '️') rest = rest.slice(1); return cps[0] + tone + rest.join(''); };
let EMOJI_ALL = null;
const allEmoji = () => EMOJI_ALL || (EMOJI_ALL = EMOJI_SECTIONS.flatMap((s) => s[1]));
// Measured against the live picker: a query matches an emoji's name or any of its search words anywhere in the word
// ("car" finds "scared"); name matches rank ahead of keyword matches, then exact, prefix, word start, inside a word.
// Ranking: inside each category an emoji scores by the first rule it meets
// (the filter holds the glyph, a :shortcode, an exact keyword, a keyword prefix, every word prefixes a keyword, a keyword
// contains the filter) plus 100 x its pick frecency. 72 hits or fewer flatten into one list by score; more keep titles.
let EMOJI_KWN = null; const EMOJI_UNIQ = {};
const emojiKw = (a) => { if (!EMOJI_KWN) { EMOJI_KWN = {}; for (const k in EMOJI_KW) EMOJI_KWN[k.replace(/️/g, '')] = EMOJI_KW[k] ? EMOJI_KW[k].split('|') : []; } return EMOJI_KWN[a.replace(/️/g, '')] || []; };
const emojiUniqKw = (a) => EMOJI_UNIQ[a] || (EMOJI_UNIQ[a] = [...new Set(emojiKw(a).flatMap((e) => e.split(' ')))]);
const emojiFilterNorm = (e) => e.toLowerCase().replace(/_/g, ' ').replace(/([a-z0-9])-$/g, '$1').replace(/-([a-z])/g, ' $1').replace(/\s+/g, ' ').trim();
function searchEmoji(raw) {
  const o = emojiFilterNorm(raw); const words = raw.split(' ').filter(Boolean); const fre = S.emojiFrecency || {};
  const cats = EMOJI_SECTIONS.filter((sec) => sec[1].length).map(([name, items]) => {
    const hits = [];
    items.forEach((x) => {
      const a = x[0]; const d = emojiKw(a); const u = o.length < 3 || o.includes(' ') ? d : d.map((e) => e.replaceAll(' ', ''));
      let rank; const p = o.indexOf(a);
      if (p !== -1) rank = 100 - p;
      else {
        const m = u.findIndex((e) => e === ':' + o); const g = m === -1 ? u.findIndex((e) => e === o) : -1; const h = m === -1 && g === -1 ? u.findIndex((e) => e.startsWith(o)) : -1;
        if (m !== -1) rank = 100 - m; else if (g !== -1) rank = (10 - g) * 10; else if (h !== -1) rank = 10 - h;
        else if (words.length > 1 && words.every((t) => emojiUniqKw(a).find((e) => e.startsWith(t)))) rank = words.length;
        else if (u.some((e) => e.includes(o))) rank = 1;
      }
      if (rank !== undefined) hits.push([rank + (fre[a] ? 100 * fre[a].f : 0), x]);
    });
    return [name, hits.sort((A, B) => B[0] - A[0])];
  });
  const total = cats.reduce((n, c) => n + c[1].length, 0);
  if (total > 72) return { grouped: cats.filter((c) => c[1].length).map(([name, h]) => [name, h.map((y) => y[1])]) };
  return { flat: cats.flatMap((c) => c[1]).map((y, i) => [y, i]).sort((A, B) => B[0][0] - A[0][0] || A[1] - B[1]).map((z) => z[0][1]) };
}
// Frecency: every stored count halves for each week since its last pick, and the emoji just picked gains one (top 100 kept).
function bumpEmojiFrecency(e) {
  const now = Date.now(); const map = {};
  for (const [k, v] of Object.entries(S.emojiFrecency || {})) map[k] = { f: Math.round(v.f * Math.pow(0.5, (now - v.u) / 6048e5)), u: v.u };
  if (map[e]) { map[e].f += 1; map[e].u = now; } else map[e] = { f: 1, u: now };
  const ent = Object.entries(map);
  if (ent.length > 100) ent.sort((x, y) => (x[1].f !== y[1].f ? y[1].f - x[1].f : y[1].u - x[1].u));
  S.emojiFrecency = Object.fromEntries(ent.slice(0, 100));
}
const randomEmoji = () => { const a = allEmoji(); return a[Math.floor(Math.random() * a.length)][0]; };
function pushRecent(key, v) { if (key === 'recentEmoji' && typeof v === 'string') bumpEmojiFrecency(v); const k = JSON.stringify(v); S[key] = [v, ...(S[key] || []).filter((x) => JSON.stringify(x) !== k)].slice(0, 24); }
function setPageIcon(page, ic, keepOpen) {
  page.icon = ic; page.lastEdited = NOW();
  if (ic.emoji) pushRecent('recentEmoji', ic.emoji);
  if (ic.name) pushRecent('recentIcons', [ic.name, ic.color]);
  if (!keepOpen) overlay = null;
  commit();
}
// "Add icon" drops a random emoji in and opens the picker on it straight away.
function addRandomIcon(page, header) {
  page.icon = { emoji: randomEmoji() }; page.lastEdited = NOW(); commit();
  // Preact renders on a microtask, so look for the new icon once that render has run.
  Promise.resolve().then(() => Promise.resolve()).then(() => {
    const el = header && header.querySelector('.nsp-record-icon');
    if (el) openOverlay('iconPicker', el, { pageId: page.id });
  });
}
// A heading sits 34.5px above its first row on the Emoji tab (33.9px on Icons). On the Emoji tab the list only
// advances 1px less for it, so each section's second row tucks 1px under the first (all nine sections); Icons rows do not.
function pickerLayout(sections, headH, top, tuck) {
  const rows = []; let y = top; let start = 0;
  for (const [name, items] of sections) {
    let lift = 0;
    if (name) { rows.push({ h: true, y, name }); y += headH - (tuck ? 1 : 0); lift = tuck ? 1 : 0; }
    for (let i = 0; i < items.length; i += 12) { rows.push({ y: y + lift, start, items: items.slice(i, i + 12) }); lift = 0; start += Math.min(12, items.length - i); y += 32; }
  }
  return { rows, height: y };
}
function IconPicker({ data }) {
  const page = S.pages[data.pageId];
  const [tab, setTab] = useState('emoji');
  const [q, setQ] = useState('');
  const [st, setSt] = useState(0);
  const [cur, setCur] = useState(0);
  const [pop, setPop] = useState(null);
  const [pending, setPending] = useState(null);
  const scRef = useRef(null); const inRef = useRef(null); const fileRef = useRef(null);
  useLayoutEffect(() => { if (inRef.current) inRef.current.focus(); }, [tab]);
  useEffect(() => {
    if (tab !== 'upload') return undefined;
    const onPaste = (e) => {
      const file = [...(e.clipboardData.files || [])].find((x) => x.type.startsWith('image/'));
      if (file) { space.upload(file, page.id).then((ref) => setPending(ref), () => {}); return; }
      const t = (e.clipboardData.getData('text') || '').trim(); if (/^https?:\/\//.test(t)) setPending(t);
    };
    addEventListener('paste', onPaste); return () => removeEventListener('paste', onPaste);
  }, [tab]);
  if (!page) return null;
  const r = overlay.r; const H = tab === 'upload' ? 192 : 390;
  const left = Math.round(Math.max(8, Math.min(r.left + r.width / 2 - 204, innerWidth - 416)) * 10) / 10;
  let top = r.bottom + 4; if (top + H > innerHeight - 8) top = Math.max(8, r.top - 4 - H);
  const tone = S.skinTone || ''; const ask = S.iconAsk !== false; const color = S.iconColor || 'gray';
  const needle = q.trim().toLowerCase();
  const scrollTo = (y) => { if (scRef.current) scRef.current.scrollTop = y; setSt(y); };
  const switchTab = (k) => { setTab(k); setQ(''); setCur(0); setPop(null); setPending(null); scrollTo(0); };
  let lay = { rows: [], height: 0 };
  if (tab === 'emoji') {
    const res = needle ? searchEmoji(q) : null;
    const secs = res ? (res.grouped ? [...res.grouped, ['Custom', [['+', 'add']]]] : [['', res.flat.concat([['+', 'add']])]])
      : [...((S.recentEmoji || []).length ? [['Recent', S.recentEmoji.map((e) => [e, ''])]] : []), ...EMOJI_SECTIONS.filter((s) => s[1].length), ['Custom', [['+', 'add']]]];
    lay = pickerLayout(secs, 34.5, res && !res.grouped ? 4 : 0, true);
  } else if (tab === 'icons') {
    const recent = S.recentIcons || [];
    loadPageIcons();
    const secs = needle ? [['', PAGE_ICONS.filter((x) => x[0].includes(needle))]] : [...(recent.length ? [['Recent', recent.map(([n, c]) => [n, null, c])]] : []), ['Icons', PAGE_ICONS]];
    lay = pickerLayout(secs, 33.9, needle ? 4 : 0, false);
  }
  const flat = lay.rows.filter((x) => !x.h).flatMap((x) => x.items);
  const pickIcon = (x, el) => {
    if (x[2] || !ask) { setPageIcon(page, { name: x[0], color: x[2] || color }); return; }
    if (!el) { setPageIcon(page, { name: x[0], color: 'gray' }); return; }
    const cr = el.getBoundingClientRect(); setPop({ name: x[0], x: cr.left - left, y: cr.bottom - top });
  };
  const pick = (x, el) => {
    if (!x) return;
    if (tab === 'icons') { pickIcon(x, el); return; }
    if (x[0] === '+') switchTab('upload'); else setPageIcon(page, { emoji: withSkin(x[0], tone) });
  };
  const onKey = (e) => {
    const moves = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 12, ArrowUp: -12 };
    if (moves[e.key]) {
      e.preventDefault(); const n = Math.max(0, Math.min(flat.length - 1, cur + moves[e.key])); setCur(n);
      const row = lay.rows.find((x) => !x.h && n >= x.start && n < x.start + x.items.length); const sc = scRef.current;
      if (row && sc) { if (row.y < sc.scrollTop) scrollTo(row.y); else if (row.y + 32 > sc.scrollTop + sc.clientHeight) scrollTo(row.y + 32 - sc.clientHeight); }
    } else if (e.key === 'Enter') { e.preventDefault(); pick(flat[cur]); }
  };
  const random = () => {
    if (tab === 'emoji') setPageIcon(page, { emoji: withSkin(randomEmoji(), tone) }, true);
    else if (PAGE_ICONS.length) { const x = PAGE_ICONS[Math.floor(Math.random() * PAGE_ICONS.length)]; setPageIcon(page, { name: x[0], color: ask ? 'gray' : color }, true); }
  };
  const cell = (x, i) => {
    if (tab === 'icons') { const c = x[2] || (ask ? 'gray' : color); return html`<div class=${'ip-cell ico' + (i === cur ? ' cur' : '')} role="button" aria-label=${x[0] + ' ' + c} onClick=${(e) => pick(x, e.currentTarget)}><div class="ip-art" dangerouslySetInnerHTML=${{ __html: niSvg(x[0], c) }}></div></div>`; }
    if (x[0] === '+') return html`<div class=${'ip-cell' + (i === cur ? ' cur' : '')} role="button" aria-label="Add emoji" onClick=${() => switchTab('upload')}><div class="ip-add"><${Icon} n="plusSmall" cls="i16"/></div></div>`;
    const g = withSkin(x[0], tone);
    return html`<div class=${'ip-cell' + (i === cur ? ' cur' : '')} role="button" aria-label=${x[1]} onClick=${() => pick(x)}><span class="ip-glyph">${g}</span></div>`;
  };
  const heads = lay.rows.filter((x) => x.h);
  let active = heads.length ? heads[0].name : ''; for (const h of heads) if (h.y <= st + 1) active = h.name;
  const vis = lay.rows.filter((x) => x.y + 40 >= st - 160 && x.y <= st + 460);
  const tabs = html`<div class="ip-tabs"><div class="ip-tabl">${[['emoji', 'Emoji'], ['icons', 'Icons'], ['upload', 'Upload']].map(([k, label]) => html`<div class=${'ip-tab' + (tab === k ? ' on' : '')}><div class="ip-tab-btn" role="button" onClick=${() => switchTab(k)}>${label}</div>${tab === k ? html`<div class="ip-uline"></div>` : ''}</div>`)}</div>${hasIcon(page) ? html`<div class="ip-tab"><div class="ip-tab-btn" role="button" onClick=${() => { delete page.icon; page.lastEdited = NOW(); overlay = null; commit(); }}>Remove</div></div>` : ''}</div>`;
  const search = tab === 'upload' ? '' : html`<div class="ip-search">
    <div class="ip-input"><${Icon} n="magnifyingGlassSmall" cls="i16"/><input ref=${inRef} placeholder="Filter…" value=${q} onInput=${(e) => { setQ(e.currentTarget.value); setCur(0); scrollTo(0); }} onKeyDown=${onKey}/>${q ? html`<div class="ip-clear" role="button" aria-label="Clear" onClick=${() => { setQ(''); setCur(0); if (inRef.current) inRef.current.focus(); }}><${Icon} n="xMarkSmall" cls="i12"/></div>` : ''}</div>
    <div class="ip-sqs"><div class="ip-sq bordered" role="button" aria-label="Random" onClick=${random}><${Icon} n="arrowIntersectRightSmall" cls="i14"/></div>${tab === 'emoji'
      ? html`<div class=${'ip-sq' + (pop === 'skin' ? ' on' : '')} role="button" aria-label="Select skin tone" onClick=${() => setPop(pop === 'skin' ? null : 'skin')}><span class="ip-skin-g">${withSkin('✋', tone)}</span></div>`
      : html`<div class="ip-sq bordered" role="button" aria-label=${'Select icon color, ' + (ask ? 'no color selected' : color + ' selected')} onClick=${() => setPop(pop === 'color' ? null : 'color')}><svg class="ip-dot" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.625" fill=${ask ? '#ADA9A3' : ICON_COLORS[color]}></path></svg></div>`}</div>
  </div>`;
  const foot = tab === 'emoji' && !needle ? html`<div class="ip-foot">${EMOJI_FOOT.map(([sec, ic, label]) => { const h = heads.find((x) => x.name === sec); return html`<div class=${'ip-fbtn' + (h && active === sec ? ' on' : '') + (sec === 'Recent' && !h ? ' off' : '')} role="button" aria-label=${'Jump to category: ' + label} onClick=${() => { if (sec === 'add') switchTab('upload'); else if (h) scrollTo(h.y); }}><${Icon} n=${ic} cls="i22"/></div>`; })}</div>` : '';
  const popEl = pop === 'skin' ? html`<div class="ip-pop ip-skinpop" style="left:372px;top:76px">${SKIN_TONES.map((t) => html`<div class=${'ip-skin-opt' + (t === tone ? ' on' : '')} role="button" aria-label="raised hand" onClick=${() => { S.skinTone = t; setPop(null); commit(); }}><span class="ip-skin-g">${withSkin('✋', t)}</span></div>`)}</div>`
    : pop === 'color' ? html`<div class="ip-pop ip-colorpop" style="left:372px;top:76px">${[0, 5].map((s) => html`<div class="ip-sw-row">${ICON_COLOR_NAMES.slice(s, s + 5).map(([k, label]) => html`<div class=${'ip-sw' + (ask ? ' dim' : '') + (!ask && color === k ? ' on' : '')} role="button" aria-label=${'Set color as ' + label} onClick=${() => { S.iconColor = k; S.iconAsk = false; commit(); }}><svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.625" fill=${ICON_COLORS[k]}></path></svg></div>`)}</div>`)}<div class="ip-ask-wrap"><div class="ip-ask" role="button" onClick=${() => { S.iconAsk = !ask; commit(); }}><span>Ask every time</span><span class=${'toggle' + (ask ? ' on' : '')}></span></div></div></div>`
    : pop && pop.name ? html`<div class="ip-pop ip-varpop" style=${`left:${pop.x}px;top:${pop.y}px`}>${[0, 5].map((s) => html`<div class="ip-var-row">${ICON_COLOR_NAMES.slice(s, s + 5).map(([k]) => html`<div class=${'ip-var' + (k === 'gray' ? ' cur' : '')} role="button" aria-label=${pop.name + ' ' + k} onClick=${() => setPageIcon(page, { name: pop.name, color: k })}><div class="ip-art" dangerouslySetInnerHTML=${{ __html: niSvg(pop.name, k) }}></div></div>`)}</div>`)}</div>` : '';
  const onFile = (e) => { const file = e.currentTarget.files && e.currentTarget.files[0]; if (!file) return; overlay = null; refresh(); space.upload(file, page.id).then((ref) => setPageIcon(page, { img: ref }), () => showToast({ warn: true, text: 'That image could not be uploaded. Try again.' })); };
  const upload = html`<div class="ip-up">
    <div class="ip-up-box"><div class="ip-up-btn" role="button" onClick=${() => fileRef.current && fileRef.current.click()}><${Icon} n="photo" cls="i20"/><span>Upload an image</span></div></div>
    <input ref=${fileRef} type="file" accept="image/*" hidden onChange=${onFile}/>
    <div class="ip-up-hint">or ⌘+V to paste an image or link</div>
    <div class="ip-up-foot"><div class="ip-up-cancel" role="button" onClick=${closeOverlay}>Cancel</div><div class=${'ip-up-save' + (pending ? '' : ' off')} role="button" onClick=${() => { if (pending) setPageIcon(page, { img: pending }); }}>Save</div></div>
  </div>`;
  return html`<div class=${'menu icon-picker' + (tab === 'upload' ? ' up' : '')} style=${`left:${left}px;top:${top}px`}>
    <div class="ip-head">${tabs}${search}</div>
    ${tab === 'upload' ? upload : html`<div class="ip-scroll" ref=${scRef} onScroll=${(e) => setSt(e.currentTarget.scrollTop)}><div class="ip-vlist" style=${`height:${lay.height + (tab === 'icons' ? 4 : 6)}px`}>${vis.map((x) => x.h
      ? html`<div class=${'ip-h' + (tab === 'icons' ? ' ico' : '')} style=${`top:${x.y + (tab === 'icons' ? 10 : 6)}px`}>${x.name}</div>`
      : html`<div class=${'ip-row' + (tab === 'icons' || needle ? ' in16' : '')} style=${`top:${x.y}px`}>${x.items.map((it, j) => cell(it, x.start + j))}</div>`)}</div></div>${foot}`}
    ${pop ? html`<div class="ip-pop-catch" onMouseDown=${() => setPop(null)}></div>` : ''}${popEl}
  </div>`;
}
function TrashPopover() {
  const [q, setQ] = useState('');
  useEffect(() => { space.loadTrash(); }, []);
  const items = (S.trash || []).map((id) => S.pages[id]).filter((p) => p && p.trashed && (!q || (p.title || 'New page').toLowerCase().includes(q.toLowerCase())));
  const chip = (ic, label, on) => html`<div class=${'tp-chip' + (on ? ' on' : '')} role="button"><${Icon} n=${ic} cls="i16"/><span>${label}</span><${Icon} n="arrowChevronSingleDownSmall" cls="i12"/></div>`;
  return html`<div class="menu trash-pop" style=${`left:247px;top:${Math.max(8, innerHeight - 12 - 390)}px`}>
    <div class="tp-search"><div class="bm-search-box"><input placeholder="Search pages in Trash" value=${q} onInput=${(e) => setQ(e.currentTarget.value)}/></div></div>
    <div class="tp-chips">${chip('person', 'Last edited by', true)}${chip('pageEmpty', 'In')}${chip('teamspace', 'Teamspaces')}</div>
    <div class="tp-list">${items.length ? items.map((p) => html`<div class="mi" role="menuitem" onClick=${() => { closeOverlay(); go(p.id); }}><div class="mi-in"><div class="mi-ic"><${RowIcon} page=${p}/></div><div class="mi-label">${p.title || 'New page'}</div><div class="tp-act" role="button" title="Restore" onClick=${(e) => { e.stopPropagation(); restorePage(p.id); }}><${Icon} n="arrowUTurnUpLeft" cls="i16"/></div><div class="tp-act" role="button" title="Delete from Trash" onClick=${(e) => { e.stopPropagation(); destroyPage(p.id); }}><${Icon} n="trash" cls="i16"/></div></div></div>`) : html`<div class="tp-empty"><${Icon} n="trash" cls="i22"/><div>No results</div></div>`}</div>
    <footer class="tp-foot"><span>Once a page has been in Trash for 30 days, it will be automatically deleted</span><span class="tp-help" role="button"><${Icon} n="questionMarkCircleSmall" cls="i16"/></span></footer>
  </div>`;
}
function HelpMenu() {
  return html`<div class="menu help-menu" style=${`left:247px;top:${Math.max(8, innerHeight - 12 - 110)}px`}>
    <div class="menu-group"><${MenuItem} ic="bubbleRight" label="Get support" onClick=${() => { closeOverlay(); space.openApp('/support'); }}/><${MenuItem} ic="book" label="Keyboard shortcuts" onClick=${closeOverlay}/></div>
  </div>`;
}
const LIB_TABS = [['recents', 'clock', 'Recents'], ['favorites', 'star', 'Favorites'], ['shared', 'people', 'Shared'], ['private', 'lock', 'Private'], ...(READY.meetings ? [['meetings', 'paperMicrophone', 'AI Meeting Notes']] : [])];
const LIB_COLS = [['Page name', 420, 'font'], ['Created by', 200, 'list'], ['Source', 200, 'list'], ['Last edited time', 200, 'calendar'], ['Last visited time', 200, 'calendar']];
function libRows(tab) {
  const ok = (p) => p && !p.trashed;
  if (tab === 'recents') return S.recents.map((id) => S.pages[id]).filter(ok);
  if (tab === 'favorites') return Object.values(S.pages).filter((p) => ok(p) && p.favorite);
  if (tab === 'private') return S.sidebar.private.map((id) => S.pages[id]).filter(ok);
  if (tab === 'shared') return S.sidebar.shared.map((id) => S.pages[id]).filter(ok);
  if (tab === 'meetings') return Object.values(S.pages).filter((p) => ok(p) && (p.content || []).some((b) => S.blocks[b] && S.blocks[b].type === 'transcription'));
  return [];
}
const relTime = (ms) => { if (!ms) return ''; const m = Math.floor((NOW() - ms) / 60000); if (m < 1) return 'Just now'; if (m < 60) return `${m}m ago`; const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`; return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TZ }); };
// A task (a row someone put this person in) opens its database with the row in the side peek once the rows are here.
let peekAfterLoad = null;
function openTask(t) { peekAfterLoad = t.id; go(t.page_id); }
// My Tasks: every row this person is assigned to, in databases they can open, that is not done yet (ws_my_tasks).
function TasksPage() {
  useEffect(() => { void space.loadTasks(); }, []);
  const { items, loaded } = space.tasks;
  const pill = (t) => { if (!t.status) return ''; const [bg, fg, dot] = OPT[t.status_color] || OPT.default; return html`<div class="pills"><div class="pill status" style=${`background:${bg};color:${fg}`}><div class="dot" style=${`background:${dot}`}></div><span>${t.status}</span></div></div>`; };
  const cols = [['Name', 320], ['Status', 170], ['Due', 170], ['Database', 240]];
  return html`<div class="nsp-topbar"><div class="tb-right"></div></div>
  <div class="nsp-scroller vertical"><div class="db-page tasks-page">
    <div class="db-head"><div class="db-head-inner"><h1 class="db-title">My Tasks</h1></div></div>
    <div class="db-bar"><div class="db-tab tasks-tab"><${Icon} n="checkStack" cls="i16"/><span class="lbl">My Tasks</span></div></div>
    ${items.length ? html`<div class="nsp-table-view tasks-table">
      <div class="nsp-table-view-header-row">${cols.map(([n, w]) => html`<div class="nsp-table-view-header-cell" style=${`width:${w}px`}><div class="th"><div class="th-inner"><div class="th-text">${n}</div></div></div></div>`)}</div>
      ${items.map((t) => html`<div class="nsp-table-view-row tasks-row" key=${t.id} role="button" onClick=${() => openTask(t)}>
        <div class="nsp-table-view-cell" style="width:320px"><div class="td p75">${t.title || 'Untitled'}</div></div>
        <div class="nsp-table-view-cell" style="width:170px"><div class="td p8">${pill(t)}</div></div>
        <div class="nsp-table-view-cell" style="width:170px"><div class="td p75">${t.due ? fmtDate(String(t.due).slice(0, 10)) : ''}</div></div>
        <div class="nsp-table-view-cell" style="width:240px"><div class="td p75">${t.database || 'Untitled'}</div></div>
      </div>`)}
    </div>` : html`<div class="tasks-empty"><${Icon} n="checkStack" cls="i36"/><div class="tasks-empty-t">${loaded ? 'Nothing is assigned to you. When someone puts you in a Person column, the row shows up here.' : 'Loading your tasks…'}</div></div>`}
  </div></div>`;
}
function LibraryPage({ tab }) {
  const t = tab || 'recents'; const rows = libRows(t);
  return html`<div class="lib-page">
    <div class="lib-head"><h1 class="lib-title">Library</h1><div class="lib-new" role="button" onClick=${() => createPage(null)}>New page</div></div>
    <div class="lib-bar"><div class="lib-tabs">${LIB_TABS.map(([k, ic, label]) => html`<div class=${'lib-tab' + (t === k ? ' on' : '')} role="button" onClick=${() => { go('library/' + k); }}><${Icon} n=${ic} cls="i20"/><span>${label}</span></div>`)}</div><div class="lib-tools">${['filterSmall', 'magnifyingGlassSmall', 'slidersSmall'].map((ic) => html`<div class="db-tool" role="button"><${Icon} n=${ic} cls="i16"/></div>`)}</div></div>
    <div class="nsp-table-view lib-table">
      <div class="nsp-table-view-header-row">${LIB_COLS.map(([n, w, mask]) => html`<div class="nsp-table-view-header-cell" style=${`width:${w}px`}><div class="th"><div class="th-inner"><div class="th-icon"><div class="th-icon-box"><div class="th-mask" style=${`-webkit-mask-image:url("${MASKS[mask] || MASKS.list}");mask-image:url("${MASKS[mask] || MASKS.list}")`}></div></div></div><div class="th-text">${n}</div></div></div></div>`)}</div>
      ${rows.length ? rows.map((p) => html`<div class="nsp-table-view-row lib-row" key=${p.id} onClick=${() => { if (p.kind !== 'stub') go(p.id); }}>
        <div class="nsp-table-view-cell" style="width:420px"><div class="td p75"><div class="tt"><div class="lib-tog"></div><div class="tt-ic"><div class="tt-ic-box"><${RowIcon} page=${p}/></div></div><div class="tt-text"><span>${(p.titleParts || [p.title || 'New page']).join('')}</span></div></div></div></div>
        <div class="nsp-table-view-cell" style="width:200px"><div class="td p75 lib-person"><img src=${space.avatar((space.sync.metaOf(p.id) || {}).created_by)} alt=""/><span>${space.personName((space.sync.metaOf(p.id) || {}).created_by || space.me.id)}</span></div></div>
        <div class="nsp-table-view-cell" style="width:200px"><div class="td p75 lib-source"><${Icon} n="lock" as="lock" cls="i20"/><span>${space.sectionLabel(p)}</span></div></div>
        <div class="nsp-table-view-cell" style="width:200px"><div class="td p75">${relTime(p.lastEdited)}</div></div>
        <div class="nsp-table-view-cell" style="width:200px"><div class="td p75">${relTime(p.visited || p.lastEdited)}</div></div>
      </div>`) : html`<div class="lib-empty">No pages here yet</div>`}
    </div>
  </div>`;
}


/* ------------------------------------------------------------------ database: column menu, sort/filter pickers, New menu (measured) */
function sortRows(rows, coll, view) {
  return sortRowsBy(rows, sortsOf(view), coll.schema, { nameOf: (id) => space.personName(id) });
}
// Filters live on the view and sync with it (lib/space/db-filter.ts); the search box is this browser's own, per view.
const dbSearch = new Map();
const dbSearchOpen = new Set();
// A row made in this browser stays in view until the page reloads, even where a filter would hide it: it starts empty.
const madeHere = new Set();
const filterCtx = { dayOf: (ms) => isoDate(new Date(ms)) };
function viewRows(rows, coll, view) {
  const kept = new Set(searchRows(filterRows(rows, view.filters, coll.schema, filterCtx), dbSearch.get(view.id) || '', coll.schema).map((r) => r.id));
  return sortRows(rows.filter((r) => kept.has(r.id) || madeHere.has(r.id)), coll, view);
}
const newRow = (view, coll) => { const id = uid(); madeHere.add(id); return { ...seedFromFilters(view.filters, coll.schema), id, title: '', created: NOW() }; };
const liveSorts = (view, coll) => sortsOf(view).filter((s) => coll.schema[s.pid]);
// A row opens the way its view says (view settings, Open pages in): in the side peek, or as its own page.
function openRow(r) {
  const ctx = dbCtx();
  if (ctx && ctx.view && ctx.view.openIn === 'page') { openRowPage(r); return; }
  peekRow = peekRow === r.id ? null : r.id; refresh();
}
function addSort(view, pid) {
  view.sorts = [...sortsOf(view).filter((x) => x.pid !== pid), { id: uid(), pid, dir: 'asc' }]; delete view.sort;
  closeOverlay(); commit();
  setTimeout(() => { const el = document.querySelector('[data-sorts]'); if (el) openOverlay('sortEditor', el, {}); }, 0);
}
function addFilter(view, pid, prop) {
  const f = { id: uid(), pid, op: defaultOp(prop.type), ...(prop.type === 'checkbox' ? { value: true } : {}) };
  view.filters = [...(view.filters || []), f];
  closeOverlay(); commit();
  // The chip is drawn by the render this commit started: open its editor under it.
  setTimeout(() => { const el = document.querySelector(`[data-filter="${f.id}"]`); if (el) openOverlay('filterEditor', el, { fid: f.id }); }, 0);
}
const dbCtx = () => { const page = S.pages[route()]; if (!page || !page.collection) return null; return { page, coll: S.collections[page.collection], view: S.views[page.activeView && page.views.includes(page.activeView) ? page.activeView : page.views[0]] }; };
const PROP_TYPES = [['text', 'Text'], ['number', 'Number'], ['select', 'Select'], ['multi_select', 'Multi-select'], ['status', 'Status'], ['date', 'Date'], ['person', 'Person'], ['checkbox', 'Checkbox'], ['url', 'URL'], ['email', 'Email'], ['phone_number', 'Phone'], ['files', 'Files & media']];
function PropMenu({ data }) {
  const ctx = dbCtx(); const ref = useRef(null); const [sub, setSub] = useState(null);
  if (!ctx) return null;
  const { coll, view } = ctx; const p = coll.schema[data.pid]; if (!p) return null;
  const cols = view.format.table_properties; const idx = cols.findIndex((c) => c.property === data.pid); const col = cols[idx];
  const isTitle = p.type === 'title';
  const left = Math.max(8, Math.min(overlay.r.left - 6, innerWidth - 252)); const top = Math.max(8, Math.min(overlay.r.bottom, innerHeight - 500));
  const mask = MASKS[PROP_MASK[p.type]] || MASKS.list;
  const done = () => closeOverlay();
  const openSub = (kind) => (e) => { const r = e.currentTarget.getBoundingClientRect(); setSub({ kind, top: r.top, bottom: r.bottom, x: ref.current.getBoundingClientRect().right - 4 }); };
  const insert = (at) => { const id = propId(); coll.schema[id] = { name: 'Text', type: 'text' }; cols.splice(at, 0, { property: id, visible: true, width: 200 }); done(); commit(); };
  const duplicate = () => { const id = propId(); coll.schema[id] = JSON.parse(JSON.stringify(p)); coll.schema[id].name = p.name + ' (1)'; if (coll.schema[id].type === 'title') coll.schema[id].type = 'text'; (S.rows[ctx.page.collection] || []).forEach((r) => { r[id] = JSON.parse(JSON.stringify(r[data.pid] ?? null)); }); cols.splice(idx + 1, 0, { ...col, property: id }); done(); commit(); };
  const remove = () => { delete coll.schema[data.pid]; for (const vw of ctx.page.views.map((id) => S.views[id]).filter(Boolean)) { if (vw.format && Array.isArray(vw.format.table_properties)) vw.format.table_properties = vw.format.table_properties.filter((c) => c.property !== data.pid); if (vw.sort && vw.sort.pid === data.pid) delete vw.sort; if (Array.isArray(vw.sorts)) { vw.sorts = vw.sorts.filter((x) => x.pid !== data.pid); if (!vw.sorts.length) delete vw.sorts; } if (Array.isArray(vw.filters)) { vw.filters = vw.filters.filter((f) => f.pid !== data.pid); if (!vw.filters.length) delete vw.filters; } if (vw.group_by === data.pid) { delete vw.group_by; delete vw.collapsed; } } done(); commit(); };
  const subBody = !sub ? null : sub.kind === 'sort'
    ? html`<div class="menu-group"><${MenuItem} ic="arrowStraightUp" label="Ascending" onClick=${() => { view.sorts = [{ id: uid(), pid: data.pid, dir: 'asc' }]; delete view.sort; done(); commit(); }}/><${MenuItem} ic="arrowStraightDown" label="Descending" onClick=${() => { view.sorts = [{ id: uid(), pid: data.pid, dir: 'desc' }]; delete view.sort; done(); commit(); }}/></div>`
    : sub.kind === 'type' ? html`<div class="menu-group"><div class="menu-head">Type</div>${PROP_TYPES.map(([t, n]) => html`<div class="mi" role="menuitem" onClick=${() => { p.type = t; if ((t === 'select' || t === 'multi_select' || t === 'status') && !p.options) p.options = []; done(); commit(); }}><div class="mi-in"><div class="mi-ic"><div class="th-mask pm2-mask" style=${`-webkit-mask-image:url("${MASKS[PROP_MASK[t]] || MASKS.list}");mask-image:url("${MASKS[PROP_MASK[t]] || MASKS.list}")`}></div></div><div class="mi-label">${n}</div>${p.type === t ? html`<div class="mi-check"><${Icon} n="checkmarkSmall" cls="i16"/></div>` : ''}</div></div>`)}</div>`
    : null;
  return html`<div class="menu prop-menu" ref=${ref} style=${`left:${left}px;top:${top}px`}>
    <div class="pm2-head"><div class="pm2-row"><div class="pm2-type" role=${isTitle ? undefined : 'button'} onClick=${isTitle ? undefined : openSub('type')}><div class="th-mask pm2-mask" style=${`-webkit-mask-image:url("${mask}");mask-image:url("${mask}")`}></div></div><div class="bm-search-box pm2-name"><input value=${p.name} placeholder="Property name" onInput=${(e) => { p.name = e.currentTarget.value; persist(); refresh(); }}/></div><div class="pm2-info"><${Icon} n="infoCircleFill" cls="i16"/></div></div></div>
    <div class="menu-group" onMouseEnter=${() => setSub(null)}>${isTitle ? '' : html`<div onMouseEnter=${openSub('type')}><${MenuItem} ic="arrowSquarePathUpDown" label="Change type" chev onClick=${openSub('type')}/></div>`}${READY.ai ? html`<${MenuItem} ic="magicWand" label="AI Autofill" badge="Now with agents"/>` : ''}</div>
    <div class="menu-group"><div onMouseEnter=${() => setSub(null)}>${filterable(p.type) ? html`<${MenuItem} ic="filter" label="Filter" onClick=${() => addFilter(view, data.pid, p)}/>` : ''}</div><div onMouseEnter=${openSub('sort')}><${MenuItem} ic="arrowUpDown" label="Sort" chev onClick=${openSub('sort')}/></div>${(view.type || 'table') === 'table' && groupable(p.type) ? html`<div onMouseEnter=${() => setSub(null)}><${MenuItem} ic="squareGridBelowLines" label=${view.group_by === data.pid ? 'Ungroup' : 'Group'} onClick=${() => { if (view.group_by === data.pid) { delete view.group_by; delete view.collapsed; } else { view.group_by = data.pid; delete view.collapsed; } done(); commit(); }}/></div>` : ''}${(view.type || 'table') === 'table' ? html`<div onMouseEnter=${() => setSub(null)}><${MenuItem} ic="sum" label="Calculate" onClick=${() => { done(); setTimeout(() => { const el = document.querySelector(`[data-calc="${data.pid}"]`); if (el) openOverlay('calcMenu', el, { pid: data.pid }); }, 0); }}/></div>` : ''}<div onMouseEnter=${() => setSub(null)}>${isTitle ? '' : html`<${MenuItem} ic="eyeSlash" label="Hide" onClick=${() => { col.visible = false; done(); commit(); }}/>`}<${MenuItem} ic="arrowUTurnDownLeft" label=${col.wrap ? 'Unwrap content' : 'Wrap content'} onClick=${() => { col.wrap = !col.wrap; done(); commit(); }}/></div></div>
    <div class="menu-group" onMouseEnter=${() => setSub(null)}><${MenuItem} ic="arrowRectangleLeft" label="Insert left" onClick=${() => insert(idx)}/><${MenuItem} ic="arrowRectangleRight" label="Insert right" onClick=${() => insert(idx + 1)}/><${MenuItem} ic="duplicate" label="Duplicate property" onClick=${duplicate}/>${isTitle ? '' : html`<${MenuItem} ic="trash" label="Delete property" onClick=${remove}/>`}</div>
  </div>${subBody ? html`<${SubMenu} sub=${sub}>${subBody}<//>` : ''}`;
}
function PropPicker({ data }) {
  const ctx = dbCtx(); const [q, setQ] = useState(''); const inputRef = useRef(null);
  useEffect(() => { if (inputRef.current) inputRef.current.focus(); }, []);
  if (!ctx) return null;
  const { coll, view } = ctx;
  const target = (data.vid && S.views[data.vid]) || view;
  const BY = { groupBy: (t) => ((target.type || 'table') === 'table' ? groupable(t) : t === 'select' || t === 'status'), calendarBy: (t) => t === 'date', timelineBy: (t) => t === 'date' };
  const BY_KEY = { groupBy: 'group_by', calendarBy: 'calendar_by', timelineBy: 'timeline_by' };
  const pool = BY[data.mode] ? Object.keys(coll.schema).map((k) => [k, coll.schema[k]]) : view.format.table_properties.map((c) => [c.property, coll.schema[c.property]]);
  const props = pool.filter(([, p]) => p && (!q || p.name.toLowerCase().includes(q.toLowerCase())) && (data.mode !== 'filter' || filterable(p.type)) && (!BY[data.mode] || BY[data.mode](p.type))).sort((a, b) => (a[1].type === 'title' ? -1 : b[1].type === 'title' ? 1 : a[1].name.localeCompare(b[1].name)));
  const left = Math.max(8, Math.min(overlay.r.right - 268, innerWidth - 276)); const top = Math.min(overlay.r.bottom + 4, innerHeight - 300);
  return html`<div class="menu prop-picker" style=${`left:${left}px;top:${top}px`}>
    <div class="bm-search"><div class="bm-search-in"><div class="bm-search-box"><input ref=${inputRef} placeholder=${{ sort: 'Sort by…', filter: 'Filter by…', groupBy: 'Group by…', calendarBy: 'Show calendar by…', timelineBy: 'Show timeline by…' }[data.mode] || 'Search…'} value=${q} onInput=${(e) => setQ(e.currentTarget.value)}/></div></div></div>
    <div class="bm-scroll"><div class="menu-group">${data.mode === 'groupBy' && (target.type || 'table') === 'table' && target.group_by ? html`<div class="mi" role="menuitem" onClick=${() => { delete target.group_by; delete target.collapsed; closeOverlay(); commit(); }}><div class="mi-in"><div class="mi-label">None</div></div></div>` : ''}${props.map(([pid, p]) => html`<div class="mi" role="menuitem" onClick=${() => { if (data.mode === 'filter') { addFilter(view, pid, p); return; } if (BY[data.mode]) { target[BY_KEY[data.mode]] = pid; if (data.mode === 'groupBy') delete target.collapsed; closeOverlay(); commit(); return; } addSort(view, pid); }}><div class="mi-in"><div class="mi-ic"><div class="th-mask pm2-mask" style=${`-webkit-mask-image:url("${MASKS[PROP_MASK[p.type]] || MASKS.list}");mask-image:url("${MASKS[PROP_MASK[p.type]] || MASKS.list}")`}></div></div><div class="mi-label">${p.name}</div></div></div>`)}</div></div>
  </div>`;
}
function FilterEditor({ data }) {
  const ctx = dbCtx(); const [ops, setOps] = useState(false); const [q, setQ] = useState(''); const inputRef = useRef(null);
  useEffect(() => { const t = setTimeout(() => inputRef.current && inputRef.current.focus(), 0); return () => clearTimeout(t); }, [ops]);
  if (!ctx) return null;
  const { coll, view } = ctx; const f = (view.filters || []).find((x) => x.id === data.fid); const prop = f && coll.schema[f.pid];
  if (!f || !prop) return null;
  const t = prop.type;
  const set = (patch) => { for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete f[k]; else f[k] = v; } commit(); };
  const remove = () => { view.filters = view.filters.filter((x) => x.id !== f.id); if (!view.filters.length) delete view.filters; closeOverlay(); commit(); };
  const choices = t === 'person' ? [{ v: space.me.id, label: space.me.name, you: true }, ...[...space.people.values()].filter((p) => p.id !== space.me.id).map((p) => ({ v: p.id, label: p.name }))] : ['select', 'status', 'multi_select'].includes(t) ? (prop.options || []).map((o) => ({ v: o.value, label: o.value, o })) : null;
  const picked = Array.isArray(f.value) ? f.value : [];
  const toggle = (v) => set({ value: picked.includes(v) ? picked.filter((x) => x !== v) : [...picked, v] });
  const shown = (choices || []).filter((c) => !q || String(c.label).toLowerCase().includes(q.toLowerCase()));
  const r = overlay.r; const left = Math.max(8, Math.min(r.left, innerWidth - 298)); const top = Math.max(8, Math.min(r.bottom + 4, innerHeight - 360));
  const tick = (on) => (on ? html`<span class="fe-check"><${Icon} n="checkmarkFillSmall" cls="i16"/></span>` : '');
  let body = '';
  if (ops) body = html`<div class="menu-group">${operatorsFor(t).map((op) => html`<div class="mi" role="menuitem" onClick=${() => { setOps(false); set(needsValue(op) ? { op } : { op, value: undefined }); }}><div class="mi-in"><div class="mi-label">${opLabel(op)}</div>${tick(op === f.op)}</div></div>`)}</div>`;
  else if (!needsValue(f.op)) body = '';
  else if (t === 'checkbox') body = html`<div class="menu-group">${[[true, 'Checked'], [false, 'Unchecked']].map(([v, label]) => html`<div class="mi" role="menuitem" onClick=${() => set({ value: v })}><div class="mi-in"><div class="mi-label">${label}</div>${tick(f.value === v)}</div></div>`)}</div>`;
  else if (choices) body = html`<div class="fe-search"><div class="bm-search-box"><input ref=${inputRef} placeholder=${t === 'person' ? 'Search for people…' : 'Search for an option…'} value=${q} onInput=${(e) => setQ(e.currentTarget.value)}/></div></div><div class="menu-group fe-list">${shown.map((c) => html`<div class="mi" role="menuitem" onClick=${() => toggle(c.v)}><div class="mi-in"><div class=${'fe-box' + (picked.includes(c.v) ? ' on' : '')}>${picked.includes(c.v) ? html`<${Icon} n="checkmarkFillSmall" cls="i12"/>` : ''}</div>${c.o ? html`<${SePill} o=${c.o}/>` : html`<img class="fe-av" src=${space.avatar(c.v)} alt=""/><div class="mi-label">${c.label}${c.you ? html`<span class="mn-you"> (You)</span>` : ''}</div>`}</div></div>`)}${shown.length ? '' : html`<div class="fe-none">${choices.length ? 'No results' : 'No options yet'}</div>`}</div>`;
  else body = html`<div class="fe-value"><div class="bm-search-box"><input ref=${inputRef} type=${['date', 'created_time', 'last_edited_time'].includes(t) ? 'date' : ['number', 'auto_increment_id'].includes(t) ? 'number' : 'text'} placeholder="Type a value…" value=${f.value ?? ''} onInput=${(e) => set({ value: e.currentTarget.value })}/></div></div>`;
  return html`<div class="menu filter-editor" style=${`left:${left}px;top:${top}px`}>
    <div class="fe-head"><span class="fe-name">${prop.name}</span><div class="fe-op" role="button" onClick=${() => setOps(!ops)}><span>${opLabel(f.op)}</span><${Icon} n="arrowChevronSingleDownSmall" cls="i12"/></div><div class="fe-del" role="button" aria-label="Delete filter" onClick=${remove}><${Icon} n="xMarkSmall" cls="i16"/></div></div>
    ${body}
  </div>`;
}
function SortEditor() {
  const ctx = dbCtx(); const [pick, setPick] = useState(null); const [q, setQ] = useState('');
  if (!ctx) return null;
  const { coll, view } = ctx; const sorts = liveSorts(view, coll);
  const save = (next) => { if (next.length) view.sorts = next; else { delete view.sorts; closeOverlay(); } delete view.sort; commit(); };
  const r = overlay.r; const left = Math.max(8, Math.min(r.left, innerWidth - 348)); const top = Math.max(8, Math.min(r.bottom + 4, innerHeight - 360));
  const propIcon = (p) => { const mk = MASKS[PROP_MASK[p.type]] || MASKS.list; return html`<div class="th-mask pm2-mask" style=${`-webkit-mask-image:url("${mk}");mask-image:url("${mk}")`}></div>`; };
  let body;
  if (pick && pick.kind === 'dir') {
    const cur = sorts.find((x) => x.id === pick.sid) || {};
    body = html`<div class="menu-group">${[['asc', 'Ascending'], ['desc', 'Descending']].map(([d, label]) => html`<div class="mi" role="menuitem" onClick=${() => { setPick(null); save(sorts.map((x) => (x.id === pick.sid ? { ...x, dir: d } : x))); }}><div class="mi-in"><div class="mi-label">${label}</div>${cur.dir === d ? html`<span class="fe-check"><${Icon} n="checkmarkFillSmall" cls="i16"/></span>` : ''}</div></div>`)}</div>`;
  } else if (pick) {
    const used = new Set(sorts.filter((x) => x.id !== pick.sid).map((x) => x.pid));
    const list = Object.keys(coll.schema).filter((k) => !used.has(k) && (!q || coll.schema[k].name.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => (coll.schema[a].type === 'title' ? -1 : coll.schema[b].type === 'title' ? 1 : coll.schema[a].name.localeCompare(coll.schema[b].name)));
    const choose = (pid) => { setPick(null); setQ(''); save(pick.kind === 'add' ? [...sorts, { id: uid(), pid, dir: 'asc' }] : sorts.map((x) => (x.id === pick.sid ? { ...x, pid } : x))); };
    body = html`<div class="fe-search fe-top"><div class="bm-search-box"><input placeholder="Sort by…" value=${q} ref=${(el) => { if (el && !el.dataset.on) { el.dataset.on = '1'; el.focus(); } }} onInput=${(e) => setQ(e.currentTarget.value)}/></div></div><div class="menu-group fe-list">${list.map((pid) => html`<div class="mi" role="menuitem" onClick=${() => choose(pid)}><div class="mi-in"><div class="mi-ic">${propIcon(coll.schema[pid])}</div><div class="mi-label">${coll.schema[pid].name}</div></div></div>`)}${list.length ? '' : html`<div class="fe-none">No properties left to sort by</div>`}</div>`;
  } else {
    body = html`<div class="menu-group">${sorts.map((x) => html`<div class="se2-row" key=${x.id}><div class="se2-btn se2-prop" role="button" onClick=${() => setPick({ kind: 'prop', sid: x.id })}>${propIcon(coll.schema[x.pid])}<span>${coll.schema[x.pid].name}</span><${Icon} n="arrowChevronSingleDownSmall" cls="i12"/></div><div class="se2-btn" role="button" onClick=${() => setPick({ kind: 'dir', sid: x.id })}><span>${x.dir === 'desc' ? 'Descending' : 'Ascending'}</span><${Icon} n="arrowChevronSingleDownSmall" cls="i12"/></div><div class="fe-del" role="button" aria-label="Remove sort" onClick=${() => save(sorts.filter((y) => y.id !== x.id))}><${Icon} n="xMarkSmall" cls="i16"/></div></div>`)}</div>
      <div class="menu-group"><${MenuItem} ic="plusSmall" label="Add sort" onClick=${() => setPick({ kind: 'add' })}/><${MenuItem} ic="xMarkSmall" label="Delete sort" onClick=${() => save([])}/></div>`;
  }
  return html`<div class="menu sort-editor" style=${`left:${left}px;top:${top}px`}>${body}</div>`;
}
function CalcMenu({ data }) {
  const ctx = dbCtx(); if (!ctx) return null;
  const { coll, view } = ctx; const col = (view.format.table_properties || []).find((c) => c.property === data.pid); const p = coll.schema[data.pid];
  if (!col || !p) return null;
  const pick = (fn) => { if (fn) col.calc = fn; else delete col.calc; closeOverlay(); commit(); };
  const r = overlay.r; const left = Math.max(8, Math.min(r.right - 220, innerWidth - 228)); const top = Math.max(8, Math.min(r.bottom + 4, innerHeight - 440));
  return html`<div class="menu calc-menu" style=${`left:${left}px;top:${top}px`}><div class="menu-group">${[[null, 'None'], ...calcsFor(p.type).map((fn) => [fn, calcLabel(fn)])].map(([fn, label]) => html`<div class="mi" role="menuitem" onClick=${() => pick(fn)}><div class="mi-in"><div class="mi-label">${label}</div>${(col.calc || null) === fn ? html`<span class="fe-check"><${Icon} n="checkmarkFillSmall" cls="i16"/></span>` : ''}</div></div>`)}</div></div>`;
}
function NoDateMenu({ data }) {
  const ctx = dbCtx(); if (!ctx) return null;
  const { page, coll } = ctx; const view = S.views[data.vid]; if (!view) return null;
  const dp = datePropOf(view, coll); if (!dp) return null;
  const rows = viewRows(S.rows[page.collection] || [], coll, view).filter((row) => !row[dp]);
  const r = overlay.r; const left = Math.max(8, Math.min(r.left, innerWidth - 268)); const top = Math.max(8, Math.min(r.bottom + 4, innerHeight - 320));
  return html`<div class="menu np-menu" role="menu" style=${`left:${left}px;top:${top}px`}>
    <div class="menu-group"><div class="menu-head">No ${coll.schema[dp].name}</div>${rows.map((row) => html`<div class="mi" role="menuitem" onClick=${() => openRowPage(row)}><div class="mi-in"><div class="mi-ic np-ic"><${Icon} n="page" cls="i18"/></div><div class="mi-label">${row.title || 'Untitled'}</div></div></div>`)}</div>
  </div>`;
}
function NewRowMenu() {
  const left = Math.max(8, Math.min(overlay.r.right - 290, innerWidth - 298)); const top = overlay.r.bottom + 4;
  return html`<div class="menu new-menu" style=${`left:${left}px;top:${top}px`}>
    <div class="menu-group"><div class="menu-head">Templates for Name</div><div class="nm-desc">Create a reusable page format for this database.</div></div>
    <div class="menu-group"><${MenuItem} ic="plusSmall" label="New template" tone="muted" onClick=${closeOverlay}/></div>
  </div>`;
}


/* ------------------------------------------------------------------ database cell editors (measured: select 300px, date picker 248x500 over the cell) */
const OPT_COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function dbRow(rowId) { const ctx = dbCtx(); if (!ctx) return null; const rows = S.rows[ctx.page.collection] || []; return { ...ctx, rows, row: rows.find((r) => r.id === rowId) }; }
function openRowPage(row) {
  const ctx = dbCtx(); if (!ctx) return;
  const pid = rowPageId(row.id);
  if (!S.pages[pid]) S.pages[pid] = { id: pid, kind: 'page', icon: null, title: row.title || '', content: [], lastEdited: NOW(), parent: ctx.page.id, rowOf: { coll: ctx.page.collection, row: row.id } };
  closeOverlay(); go(pid);
}
const SePill = ({ o, onX }) => { const [bg, fg] = OPT[o.color] || OPT.default; return html`<div class="se-pill" style=${`background:${bg};color:${fg}`}><span>${o.value}</span>${onX ? html`<div class="se-x" role="button" onClick=${(e) => { e.stopPropagation(); onX(); }}><${Icon} n="xMark" cls="i16"/></div>` : ''}</div>`; };
function SelectEditor({ data }) {
  const ctx = dbRow(data.rowId); const [q, setQ] = useState(''); const inputRef = useRef(null);
  useEffect(() => { if (inputRef.current) inputRef.current.focus(); }, []);
  if (!ctx || !ctx.row) return null;
  const { coll, row } = ctx; const prop = coll.schema[data.pid]; if (!prop) return null;
  const multi = prop.type === 'multi_select'; prop.options = prop.options || [];
  const cur = multi ? (row[data.pid] || []) : (row[data.pid] ? [row[data.pid]] : []);
  const setVal = (v) => { if (multi) row[data.pid] = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]; else { row[data.pid] = v; closeOverlay(); } row.edited = NOW(); commit(); };
  const removeVal = (v) => { row[data.pid] = multi ? cur.filter((x) => x !== v) : undefined; row.edited = NOW(); commit(); };
  const list = prop.options.filter((o) => !q || o.value.toLowerCase().includes(q.toLowerCase()));
  const exact = prop.options.find((o) => o.value.toLowerCase() === q.trim().toLowerCase());
  const nextColor = OPT_COLORS[prop.options.length % OPT_COLORS.length];
  const create = () => { const v = q.trim(); if (!v) return; if (!exact) prop.options.push({ id: uid(), value: v, color: nextColor }); setQ(''); setVal(exact ? exact.value : v); };
  const r = overlay.r; const left = Math.max(8, Math.min(r.left - 1, innerWidth - 308)); const top = Math.max(8, Math.min(r.top - 1, innerHeight - 220));
  return html`<div class="menu sel-editor" style=${`left:${left}px;top:${top}px`}>
    <div class="se-top"><div class="se-top-in">${cur.map((v) => html`<${SePill} o=${prop.options.find((x) => x.value === v) || { value: v, color: 'default' }} onX=${() => removeVal(v)}/>`)}<input ref=${inputRef} class="se-input" value=${q} onInput=${(e) => setQ(e.currentTarget.value)} onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); if (exact || !q.trim()) { if (exact) { setQ(''); setVal(exact.value); } } else create(); } if (e.key === 'Backspace' && !q && cur.length) removeVal(cur[cur.length - 1]); }}/></div></div>
    <div class="se-list"><div class="menu-group"><div class="menu-head">Select an option or create one</div>${list.map((o) => html`<div class="mi se-row" role="menuitem" onClick=${() => setVal(o.value)}><div class="mi-in"><div class="se-drag"><${Icon} n="dragHandleFillSmall" cls="i16"/></div><div class="se-row-pill"><${SePill} o=${o}/></div></div></div>`)}${q.trim() && !exact ? html`<div class="mi se-row" role="menuitem" onClick=${create}><div class="mi-in"><span class="se-create">Create</span><${SePill} o=${{ value: q.trim(), color: nextColor }}/></div></div>` : ''}</div></div>
  </div>`;
}
function TextEditor({ data }) {
  const ctx = dbRow(data.rowId); const ref = useRef(null);
  useEffect(() => { const el = ref.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); el.style.height = el.scrollHeight + 'px'; } }, []);
  if (!ctx || !ctx.row) return null;
  const { coll, row } = ctx; const prop = coll.schema[data.pid]; if (!prop) return null;
  const save = (val) => { row[data.pid] = prop.type === 'number' ? (val === '' || isNaN(Number(val)) ? undefined : Number(val)) : val; row.edited = NOW(); persist(); };
  const r = overlay.r;
  return html`<div class="menu txt-editor" style=${`left:${r.left}px;top:${r.top}px;width:${Math.max(r.width, 240)}px`}><textarea ref=${ref} rows="1" value=${row[data.pid] ?? ''} onInput=${(e) => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; save(el.value); }} onKeyDown=${(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(e.currentTarget.value); closeOverlay(); } }}></textarea></div>`;
}
function DateEditor({ data }) {
  const ctx = dbRow(data.rowId); const [month, setMonth] = useState(null);
  if (!ctx || !ctx.row) return null;
  const { row } = ctx; const val = row[data.pid] || '';
  const today = new Date(NOW()); const todayIso = isoDate(today);
  const base = month || (val ? new Date(val + 'T12:00:00') : today); const y = base.getFullYear(); const m = base.getMonth();
  const first = new Date(y, m, 1); const days = Array.from({ length: 42 }, (_, i) => new Date(y, m, 1 - first.getDay() + i));
  const pick = (d) => { row[data.pid] = isoDate(d); row.edited = NOW(); commit(); };
  const shown = val ? new Date(val + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const r = overlay.r; const left = Math.max(8, Math.min(r.left - 4, innerWidth - 256)); const top = Math.max(8, Math.min(r.top - 3, innerHeight - 508));
  return html`<div class="menu date-editor" style=${`left:${left}px;top:${top}px`}>
    <div class="menu-group"><div class="de-input-row"><div class="bm-search-box de-input"><input value=${shown} placeholder="Type a date" onKeyDown=${(e) => { if (e.key === 'Enter') { const d = new Date(e.currentTarget.value); if (!isNaN(d)) { setMonth(null); pick(d); } } }}/></div></div>
      <div class="de-cal"><div class="de-cap"><h2>${base.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</h2><div class="de-cap-r"><div class="de-today" role="button" onClick=${() => { setMonth(null); pick(today); }}>Today</div><div class="de-nav" role="button" onClick=${() => setMonth(new Date(y, m - 1, 1))}><${Icon} n="arrowChevronSingleRightSmall" cls="i16 flipx"/></div><div class="de-nav" role="button" onClick=${() => setMonth(new Date(y, m + 1, 1))}><${Icon} n="arrowChevronSingleRightSmall" cls="i16"/></div></div></div>
      <table class="de-table"><thead><tr>${['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => html`<th>${d}</th>`)}</tr></thead><tbody>${[0, 1, 2, 3, 4, 5].map((w) => html`<tr>${days.slice(w * 7, w * 7 + 7).map((d) => { const iso = isoDate(d); return html`<td><button class=${'de-day' + (d.getMonth() !== m ? ' out' : '') + (iso === todayIso ? ' today' : '') + (iso === val ? ' sel' : '')} onClick=${() => pick(d)}>${d.getDate()}</button></td>`; })}</tr>`)}</tbody></table></div></div>
    <div class="menu-group"><div class="mi" role="menuitem" onClick=${() => { row[data.pid] = undefined; row.edited = NOW(); closeOverlay(); commit(); }}><div class="mi-in"><div class="mi-label">Clear</div></div></div></div>
  </div>`;
}
function PersonEditor({ data }) {
  const ctx = dbRow(data.rowId); const [q, setQ] = useState(''); const inputRef = useRef(null);
  useEffect(() => { if (inputRef.current) inputRef.current.focus(); }, []);
  if (!ctx || !ctx.row || !ctx.coll.schema[data.pid]) return null;
  const { row } = ctx; const cur = Array.isArray(row[data.pid]) ? row[data.pid] : [];
  const people = [{ id: space.me.id, name: space.me.name, you: true }, ...[...space.people.values()].filter((p) => p.id !== space.me.id)];
  const save = (ids) => { if (ids.length) row[data.pid] = ids; else delete row[data.pid]; row.edited = NOW(); commit(); };
  const flip = (id) => save(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  const list = people.filter((p) => !q || String(p.name || '').toLowerCase().includes(q.toLowerCase()));
  const r = overlay.r; const left = Math.max(8, Math.min(r.left - 1, innerWidth - 308)); const top = Math.max(8, Math.min(r.top - 1, innerHeight - 260));
  return html`<div class="menu sel-editor person-editor" style=${`left:${left}px;top:${top}px`}>
    <div class="se-top"><div class="se-top-in">${cur.map((id) => html`<div class="se-pill pe-chip"><img src=${space.avatar(id)} alt=""/><span>${space.personName(id)}</span><div class="se-x" role="button" onClick=${(e) => { e.stopPropagation(); flip(id); }}><${Icon} n="xMark" cls="i16"/></div></div>`)}<input ref=${inputRef} class="se-input" value=${q} placeholder=${cur.length ? '' : 'Search for people…'} onInput=${(e) => setQ(e.currentTarget.value)} onKeyDown=${(e) => { if (e.key === 'Enter' && list[0]) { e.preventDefault(); flip(list[0].id); setQ(''); } if (e.key === 'Backspace' && !q && cur.length) save(cur.slice(0, -1)); }}/></div></div>
    <div class="se-list"><div class="menu-group">${list.map((p) => html`<div class="mi se-row" role="menuitem" onClick=${() => flip(p.id)}><div class="mi-in"><img class="pe-av" src=${space.avatar(p.id)} alt=""/><div class="mi-label">${p.name}${p.you ? html`<span class="mn-you"> (You)</span>` : ''}</div>${cur.includes(p.id) ? html`<span class="fe-check"><${Icon} n="checkmarkFillSmall" cls="i16"/></span>` : ''}</div></div>`)}${list.length ? '' : html`<div class="fe-none">No people found</div>`}</div></div>
  </div>`;
}
function FilesEditor({ data }) {
  const ctx = dbRow(data.rowId); const fileRef = useRef(null); const [busy, setBusy] = useState(0);
  if (!ctx || !ctx.row || !ctx.coll.schema[data.pid]) return null;
  const { row, page } = ctx; const list = Array.isArray(row[data.pid]) ? row[data.pid] : [];
  const save = (next) => { if (next.length) row[data.pid] = next; else delete row[data.pid]; row.edited = NOW(); commit(); };
  // Several files can be on their way at once, so each one lands on the list as it stands when its upload finishes.
  const onFile = (e) => {
    const files = [...(e.currentTarget.files || [])]; e.currentTarget.value = '';
    for (const file of files) {
      setBusy((n) => n + 1);
      space.upload(file, page.id)
        .then((ref) => save([...(Array.isArray(row[data.pid]) ? row[data.pid] : []), { name: file.name, ref }]), () => showToast({ warn: true, text: `${file.name} could not be uploaded. Try again.` }))
        .finally(() => setBusy((n) => n - 1));
    }
  };
  const r = overlay.r; const left = Math.max(8, Math.min(r.left - 1, innerWidth - 308)); const top = Math.max(8, Math.min(r.top - 1, innerHeight - 260));
  return html`<div class="menu files-editor" style=${`left:${left}px;top:${top}px`}>
    <div class="menu-group">${list.map((f, i) => html`<div class="mi fe-file" key=${f.ref || i}><div class="mi-in"><div class="mi-ic"><${Icon} n="paperClip" cls="i16"/></div><a class="mi-label fe-file-name" href=${space.fileUrl(f.ref) || undefined} target="_blank" rel="noopener">${f.name || 'File'}</a><div class="fe-del" role="button" aria-label=${`Remove ${f.name || 'file'}`} onClick=${() => save(list.filter((_, j) => j !== i))}><${Icon} n="xMarkSmall" cls="i16"/></div></div></div>`)}${list.length ? '' : html`<div class="fe-none">No files yet</div>`}</div>
    <div class="menu-group"><${MenuItem} ic="plusSmall" label=${busy ? 'Uploading…' : 'Upload a file'} onClick=${() => fileRef.current && fileRef.current.click()}/><input ref=${fileRef} type="file" multiple hidden onChange=${onFile}/></div>
  </div>`;
}
function RowProps({ page }) {
  const coll = S.collections[page.rowOf.coll]; const row = (S.rows[page.rowOf.coll] || []).find((x) => x.id === page.rowOf.row); if (!coll || !row) return null;
  const view = Object.values(S.views).find((vw) => vw.format && vw.format.table_properties.some((c) => coll.schema[c.property]));
  const keys = (view ? view.format.table_properties.map((c) => c.property) : Object.keys(coll.schema)).filter((k) => coll.schema[k] && coll.schema[k].type !== 'title');
  const text = (k) => { const pr = coll.schema[k]; const val = row[k]; if (val === undefined || val === null || val === '' || (Array.isArray(val) && !val.length)) return html`<span class="rp-empty">Empty</span>`; if (pr.type === 'date') return fmtDate(val); if (pr.type === 'checkbox') return val ? 'Yes' : 'No'; if (pr.type === 'number') return fmtNum(val, pr.number_format); if (Array.isArray(val)) return val.join(', '); return String(val); };
  return html`<div class="row-props">${keys.map((k) => { const mk = MASKS[PROP_MASK[coll.schema[k].type]] || MASKS.list; return html`<div class="row-prop"><div class="row-prop-k"><div class="th-mask pm2-mask" style=${`-webkit-mask-image:url("${mk}");mask-image:url("${mk}")`}></div><span>${coll.schema[k].name}</span></div><div class="row-prop-v">${text(k)}</div></div>`; })}</div>`;
}


/* ------------------------------------------------------------------ database row side peek (measured: right half, props 38px rows, labels 168px) */
let peekRow = null;
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay && peekRow && !(document.activeElement && document.activeElement.isContentEditable)) { peekRow = null; refresh(); } });
function RowPeek({ page, row }) {
  const coll = S.collections[page.collection]; const titleRef = useRef(null);
  useLayoutEffect(() => { const el = titleRef.current; if (el && document.activeElement !== el && el.textContent !== (row.title || '')) el.textContent = row.title || ''; });
  const keys = Object.keys(coll.schema).filter((k) => coll.schema[k].type !== 'title').sort((a, b) => coll.schema[a].name.localeCompare(coll.schema[b].name));
  const edit = (pid) => (e) => { const t = coll.schema[pid].type; const kind = t === 'select' || t === 'status' || t === 'multi_select' ? 'cellSelect' : t === 'date' ? 'cellDate' : t === 'person' ? 'cellPerson' : t === 'files' ? 'cellFiles' : ['text', 'number', 'url', 'email', 'phone_number'].includes(t) ? 'cellText' : null; if (kind) openOverlay(kind, e.currentTarget, { rowId: row.id, pid }); };
  const empty = html`<span class="pk-empty">Empty</span>`;
  const pillOf = (o, status) => { const [bg, fg, dot] = OPT[o.color] || OPT.default; return html`<div class=${'pill ' + (status ? 'status' : 'sel')} style=${`background:${bg};color:${fg}`}>${status ? html`<div class="dot" style=${`background:${dot}`}></div>` : ''}<span>${o.value}</span></div>`; };
  const value = (pid) => {
    const pr = coll.schema[pid]; const v = row[pid];
    if (pr.type === 'select' || pr.type === 'status') { const o = (pr.options || []).find((x) => x.value === v); return o ? html`<div class="pills">${pillOf(o, pr.type === 'status')}</div>` : empty; }
    if (pr.type === 'multi_select') { const os = (v || []).map((x) => (pr.options || []).find((o) => o.value === x)).filter(Boolean); return os.length ? html`<div class="pills">${os.map((o) => pillOf(o, false))}</div>` : empty; }
    if (pr.type === 'checkbox') return html`<div class=${'cb' + (v ? ' on' : '')} role="checkbox" onClick=${(e) => { e.stopPropagation(); row[pid] = !v; commit(); }}>${v ? html`<${Icon} n="checkmarkFillSmall" cls="tick"/>` : ''}</div>`;
    if (pr.type === 'date') return v ? fmtDate(v) : empty;
    if (pr.type === 'number') return v === undefined || v === null || v === '' ? empty : fmtNum(v, pr.number_format);
    if (pr.type === 'auto_increment_id') return v ? `${pr.prefix}-${v}` : empty;
    if (pr.type === 'created_time' || pr.type === 'last_edited_time') return fmtDateTime(row.created);
    if (pr.type === 'formula') return empty;
    if (pr.type === 'person') return (v || []).length ? html`<span class="pk-person"><img src=${space.avatar(v[0])} alt=""/>${v.map((x) => space.personName(x) || x).join(', ')}</span>` : empty;
    if (pr.type === 'file') return empty;
    if (pr.type === 'files') { const list = Array.isArray(v) ? v : []; return list.length ? html`<div class="file-chips">${list.map((f) => html`<a class="file-chip" href=${space.fileUrl(f.ref) || undefined} target="_blank" rel="noopener" onClick=${(e) => e.stopPropagation()}>${f.name || 'File'}</a>`)}</div>` : empty; }
    return v ? String(v) : empty;
  };
  return html`<div class="peek">
    <div class="peek-top"><div class="peek-top-l"><div class="tb-btn sq" role="button" onClick=${() => { peekRow = null; refresh(); }}><span class="mirror"><${Icon} n="arrowChevronDoubleBackward" cls="i20"/></span></div><div class="tb-btn sq" role="button" onClick=${() => { peekRow = null; openRowPage(row); }}><${Icon} n="arrowDiagonalUpRight" cls="i20"/></div></div><div class="tb-right"></div></div>
    <div class="peek-scroll">
      <h1 class="peek-title" ref=${titleRef} contenteditable="true" spellcheck="true" data-ph="New page" onInput=${(e) => { row.title = e.currentTarget.textContent; row.edited = NOW(); persist(); refresh(); }}></h1>
      <div class="peek-props">${keys.map((k) => { const mk = MASKS[PROP_MASK[coll.schema[k].type]] || MASKS.list; return html`<div class="pk-row"><div class="pk-k"><div class="th-mask pm2-mask pk-mask" style=${`-webkit-mask-image:url("${mk}");mask-image:url("${mk}")`}></div><span>${coll.schema[k].name}</span></div><div class="pk-v" onClick=${edit(k)}>${value(k)}</div></div>`; })}</div>
      <div class="pk-comments"><div class="pk-comments-h">Comments</div><div class="pk-add-comment"><img src=${space.avatar()} alt=""/><span>Add a comment…</span></div></div>
      <div class="pk-hint">Press Enter to continue with an empty page, or <span>create a template</span></div>
    </div>
  </div>`;
}


/* ------------------------------------------------------------------ database view tab menu (measured: 220px under the tab) + sidebar toggle */
addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === '\\') { e.preventDefault(); S.sidebar.collapsed = !S.sidebar.collapsed; commit(); } });
function ViewMenu({ data }) {
  const ctx = dbCtx(); if (!ctx) return null;
  const { page } = ctx; const vw = S.views[data.vid]; if (!vw) return null;
  const done = () => closeOverlay();
  return html`<div class="menu view-menu" style=${`left:${Math.max(8, overlay.r.left)}px;top:${overlay.r.bottom + 4}px`}>
    <div class="menu-group"><${MenuItem} ic="pencilLine" label="Rename" onClick=${() => { S.renamingView = data.vid; done(); commit(); }}/><${MenuItem} ic="sliders" label="Edit view" onClick=${() => { viewSettings = { vid: data.vid }; done(); refresh(); }}/><${MenuItem} ic="pathRoundEnds" label="Source" val=${page.title} valSm tone="muted"/></div>
    <div class="menu-group"><${MenuItem} ic="link" label="Copy link to view" onClick=${() => { try { navigator.clipboard.writeText(location.href); } catch (e) {} done(); }}/></div>
    <div class="menu-group"><${MenuItem} ic="duplicate" label="Duplicate view" onClick=${() => { const nid = uid(); S.views[nid] = JSON.parse(JSON.stringify(vw)); S.views[nid].id = nid; S.views[nid].name = vw.name + ' (1)'; page.views.splice(page.views.indexOf(data.vid) + 1, 0, nid); page.activeView = nid; done(); commit(); }}/>${page.views.length > 1 ? html`<${MenuItem} ic="trash" label="Delete view" onClick=${() => { page.views = page.views.filter((x) => x !== data.vid); delete S.views[data.vid]; page.activeView = page.views[0]; done(); commit(); showToast({ text: `Deleted ${vw.name} view` }); }}/>` : ''}</div>
    <div class="menu-group"><${MenuItem} ic="calendarDate10" label="Open Calendar" onClick=${() => { done(); space.openApp('/calendar'); }}/></div>
  </div>`;
}


/* ------------------------------------------------------------------ slash: Page, Link to page, AI Meeting Notes */
function slashInsert(id, item) {
  const b = S.blocks[id]; if (!b) return;
  const host = S.pages[route()];
  if (item.n === 'Link to page') { commit(); const el = document.querySelector(`[data-ed="${id}"]`); openOverlay('linkPage', el, { blockId: id }); return; }
  const [arr, i] = siblings(id); const empty = !plain(b.title);
  let nb;
  if (item.n === 'Page') {
    const pid = 'p' + uid();
    S.pages[pid] = { id: pid, kind: 'page', icon: null, title: '', content: [], lastEdited: NOW(), parent: host ? host.id : null };
    nb = newBlock('page', [], b.parent); nb.pageId = pid;
  } else {
    nb = newBlock('transcription', [], b.parent); const note = newBlock('text', [], nb.id);
    Object.assign(nb, { when: 'Today', tab: 'notes', share: false, notes: [note.id], transcript: [], fresh: true });
  }
  if (empty) { arr.splice(i, 1, nb.id); delete S.blocks[id]; } else arr.splice(i + 1, 0, nb.id);
  touch(); commit();
  if (item.n === 'Page') { pendingTitleFocus = nb.pageId; go(nb.pageId); }
}
function LinkPageMenu({ data }) {
  const [q, setQ] = useState(''); const inputRef = useRef(null);
  useEffect(() => { if (inputRef.current) inputRef.current.focus(); }, []);
  const here = route();
  const list = Object.values(S.pages).filter((p) => p.kind !== 'stub' && !p.trashed && p.id !== here && (!q || (p.title || 'New page').toLowerCase().includes(q.toLowerCase()))).slice(0, 12);
  const pick = (p) => {
    const b = S.blocks[data.blockId]; closeOverlay(); if (!b) return;
    const [arr, i] = siblings(b.id); const nb = newBlock('link_to_page', [], b.parent); nb.pageId = p.id;
    if (!plain(b.title)) { arr.splice(i, 1, nb.id); delete S.blocks[b.id]; } else arr.splice(i + 1, 0, nb.id);
    touch(); commit();
  };
  const left = Math.max(8, Math.min(overlay.r.left, innerWidth - 336)); const top = Math.min(overlay.r.bottom + 4, innerHeight - 380);
  return html`<div class="menu move-menu" style=${`left:${left}px;top:${top}px`}>
    <div class="bm-search"><div class="bm-search-in"><div class="bm-search-box"><input ref=${inputRef} placeholder="Link to page…" value=${q} onInput=${(e) => setQ(e.currentTarget.value)} onKeyDown=${(e) => { if (e.key === 'Enter' && list[0]) { e.preventDefault(); pick(list[0]); } }}/></div></div></div>
    <div class="bm-scroll"><div class="menu-group"><div class="menu-head">Suggested</div>${list.length ? list.map((p) => html`<div class="mi" role="menuitem" onClick=${() => pick(p)}><div class="mi-in"><div class="mi-ic"><${RowIcon} page=${p}/></div><div class="mi-label">${(p.titleParts || [p.title || 'New page']).join('')}</div></div></div>`) : html`<div class="menu-meta">No results</div>`}</div></div>
  </div>`;
}


/* ------------------------------------------------------------------ database row gutter: add below, drag to reorder, row menu, selection (measured: + at -86px, handle at -62px, checkbox at -25px) */
const dbSel = new Set();
addEventListener('keydown', (e) => {
  if (!dbSel.size || overlay || !(e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Escape')) return;
  const a = document.activeElement; if (a && (a.isContentEditable || /INPUT|TEXTAREA/.test(a.tagName))) return;
  const ctx = dbCtx(); if (!ctx) return;
  e.preventDefault();
  if (e.key !== 'Escape') { const rows = S.rows[ctx.page.collection]; const keep = rows.filter((x) => !dbSel.has(x.id)); rows.splice(0, rows.length, ...keep); }
  dbSel.clear(); commit();
});
function rowDragDown(e, rows, r, view) {
  if (e.button !== 0) return; e.preventDefault();
  const handle = e.currentTarget; const rowEl = handle.closest('.nsp-table-view-row');
  const sx = e.clientX; const sy = e.clientY; let moved = false; let ghost = null; let line = null; let target = null; let dy = 0;
  const onMove = (ev) => {
    if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
    if (!moved) {
      moved = true; const rr = rowEl.getBoundingClientRect(); dy = sy - rr.top;
      ghost = rowEl.cloneNode(true); ghost.classList.add('row-ghost'); Object.assign(ghost.style, { left: rr.left + 'px', top: rr.top + 'px', width: rr.width + 'px' });
      line = document.createElement('div'); line.className = 'blk-drop'; line.style.display = 'none';
      space.root.append(ghost, line); document.body.style.cursor = 'grabbing'; dbSel.clear(); dbSel.add(r.id); refresh();
    }
    ghost.style.top = ev.clientY - dy + 'px';
    const hit = [...document.querySelectorAll('.nsp-table-view-row')].map((el) => ({ el, b: el.getBoundingClientRect() })).find((x) => ev.clientY >= x.b.top && ev.clientY < x.b.bottom);
    if (!hit || sortsOf(view).length || (view.group_by && (view.type || 'table') === 'table')) { line.style.display = 'none'; target = null; return; }
    target = { id: hit.el.dataset.rowId, before: ev.clientY < hit.b.top + hit.b.height / 2 };
    Object.assign(line.style, { display: 'block', left: hit.b.left + 'px', width: hit.b.width + 'px', top: (target.before ? hit.b.top : hit.b.bottom) - 2 + 'px' });
  };
  const onUp = () => {
    removeEventListener('mousemove', onMove, true); removeEventListener('mouseup', onUp, true);
    if (!moved) { openOverlay('rowActions', handle, { rowId: r.id }); return; }
    ghost.remove(); line.remove(); document.body.style.cursor = ''; dbSel.clear();
    if (target && target.id && target.id !== r.id) { rows.splice(rows.indexOf(r), 1); let to = rows.findIndex((x) => x.id === target.id); if (!target.before) to += 1; rows.splice(to, 0, r); commit(); } else refresh();
  };
  addEventListener('mousemove', onMove, true); addEventListener('mouseup', onUp, true);
}
function RowActionsMenu({ data }) {
  const ctx = dbRow(data.rowId); if (!ctx || !ctx.row) return null;
  const { rows, row } = ctx; const done = () => closeOverlay();
  const left = Math.max(8, overlay.r.left); const top = Math.min(overlay.r.bottom + 4, innerHeight - 180);
  return html`<div class="menu row-actions" style=${`left:${left}px;top:${top}px`}>
    <div class="menu-group"><${MenuItem} ic="peekSide" label="Open in side peek" onClick=${() => { peekRow = row.id; done(); refresh(); }}/><${MenuItem} ic="arrowDiagonalUpRight" label="Open as page" onClick=${() => { done(); openRowPage(row); }}/></div>
    <div class="menu-group"><${MenuItem} ic="duplicate" label="Duplicate" sc="⌘D" onClick=${() => { const i = rows.indexOf(row); const copy = JSON.parse(JSON.stringify(row)); copy.id = uid(); copy.created = NOW(); rows.splice(i + 1, 0, copy); done(); commit(); }}/><${MenuItem} ic="trash" label="Delete" sc="Del" onClick=${() => { rows.splice(rows.indexOf(row), 1); done(); commit(); }}/></div>
  </div>`;
}


/* ------------------------------------------------------------------ database: Add view menu (measured 390px grid) + Kanban board view */
const VIEW_TYPES = [['table', 'viewTable', 'Table'], ['board', 'viewBoard', 'Board'], ['gallery', 'squareGrid2X2', 'Gallery'], ['list', 'listBullet', 'List'], ['chart', 'viewChart', 'Chart'], ['dashboard', 'viewDashboard', 'Dashboard'], ['timeline', 'viewTimeline', 'Timeline'], ['feed', 'newspaper', 'Feed'], ['map', 'viewMap', 'Map'], ['calendar', 'viewCalendar', 'Calendar'], ['form', 'form', 'Form']].filter(([t]) => READY.maps || t !== 'map');
const groupPropOf = (coll) => Object.keys(coll.schema).find((k) => coll.schema[k].type === 'status') || Object.keys(coll.schema).find((k) => coll.schema[k].type === 'select');
function AddViewMenu() {
  const ctx = dbCtx(); if (!ctx) return null;
  const { page, coll, view } = ctx;
  const make = (type, label) => { const nid = uid(); const base = JSON.parse(JSON.stringify(view)); delete base.sort; Object.assign(base, { id: nid, name: 'New view', type: ['board', 'gallery', 'list', 'calendar', 'timeline', 'feed', 'chart', 'dashboard', 'form', 'map'].includes(type) ? type : 'table' }); if (type === 'board') base.group_by = groupPropOf(coll); S.views[nid] = base; page.views.push(nid); page.activeView = nid; viewSettings = type === 'dashboard' || type === 'form' ? null : { vid: nid }; if (type === 'dashboard') base.name = 'Dashboard'; if (type === 'form') base.name = 'Form builder'; closeOverlay(); commit(); if (type === 'form') openOverlay('formSetup', null, { vid: nid }); };
  return html`<div class="menu add-view" style=${`left:${overlay.r.left}px;top:${overlay.r.bottom + 4}px`}>
    <div class="av-head">Add a new view</div>
    <div class="av-grid">${VIEW_TYPES.map(([t, ic, label]) => html`<div class="av-tile" role="button" onClick=${() => make(t, label)}><${Icon} n=${ic} cls="i20"/><span>${label}</span></div>`)}</div>
  </div>`;
}
// Measured: 276px columns 12px apart, tinted header (radius 10 10 0 0) over a tinted body (radius 0 0 10 10),
// white 260px cards with a 15px/500 title only, hover actions (edit, more) top-right, outlined "New page" button.
const BOARD_TINT = { default: 'rgba(66,35,3,.03)', gray: 'rgba(66,35,3,.03)', brown: 'rgba(139,46,0,.035)', orange: 'rgba(224,101,1,.045)', yellow: 'rgba(211,168,0,.06)', green: 'rgba(3,87,31,.035)', blue: 'rgba(0,128,213,.047)', purple: 'rgba(102,0,178,.035)', pink: 'rgba(197,0,93,.035)', red: 'rgba(223,22,0,.04)' };
let renamingCard = null;
function BoardView({ page, coll, view, rows }) {
  const gp = view.group_by && coll.schema[view.group_by] ? view.group_by : groupPropOf(coll);
  if (!gp) return html`<div class="lib-empty">Add a Status or Select property to group this board.</div>`;
  const prop = coll.schema[gp]; const options = prop.options || [];
  const ordered = viewRows(rows, coll, view);
  const groups = [{ value: null, label: 'No ' + prop.name }, ...options.map((o) => ({ value: o.value, label: o.value, o }))].filter((g) => g.value !== null || ordered.some((r) => !r[gp]));
  const pillOf = (o, status) => { const [bg, fg, dot] = OPT[o.color] || OPT.default; return html`<div class=${'pill ' + (status ? 'status' : 'sel')} style=${`background:${bg};color:${fg}`}>${status ? html`<div class="dot" style=${`background:${dot}`}></div>` : ''}<span>${o.value}</span></div>`; };
  const addCard = (g) => { rows.push({ ...newRow(view, coll), [gp]: g.value || undefined }); commit(); };
  const tint = (g) => (view.colorColumns === false ? 'transparent' : BOARD_TINT[(g.o && g.o.color) || 'default'] || BOARD_TINT.default);
  const stop = (e) => e.stopPropagation();
  return html`<div class="nsp-board-view board">${groups.map((g) => { const items = ordered.filter((r) => (r[gp] || null) === g.value); return html`<div class="board-col" data-group=${g.value === null ? '' : g.value}>
      <div class="board-head" style=${`background:${tint(g)}`}><div class="board-pillbtn">${g.o ? pillOf(g.o, prop.type === 'status') : html`<span class="board-none">${g.label}</span>`}</div><div class="board-count">${items.length}</div><div class="board-head-acts"><div class="board-hbtn" role="button" onClick=${() => addCard(g)}><${Icon} n="plusSmall" cls="i16"/></div></div></div>
      <div class="nsp-board-group board-body" style=${`background:${tint(g)}`}><div class="board-cards">${items.map((r) => html`<div class=${'board-card' + (peekRow === r.id ? ' on' : '')} key=${r.id} data-row-id=${r.id} onMouseDown=${(e) => { if (renamingCard !== r.id) cardDragDown(e, rows, r, gp); }}>
          <div class="bc-acts" onMouseDown=${stop}><div class="bc-act" role="button" onClick=${() => { renamingCard = r.id; refresh(); }}><${Icon} n="pencilLineSmall" cls="i16"/></div><div class="bc-act" role="button" onClick=${(e) => openOverlay('rowActions', e.currentTarget, { rowId: r.id })}><${Icon} n="ellipsisSmall" cls="i16"/></div></div>
          <div class="bc-in">${renamingCard === r.id ? html`<div key="edit" class="bc-title editing" contenteditable="true" ref=${(el) => { if (el && document.activeElement !== el) { el.textContent = r.title || ''; el.focus(); setCaret(el, 'end'); } }} onMouseDown=${stop} onKeyDown=${(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); r.title = e.currentTarget.textContent; renamingCard = null; commit(); } }} onBlur=${(e) => { if (renamingCard === r.id) { r.title = e.currentTarget.textContent; renamingCard = null; commit(); } }}></div>` : html`<div key="view" class="bc-title">${r.title || html`<span class="bc-untitled">Untitled</span>`}</div>`}</div>
        </div>`)}</div>
        <div class="board-new" role="button" onClick=${() => addCard(g)}><${Icon} n="plusSmall" cls="i16"/><span>New page</span></div>
      </div>
    </div>`; })}</div>`;
}

/* ------------------------------------------------------------------ database gallery view (measured: 315px cards on a 16px grid, 146px tinted preview, 15px/500 title) */
function GalleryView({ coll, view, rows }) {
  const ordered = viewRows(rows, coll, view);
  const stop = (e) => e.stopPropagation();
  return html`<div class="nsp-gallery-view gallery"><div class="gal-grid" style=${`grid-template-columns:repeat(auto-fill,minmax(${{ small: 180, medium: 260, large: 320 }[view.cardSize || 'medium']}px,1fr))`}>${ordered.map((r) => html`<div class=${'gal-card' + (peekRow === r.id ? ' on' : '')} key=${r.id} onClick=${() => { if (renamingCard !== r.id) openRow(r); }}>
      <div class="gal-preview"></div>
      <div class="bc-acts" onClick=${stop}><div class="bc-act" role="button" onClick=${() => { renamingCard = r.id; refresh(); }}><${Icon} n="pencilLineSmall" cls="i16"/></div><div class="bc-act" role="button" onClick=${(e) => openOverlay('rowActions', e.currentTarget, { rowId: r.id })}><${Icon} n="ellipsisSmall" cls="i16"/></div></div>
      <div class="bc-in">${renamingCard === r.id ? html`<div key="edit" class="bc-title editing" contenteditable="true" ref=${(el) => { if (el && document.activeElement !== el) { el.textContent = r.title || ''; el.focus(); setCaret(el, 'end'); } }} onClick=${stop} onKeyDown=${(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); r.title = e.currentTarget.textContent; renamingCard = null; commit(); } }} onBlur=${(e) => { if (renamingCard === r.id) { r.title = e.currentTarget.textContent; renamingCard = null; commit(); } }}></div>` : html`<div key="view" class="bc-title">${r.title || html`<span class="bc-untitled">Untitled</span>`}</div>`}</div>
    </div>`)}<div class="gal-new" role="button" onClick=${() => { rows.push({ id: uid(), title: '', created: NOW() }); commit(); }}><${Icon} n="plusSmall" cls="i16"/><span>New page</span></div></div></div>`;
}


/* ------------------------------------------------------------------ database list view (measured: 30px rows 2px apart, 22px icon box, 14px/500 title) */
const VIEW_ICON = { map: 'viewMap', table: 'viewTable', board: 'viewBoard', gallery: 'squareGrid2X2', list: 'listBullet', calendar: 'viewCalendar', timeline: 'viewTimeline', feed: 'newspaper', chart: 'viewChart', dashboard: 'viewDashboard', form: 'form' };
function ListView({ coll, view, rows }) {
  const ordered = viewRows(rows, coll, view);
  return html`<div class=${'nsp-list-view listv' + (view.hideIcon ? ' noicon' : '')}><div class="lv-items">${ordered.map((r) => html`<div class=${'lv-item' + (peekRow === r.id ? ' on' : '')} key=${r.id} role="button" onClick=${() => openRow(r)}><div class="lv-in"><div class="lv-ic"><${Icon} n="pageEmpty" cls="i18"/></div><div class="lv-title">${r.title || html`<span class="bc-untitled">Untitled</span>`}</div></div></div>`)}<div class="lv-new" role="button" onClick=${() => { rows.push({ id: uid(), title: '', created: NOW() }); commit(); }}><${Icon} n="plusSmall" cls="i16"/><span>New page</span></div></div></div>`;
}


/* ------------------------------------------------------------------ view settings sidebar (measured: 290px column, 78x56 layout tiles, toggles, blue Done) */
let viewSettings = null;
const VS_TYPES = [['table', 'viewTable', 'Table'], ['board', 'viewBoard', 'Board'], ['timeline', 'viewTimeline', 'Timeline'], ['calendar', 'viewCalendar', 'Calendar'], ['list', 'listBullet', 'List'], ['gallery', 'squareGrid2X2', 'Gallery'], ['chart', 'viewChart', 'Chart'], ['feed', 'newspaper', 'Feed'], ['map', 'viewMap', 'Map'], ['dashboard', 'viewDashboard', 'Dashboard']].filter(([t]) => READY.maps || t !== 'map');
function ViewSettings({ page, coll, vid }) {
  const vw = S.views[vid]; const [top, setTop] = useState(198.4);
  useLayoutEffect(() => { const bar = document.querySelector('.db-bar'); if (bar) { const t = bar.getBoundingClientRect().bottom; if (Math.abs(t - top) > 0.5) setTop(t); } });
  const type = vw.type || 'table';
  const set = (k, v) => { vw[k] = v; commit(); };
  // Closing the sidebar names an untouched new view after its layout ("Timeline", "Calendar").
  const close = () => { if (vw.name === 'New view') vw.name = (VS_TYPES.find((x) => x[0] === type) || [0, 0, 'Table'])[2]; viewSettings = null; commit(); };
  const toggleRow = (label, on, fn) => html`<div class="mi vs-row" role="menuitemcheckbox" onClick=${fn}><div class="mi-in"><div class="mi-label">${label}</div><span class=${'toggle' + (on ? ' on' : '')}></span></div></div>`;
  const valueRow = (label, val, fn) => html`<div class="mi vs-row" role="menuitem" onClick=${fn}><div class="mi-in"><div class="mi-label">${label}</div><div class="mi-val">${val}</div><div class="mi-chev"><${Icon} n="arrowChevronSingleRightSmall" cls="i16"/></div></div></div>`;
  const staticRow = (label, val) => html`<div class="mi vs-row static"><div class="mi-in"><div class="mi-label">${label}</div><div class="mi-val">${val}</div></div></div>`;
  const gp = vw.group_by && coll.schema[vw.group_by] ? vw.group_by : groupPropOf(coll);
  const sizes = { small: 'Small', medium: 'Medium', large: 'Large' };
  return html`<div class=${'nsp-view-settings-sidebar vs' + (type === 'chart' ? ' chart-first' : '')} style=${`top:${top}px`}>
    <div class="vs-head"><div class="vs-title">${vw.name || 'New view'}</div><div class="vs-x" role="button" onClick=${close}><${Icon} n="xMarkSmall" cls="i16"/></div></div>
    <div class="vs-name"><div class="vs-name-ic"><${Icon} n=${VIEW_ICON[type] || 'viewTable'} cls="i20"/></div><div class="bm-search-box vs-input"><input value=${vw.name === 'New view' ? '' : vw.name} placeholder="View name" onInput=${(e) => { vw.name = e.currentTarget.value || 'New view'; persist(); refresh(); }}/></div></div>
    <div class="vs-grid">${VS_TYPES.map(([t, ic, label]) => html`<div class=${'vs-tile' + (type === t ? ' on' : '')} role="button" onClick=${() => { vw.type = ['table', 'board', 'gallery', 'list', 'calendar', 'timeline', 'feed', 'chart', 'dashboard', 'form'].includes(t) ? t : 'table'; if (t === 'board' && !vw.group_by) vw.group_by = groupPropOf(coll); commit(); }}><${Icon} n=${ic} cls="i20"/><span>${label}</span></div>`)}</div>
    ${type === 'chart' ? '' : html`<div class="vs-group">
      ${type === 'table' ? toggleRow('Show vertical lines', vw.lines !== false, () => set('lines', vw.lines === false)) : ''}
      ${type === 'table' ? valueRow('Group', (coll.schema[vw.group_by] || {}).name || 'None', (e) => openOverlay('propPicker', e.currentTarget, { mode: 'groupBy', vid })) : ''}
      ${toggleRow('Show page icon', vw.hideIcon !== true, () => set('hideIcon', !vw.hideIcon))}
      ${type !== 'list' && type !== 'calendar' && type !== 'timeline' && type !== 'feed' ? toggleRow('Wrap all content', !!vw.wrapAll, () => set('wrapAll', !vw.wrapAll)) : ''}
      ${type === 'calendar' ? toggleRow('Wrap page titles', !!vw.wrapAll, () => set('wrapAll', !vw.wrapAll)) : ''}
      ${type === 'calendar' ? valueRow('Show calendar by', (coll.schema[vw.calendar_by || Object.keys(coll.schema).find((k) => coll.schema[k].type === 'date')] || {}).name || 'None', (e) => openOverlay('propPicker', e.currentTarget, { mode: 'calendarBy', vid })) : ''}
      ${type === 'calendar' ? staticRow('Show calendar as', 'Month') : ''}
      ${type === 'calendar' ? toggleRow('Show weekends', vw.weekends !== false, () => set('weekends', vw.weekends === false)) : ''}
      ${type === 'timeline' ? valueRow('Show timeline by', (coll.schema[datePropOf(vw, coll)] || {}).name || 'None', (e) => openOverlay('propPicker', e.currentTarget, { mode: 'timelineBy', vid })) : ''}
      ${type === 'timeline' ? toggleRow('Separate start and end dates', !!vw.separateDates, () => set('separateDates', !vw.separateDates)) : ''}
      ${type === 'timeline' ? toggleRow('Show table', !!vw.showTable, () => set('showTable', !vw.showTable)) : ''}
      ${type === 'feed' ? toggleRow('Wrap properties', !!vw.wrapProps, () => set('wrapProps', !vw.wrapProps)) : ''}
      ${type === 'feed' ? toggleRow('Show author byline', vw.byline !== false, () => set('byline', vw.byline === false)) : ''}
      ${type === 'board' ? valueRow('Group by', (coll.schema[gp] || {}).name || 'None', (e) => openOverlay('propPicker', e.currentTarget, { mode: 'groupBy', vid })) : ''}
      ${type === 'board' ? toggleRow('Color columns', vw.colorColumns !== false, () => set('colorColumns', vw.colorColumns === false)) : ''}
      ${type === 'feed' ? '' : valueRow('Open pages in', vw.openIn === 'page' ? 'Full page' : 'Side peek', () => set('openIn', vw.openIn === 'page' ? 'side' : 'page'))}
      ${type === 'feed' ? valueRow('Load limit', String(vw.loadLimit || 10), () => set('loadLimit', { 10: 25, 25: 50, 50: 100, 100: 10 }[vw.loadLimit || 10])) : ''}
      
      ${type === 'gallery' ? valueRow('Card size', sizes[vw.cardSize || 'medium'], () => set('cardSize', { small: 'medium', medium: 'large', large: 'small' }[vw.cardSize || 'medium'])) : ''}
    </div>`}
    <div class="vs-group vs-src-group"><div class="mi vs-row static"><div class="mi-in"><div class="mi-ic"><${Icon} n="pathRoundEnds" cls="i20"/></div><div class="mi-label vs-src">Source</div><div class="mi-val vs-src-val">${page.title}</div></div></div></div>
    ${type === 'chart' ? html`<div class="vs-done" role="button" onClick=${() => { viewSettings = { vid, chartEdit: true }; refresh(); }}>Edit chart</div>` : html`<div class="vs-done" role="button" onClick=${close}>Done</div>`}
  </div>`;
}


// Measured "Edit chart" sidebar: every block sits at the offset the live panel uses (rows 28px on a 29px pitch, 12px/500
// section heads, five 42px chart type buttons 50px apart with a 2px blue ring on the selected one).
function ChartSettings({ page, coll, vid }) {
  const vw = S.views[vid]; const [top, setTop] = useState(198.4);
  useLayoutEffect(() => { const bar = document.querySelector('.db-bar'); if (bar) { const t = bar.getBoundingClientRect().bottom; if (Math.abs(t - top) > 0.5) setTop(t); } });
  const set = (k, v) => { vw[k] = v; commit(); };
  const close = () => { viewSettings = null; refresh(); };
  const xp = chartProp(coll, vw); const groupable = Object.keys(coll.schema).filter((k) => ['multi_select', 'select', 'status'].includes(coll.schema[k].type));
  const SORTS = { manual: 'Manual', desc: 'Count descending', asc: 'Count ascending' };
  const row = (y, ic, label, val, fn, toggle) => !fn ? html`<div class="mi vs-row cs-abs static" style=${`top:${y}px`}><div class="mi-in"><div class="mi-ic"><${Icon} n=${ic} cls="i20"/></div><div class="mi-label">${label}</div>${val ? html`<div class="mi-val">${val}</div>` : ''}</div></div>` : html`<div class="mi vs-row cs-abs" role=${toggle ? 'menuitemcheckbox' : 'menuitem'} style=${`top:${y}px`} onClick=${fn}><div class="mi-in"><div class="mi-ic"><${Icon} n=${ic} cls="i20"/></div><div class="mi-label">${label}</div>${toggle ? html`<span class=${'toggle' + (val ? ' on' : '')}></span>` : html`${val ? html`<div class="mi-val">${val}</div>` : ''}<div class="mi-chev"><${Icon} n="arrowChevronSingleRightSmall" cls="i16"/></div>`}</div></div>`;
  const head = (y, label) => html`<div class="cs-head" style=${`top:${y}px`}>${label}</div>`;
  return html`<div class="nsp-view-settings-sidebar vs cs" style=${`top:${top}px`}>
    <div class="vs-head"><div class="vs-title">View settings</div><div class="vs-x" role="button" onClick=${close}><${Icon} n="xMarkSmall" cls="i16"/></div></div>
    <div class="vs-name"><div class="vs-name-ic"><${Icon} n="viewChart" cls="i20"/></div><div class="bm-search-box vs-input"><input value=${vw.name} placeholder="View name" onInput=${(e) => { vw.name = e.currentTarget.value || 'Chart'; persist(); refresh(); }}/><span class="cs-info"><${Icon} n="infoCircleFill" cls="i16"/></span></div></div>
    ${row(86, 'viewChart', 'Layout', 'Chart', () => { viewSettings = { vid }; refresh(); })}
    ${head(136.2, 'Chart type')}
    <div class="cs-types" style="top:159.9px">${CHART_TYPES.map(([k, ic, label]) => html`<div class=${'cs-type' + ((vw.chartType || 'bar') === k ? ' on' : '')} role="button" aria-label=${label} onClick=${() => set('chartType', k)}><${Icon} n=${ic} cls="i22"/></div>`)}</div>
    ${head(218.1, 'X axis')}
    ${row(241.8, 'arrowTurnDownRight', 'What to show', (coll.schema[xp] || {}).name || 'None', () => { if (!groupable.length) return; const i = groupable.indexOf(xp); set('chartX', groupable[(i + 1) % groupable.length]); })}
    ${row(270.8, 'arrowUpDown', 'Sort by', SORTS[vw.chartSort || 'manual'], () => set('chartSort', { manual: 'desc', desc: 'asc', asc: 'manual' }[vw.chartSort || 'manual']))}
    ${row(299.8, 'eyeSlash', 'Omit zero values', !!vw.omitZero, () => set('omitZero', !vw.omitZero), true)}
    ${head(342, 'Y axis')}
    ${row(365.7, 'arrowTurnLeftUp', 'What to show', 'Count', null)}
    ${row(394.7, 'rectangleSplit2Vertical', 'Group by', 'None', null)}
    ${row(423.7, 'arrowUpDownStacked', 'Range', 'Auto', null)}
    ${row(452.7, 'dottedLineHorizontal', 'Reference line', '0 lines', null)}
    ${head(494.9, 'Style')}
    ${row(518.6, 'paintPalette', 'Color', 'Auto', null)}
    ${row(547.6, 'paintBrush', 'More style options', '', null)}
    ${row(592.6, 'pathRoundEnds', 'Source', page.title, null)}
    ${row(621.6, 'filter', 'Filter', '', () => openOverlay('propPicker', document.querySelector('.nsp-collection-filter'), { mode: 'filter' }))}
    ${row(666.6, 'arrowLineDown', 'Save chart as…', '', null)}
    <div class="mi vs-row cs-abs" role="menuitem" style="top:695.6px" onClick=${() => { try { navigator.clipboard.writeText(location.href); } catch (e) {} close(); }}><div class="mi-in"><div class="mi-ic"><${Icon} n="link" cls="i20"/></div><div class="mi-label">Copy link to view</div></div></div>
    ${row(740.6, 'collection', 'Manage data sources', '', null)}
    <div class="cs-spacer"></div>
  </div>`;
}
/* ------------------------------------------------------------------ database form view */
// Measured on a live form builder: a 600px column centred in the frame; Form icon and Form cover 32px down, a 40px
// title, a 16px description, a 48px access bar, 120px question cards (12px padding, 12px corners) 24px apart, and a
// round tinted add button 12px under the last card. New forms first ask whether to turn properties into questions.
const FORM_TYPES = ['status', 'select', 'multi_select', 'date', 'number', 'text', 'url', 'email', 'phone_number', 'person', 'checkbox', 'file', 'files'];
const formExtra = (coll) => Object.keys(coll.schema).filter((k) => FORM_TYPES.includes(coll.schema[k].type));
const titleKey = (coll) => Object.keys(coll.schema).find((k) => coll.schema[k].type === 'title');
const FORM_PH = { checkbox: 'Checkbox', date: 'Select a date', select: 'Select an option', status: 'Select an option', multi_select: 'Select options', person: 'Select people', files: 'Upload files' };
// A form is its builder for people who can edit the database and the form itself for everyone else, and for editors
// who preview it. A response goes through ws_submit_form, so someone who may only read the database can still answer.
const formPreview = new Set();
function FormView({ coll, view }) {
  const ctx = dbCtx();
  const form = (view.form = view.form || { title: '', description: '', questions: [titleKey(coll)] });
  const names = (form.names = form.names || {});
  const questions = form.questions.filter((k) => coll.schema[k]);
  const canEdit = !ctx || space.canEdit(ctx.page.id);
  if (!canEdit || formPreview.has(view.id)) return html`<${FormFill} coll=${coll} view=${view} form=${form} names=${names} questions=${questions} preview=${canEdit}/>`;
  return html`<div class="nsp-form-view formv"><div class="fv-col">
    <div class="fv-controls"></div>
    <h1 class="fv-title" contenteditable="true" data-ph="Form title" onInput=${(e) => { form.title = e.currentTarget.textContent; persist(); }}>${form.title}</h1>
    <div class="fv-desc" contenteditable="true" data-ph="Description (optional)" onInput=${(e) => { form.description = e.currentTarget.textContent; persist(); }}>${form.description}</div>
    <div class="fv-access"><${Icon} n="lockSmall" cls="i16"/><span class="fv-access-t">Anyone who can open this database can fill out this form.</span></div>
    ${questions.map((k) => html`<div class="fv-q" key=${k}>
      <div class="fv-q-name" contenteditable="true" data-ph="Question name" onInput=${(e) => { names[k] = e.currentTarget.textContent; persist(); }}>${names[k] !== undefined ? names[k] : coll.schema[k].name}</div>
      <div class="fv-answer"><input placeholder=${FORM_PH[coll.schema[k].type] || 'Respondent’s answer'} disabled/></div>
    </div>`)}
  </div></div>`;
}
function FormFill({ coll, view, form, names, questions, preview }) {
  const [answers, setAnswers] = useState({});
  const [state, setState] = useState('open');
  const set = (k, v) => setAnswers((cur) => { const next = { ...cur }; if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) delete next[k]; else next[k] = v; return next; });
  const submit = async () => {
    setState('sending');
    try {
      await space.submitForm(view.id, answers);
      setAnswers({});
      setState('sent');
    } catch (err) {
      setState('open');
      showToast({ warn: true, text: (err && err.message) || 'That response could not be sent. Try again.' });
    }
  };
  const label = (k) => (names[k] !== undefined && names[k] !== '' ? names[k] : coll.schema[k].name);
  if (state === 'sent') return html`<div class="nsp-form-view formv fv-filling"><div class="fv-col"><h1 class="fv-title">${form.title || 'Form'}</h1><div class="fv-done">Your response was recorded.</div><div class="fv-submit" role="button" onClick=${() => setState('open')}>Submit another response</div></div></div>`;
  const input = (k) => {
    const p = coll.schema[k]; const v = answers[k];
    if (p.type === 'select' || p.type === 'status') return html`<div class="fv-opts">${(p.options || []).map((o) => html`<div class=${'fv-opt' + (v === o.value ? ' on' : '')} role="button" aria-pressed=${v === o.value ? 'true' : 'false'} onClick=${() => set(k, v === o.value ? undefined : o.value)}><${SePill} o=${o}/></div>`)}</div>`;
    if (p.type === 'multi_select') { const cur = Array.isArray(v) ? v : []; return html`<div class="fv-opts">${(p.options || []).map((o) => html`<div class=${'fv-opt' + (cur.includes(o.value) ? ' on' : '')} role="button" aria-pressed=${cur.includes(o.value) ? 'true' : 'false'} onClick=${() => set(k, cur.includes(o.value) ? cur.filter((x) => x !== o.value) : [...cur, o.value])}><${SePill} o=${o}/></div>`)}</div>`; }
    if (p.type === 'checkbox') return html`<div class=${'cb fv-cb' + (v ? ' on' : '')} role="checkbox" aria-checked=${v ? 'true' : 'false'} onClick=${() => set(k, v ? undefined : true)}>${v ? html`<${Icon} n="checkmarkFillSmall" cls="tick"/>` : ''}</div>`;
    if (p.type === 'person') { const cur = Array.isArray(v) ? v : []; const people = [{ id: space.me.id, name: space.me.name }, ...[...space.people.values()].filter((x) => x.id !== space.me.id)]; return html`<div class="fv-opts">${people.map((x) => html`<div class=${'fv-opt fv-person' + (cur.includes(x.id) ? ' on' : '')} role="button" aria-pressed=${cur.includes(x.id) ? 'true' : 'false'} onClick=${() => set(k, cur.includes(x.id) ? cur.filter((y) => y !== x.id) : [...cur, x.id])}><img src=${space.avatar(x.id)} alt=""/><span>${x.name}</span></div>`)}</div>`; }
    if (p.type === 'files' || p.type === 'file') return html`<div class="fv-note">This question takes files, which a form cannot collect yet.</div>`;
    const type = { date: 'date', number: 'number', email: 'email', url: 'url', phone_number: 'tel' }[p.type] || 'text';
    return html`<div class="fv-answer"><input type=${type} aria-label=${label(k)} placeholder=${FORM_PH[p.type] || 'Your answer'} value=${v ?? ''} onInput=${(e) => set(k, e.currentTarget.value)}/></div>`;
  };
  return html`<div class="nsp-form-view formv fv-filling"><div class="fv-col">
    ${preview ? html`<div class="fv-note fv-preview-note">Preview. A response you submit here is recorded like anyone else's.</div>` : ''}
    <h1 class="fv-title">${form.title || 'Form'}</h1>
    ${form.description ? html`<div class="fv-desc">${form.description}</div>` : ''}
    ${questions.map((k) => html`<div class="fv-q" key=${k}><div class="fv-q-name">${label(k)}</div>${input(k)}</div>`)}
    <div class=${'fv-submit' + (state === 'sending' ? ' busy' : '')} role="button" onClick=${state === 'sending' ? undefined : submit}>${state === 'sending' ? 'Sending…' : 'Submit'}</div>
  </div></div>`;
}
function FormSetup({ data }) {
  const vw = S.views[data.vid]; const ctx = dbCtx(); if (!vw || !ctx) return null;
  const extra = formExtra(ctx.coll);
  const done = (all) => { vw.form = { title: '', description: '', questions: [titleKey(ctx.coll), ...(all ? extra : [])] }; closeOverlay(); commit(); };
  return html`<div class="menu form-setup" role="dialog">
    <div class="fs-art"><${Icon} n="viewTable" cls="i36"/><${Icon} n="arrowStraightUpFillSmall" cls="i24 fs-right"/><${Icon} n="form" cls="i36"/></div>
    <div class="fs-title">Auto-create form questions based on existing properties?</div>
    <div class="fs-sub">Only supported property types will create new questions.</div>
    <div class="fs-btns"><div class="fs-primary" role="button" onClick=${() => done(true)}>Create ${extra.length} questions</div><div class="fs-secondary" role="button" onClick=${() => done(false)}>Start from scratch</div></div>
  </div>`;
}

/* ------------------------------------------------------------------ database dashboard view */
function DashboardView() {
  return html`<div class="nsp-dashboard-view dash">
    <div class="dash-h">Dashboards are on the way</div>
    <div class="dash-sub">Charts, tables and lists from several databases on one page. Until then, a Chart view shows one database at a glance.</div>
  </div>`;
}

/* ------------------------------------------------------------------ database chart view */
// Measured on a live chart: a 400px area inside the view's 8px/104px padding; the plot starts 26px in (y labels), 20px
// down, stops 10px short of the right edge and 37px above the bottom (x labels). Bars are 16px with 2px rounded tops,
// centred in equal bands; grid lines are dotted; labels are 12px, values sit 18px above each bar.
const CH = { h: 400, l: 26, t: 20, r: 10, b: 37 };
const CHART_TYPES = [['bar', 'chartBarXAxis', 'Vertical bar'], ['hbar', 'chartBarYAxis', 'Horizontal bar'], ['line', 'chartLine', 'Line'], ['donut', 'donutChart', 'Donut'], ['number', 'number', 'Number']];
const chartProp = (coll, view) => {
  if (view.chartX && coll.schema[view.chartX]) return view.chartX;
  const keys = Object.keys(coll.schema);
  return keys.find((k) => coll.schema[k].type === 'multi_select') || keys.find((k) => coll.schema[k].type === 'select') || keys.find((k) => coll.schema[k].type === 'status');
};
const chartColor = (o) => (OPT[(o && o.color) || 'default'] || OPT.default)[2];
function chartSeries(coll, view, rows) {
  const xp = chartProp(coll, view); if (!xp) return { xp, cats: [] };
  const prop = coll.schema[xp]; const counts = new Map((prop.options || []).map((o) => [o.value, 0])); let none = 0;
  rows.forEach((r) => { const v = r[xp]; const vals = Array.isArray(v) ? v : v ? [v] : []; if (!vals.length) none++; vals.forEach((x) => counts.set(x, (counts.get(x) || 0) + 1)); });
  let cats = [...counts.entries()].map(([name, n]) => ({ name, n, color: chartColor((prop.options || []).find((o) => o.value === name)) }));
  cats.push({ name: `No ${prop.name}`, n: none, color: 'var(--ca-graBacSecTra)' });
  if (view.chartSort === 'desc') cats.sort((a, b) => b.n - a.n); else if (view.chartSort === 'asc') cats.sort((a, b) => a.n - b.n);
  if (view.omitZero) cats = cats.filter((c) => c.n > 0);
  return { xp, cats };
}
// Highcharts-style ticks: about one tick per 72px, snapped to 1, 2, 2.5 or 5 times a power of ten, with 5% headroom.
function chartTicks(max, len) {
  const target = Math.max(max * 1.05, 1); const rough = target / Math.max(1, Math.floor(len / 72));
  const mag = Math.pow(10, Math.floor(Math.log10(rough))); const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= rough - 1e-9);
  const top = Math.ceil(target / step - 1e-9) * step; const ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { top, ticks };
}
const barPath = (x0, x1, yTop, y0) => (y0 - yTop < 2 ? `M${x0} ${y0}L${x1} ${y0}Z` : `M${x0} ${yTop + 2}A2 2 0 0 1 ${x0 + 2} ${yTop}L${x1 - 2} ${yTop}A2 2 0 0 1 ${x1} ${yTop + 2}L${x1} ${y0}L${x0} ${y0}Z`);
function ChartView({ coll, view, rows }) {
  const ref = useRef(null); const [w, setW] = useState(992);
  useLayoutEffect(() => { const el = ref.current; if (el && el.clientWidth && Math.abs(el.clientWidth - w) > 0.5) setW(el.clientWidth); });
  const shownRows = viewRows(rows, coll, view); const { cats } = chartSeries(coll, view, shownRows);
  const type = view.chartType || 'bar';
  const plotW = Math.max(40, w - CH.l - CH.r); const plotH = CH.h - CH.t - CH.b; const base = CH.t + plotH;
  const max = Math.max(0, ...cats.map((c) => c.n));
  let body;
  if (type === 'number') body = html`<div class="ch-number">${shownRows.length}</div>`;
  else if (type === 'donut') {
    const total = cats.reduce((s, c) => s + c.n, 0) || 1; const cx = w / 2; const cy = CH.h / 2; const R = 140; const r0 = 90; let a = -Math.PI / 2;
    const arcs = cats.filter((c) => c.n > 0).map((c) => { const a1 = a + (c.n / total) * Math.PI * 2 - 1e-6; const big = a1 - a > Math.PI ? 1 : 0; const p = (rad, ang) => `${cx + rad * Math.cos(ang)} ${cy + rad * Math.sin(ang)}`; const d = `M${p(R, a)}A${R} ${R} 0 ${big} 1 ${p(R, a1)}L${p(r0, a1)}A${r0} ${r0} 0 ${big} 0 ${p(r0, a)}Z`; a = a1; return html`<path d=${d} style=${'fill:' + c.color}/>`; });
    body = html`<svg class="ch-svg" width=${w} height=${CH.h}>${arcs}<text class="ch-total" x=${cx} y=${cy + 10} text-anchor="middle">${total}</text></svg>`;
  } else if (type === 'hbar') {
    const L = 90; const pw = Math.max(40, w - L - CH.r); const { top, ticks } = chartTicks(max, pw); const band = plotH / Math.max(1, cats.length); const xOf = (v) => L + (v / top) * pw;
    body = html`<svg class="ch-svg" width=${w} height=${CH.h}>
      ${ticks.map((v) => html`<line class="ch-grid" x1=${xOf(v) + 0.5} x2=${xOf(v) + 0.5} y1=${CH.t} y2=${base}/><text class="ch-lbl" x=${xOf(v)} y=${base + 19.5} text-anchor="middle">${v}</text>`)}
      ${cats.map((c, i) => { const cy = CH.t + band * (i + 0.5); return html`<g><text class="ch-lbl" x=${L - 8} y=${cy + 4} text-anchor="end">${c.name}</text><rect x=${L} y=${cy - 8} width=${Math.max(0, xOf(c.n) - L)} height="16" rx="2" style=${'fill:' + c.color}/><text class="ch-val" x=${xOf(c.n) + 6} y=${cy + 4}>${c.n}</text></g>`; })}
    </svg>`;
  } else {
    const { top, ticks } = chartTicks(max, plotH); const band = plotW / Math.max(1, cats.length);
    const yOf = (v) => { const py = Math.round(plotH - (v / top) * plotH); return CH.t + (py === 0 ? -0.5 : py + 0.5); };
    const pts = cats.map((c, i) => [CH.l + band * (i + 0.5), yOf(c.n)]);
    body = html`<svg class="ch-svg" width=${w} height=${CH.h}>
      ${ticks.map((v) => html`<line class=${v === 0 ? 'ch-axis' : 'ch-grid'} x1=${CH.l} x2=${CH.l + plotW} y1=${yOf(v)} y2=${yOf(v)}/><text class="ch-lbl" x=${CH.l - 8} y=${Math.round(yOf(v)) + (yOf(v) < CH.t ? 5 : 4)} text-anchor="end">${v}</text>`)}
      ${type === 'line' ? html`<polyline class="ch-line" points=${pts.map((p) => p.join(',')).join(' ')}/>${pts.map(([x, y], i) => html`<circle cx=${x} cy=${y} r="4" style=${'fill:' + cats[i].color}/>`)}` : cats.map((c, i) => { const cx = CH.l + band * (i + 0.5); return html`<path d=${barPath(cx - 8, cx + 8, yOf(c.n), CH.t + plotH + 0.5)} style=${'fill:' + c.color}/>`; })}
      ${cats.map((c, i) => html`<text class="ch-val" x=${pts[i][0]} y=${pts[i][1] - 6.5} text-anchor="middle">${c.n}</text><text class="ch-lbl" x=${pts[i][0]} y=${base + 20} text-anchor="middle">${c.name}</text>`)}
    </svg>`;
  }
  return html`<div class="nsp-chart-view chart"><div class="ch-area" ref=${ref}>${body}</div></div>`;
}

/* ------------------------------------------------------------------ database feed view */
// Measured on a live feed: 752px cards centred in the frame, 200px apart when empty, 16px padding, 12px corners;
// a 24px avatar byline with a 12px age, a 26px title indented 32px, then a reaction button and a comment box.
const ageShort = (ms) => { const m = Math.max(1, Math.floor((NOW() - (ms || NOW())) / 60000)); if (m < 60) return m + 'm'; const h = Math.floor(m / 60); if (h < 24) return h + 'h'; return Math.floor(h / 24) + 'd'; };
function FeedComment({ r }) {
  const [txt, setTxt] = useState('');
  const ref = useRef(null);
  const send = () => { const t = (ref.current ? ref.current.innerText : '').trim(); if (!t) return; r.comments = [...(r.comments || []), { id: uid(), author: space.me.name, authorId: space.me.id, text: t, time: NOW() }]; if (ref.current) ref.current.textContent = ''; setTxt(''); commit(); };
  const avatar = html`<div class="pd-avatar"><img src=${space.avatar()} alt=""/></div>`;
  return html`<div class="feed-comments">
    ${(r.comments || []).map((c) => html`<div class="feed-posted"><div class="pd-avatar"><img src=${space.avatar(c.authorId)} alt=""/></div><div class="pd-body"><div class="pd-meta"><span class="pd-name">${c.author}</span><span class="pd-time">${relTime(c.time)}</span></div><div class="pd-text">${c.text}</div></div></div>`)}
    <div class="feed-comment">${avatar}<div class="pd-box"><div class="pd-edit-wrap"><div class="pd-edit" ref=${ref} contenteditable="true" data-ph="Add a comment…" onInput=${(e) => setTxt(e.currentTarget.textContent)} onKeyDown=${(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}></div></div><div class="pd-btns"><div class="pd-btn" role="button" aria-label="Attach file"><${Icon} n="paperClip" cls="i20"/></div><div class="pd-btn" role="button" aria-label="Mention a person, page, or date"><${Icon} n="at" cls="i20"/></div><div class=${'pd-btn send' + (txt.trim() ? ' on' : '')} role="button" aria-label="Send comment" onMouseDown=${(e) => e.preventDefault()} onClick=${send}><${Icon} n="arrowInCircleUpFill" cls="i24"/></div></div></div></div>
  </div>`;
}
function FeedView({ coll, view, rows }) {
  const ordered = viewRows(rows, coll, view).slice(0, view.loadLimit || 10);
  return html`<div class="nsp-feed-view feed">${ordered.map((r) => html`<div class=${'feed-card' + (peekRow === r.id ? ' on' : '')} key=${r.id}>
    ${view.byline === false ? '' : html`<div class="feed-byline"><img class="feed-av" src=${space.avatar((space.sync.metaOf(r.id) || {}).created_by)} alt=""/><span class="feed-author">${space.personName((space.sync.metaOf(r.id) || {}).created_by || space.me.id)}</span><span class="feed-time">${ageShort(r.created)}</span></div>`}
    
    <div class="feed-title" role="button" onClick=${() => openRow(r)}>${r.title || html`<span class="bc-untitled">Untitled</span>`}</div>
    <div class="feed-foot"><${FeedComment} r=${r}/></div>
  </div>`)}</div>`;
}

/* ------------------------------------------------------------------ database timeline view */
// Measured on a live timeline: 40px days, a 36px month row over a 32px day row, 36px item rows, 34px cards starting 2px
// into their first day and 3px short of their last, titles spilling past the card, weekends shaded, a red now line.
const TL_DAY = 40; const TL_BACK = 118; const TL_SPAN = 237;
const datePropOf = (view, coll) => { const k = view.timeline_by || view.calendar_by; return k && coll.schema[k] ? k : Object.keys(coll.schema).find((x) => coll.schema[x].type === 'date'); };
const shiftIso = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDate(d); };
function TimelineView({ coll, view, rows }) {
  const ref = useRef(null);
  const dp = datePropOf(view, coll);
  const today = new Date(NOW()); today.setHours(0, 0, 0, 0);
  const start = new Date(today); start.setDate(start.getDate() - TL_BACK);
  const startIso = isoDate(start);
  const ix = (iso) => Math.round((new Date(iso + 'T12:00:00') - new Date(startIso + 'T12:00:00')) / 86400000);
  const scroller = () => ref.current && ref.current.closest('.nsp-scroller');
  const xOf = (i) => { const sc = scroller(); const el = ref.current; return el.getBoundingClientRect().left - sc.getBoundingClientRect().left + sc.scrollLeft + i * TL_DAY; };
  // A timeline opens with today's column 565.9px into the frame.
  useLayoutEffect(() => { const sc = scroller(); if (sc && ref.current) sc.scrollLeft = xOf(TL_BACK) - 565.9; }, [view.id]);
  if (!dp) return html`<div class="lib-empty">Add a Date property to use a timeline.</div>`;
  const dated = viewRows(rows, coll, view).filter((r) => r[dp]);
  const days = Array.from({ length: TL_SPAN }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; });
  const H = (dated.length + 1) * 36;
  const nowX = (TL_BACK + (NOW() - today.getTime()) / 86400000) * TL_DAY;
  const go = (left) => { const sc = scroller(); if (sc) sc.scrollTo({ left, behavior: 'smooth' }); };
  return html`<div class="nsp-timeline-view tl" ref=${ref} style=${`width:${TL_SPAN * TL_DAY}px`}>
    <div class="tl-head">
      <div class="tl-bar"><div class="tl-open" role="button" aria-label="Show table" onClick=${() => { view.showTable = !view.showTable; commit(); }}><${Icon} n="arrowChevronDoubleBackward" cls="i16 flipx"/></div>
        <div class="tl-tools"><div class="cal-manage" role="button" onClick=${() => space.openApp('/calendar')}><${Icon} n="calendarDate10" cls="i16"/><span>Open Calendar</span></div><div class="cal-nav" role="button" onClick=${() => { const sc = scroller(); if (sc) go(sc.scrollLeft - 30 * TL_DAY); }}><${Icon} n="arrowChevronSingleRightSmall" cls="i20 flipx"/></div><div class="cal-today" role="button" onClick=${() => go(xOf(TL_BACK) - 565.9)}>Today</div><div class="cal-nav" role="button" onClick=${() => { const sc = scroller(); if (sc) go(sc.scrollLeft + 30 * TL_DAY); }}><${Icon} n="arrowChevronSingleRightSmall" cls="i20"/></div></div></div>
      <div class="tl-months">${days.map((d, i) => (d.getDate() === 1 ? html`<div class="tl-month" style=${`left:${i * TL_DAY}px`}>${d.toLocaleDateString('en-US', { month: 'long' })}</div>` : ''))}</div>
      <div class="tl-days">${days.map((d, i) => html`<div class="tl-day" style=${`left:${i * TL_DAY}px`}>${i === TL_BACK ? html`<span class="tl-today">${d.getDate()}</span>` : d.getDate()}</div>`)}</div>
    </div>
    <div class="tl-body" style=${`height:${H + 28}px`}>
      ${days.map((d, i) => (d.getDay() === 6 ? html`<div class="tl-wkend" style=${`left:${i * TL_DAY}px`}></div>` : ''))}
      <div class="tl-now" style=${`left:${nowX}px`}><i></i></div>
      ${dated.map((r, ri) => { const s = ix(r[dp]); const e = r[dp + '_end'] ? Math.max(s, ix(r[dp + '_end'])) : s; const left = s * TL_DAY + 2; const w = (e - s + 1) * TL_DAY - 3; return html`<div class="nsp-timeline-item-row tl-row" key=${r.id} style=${`top:${ri * 36}px`}>
        <div class=${'nsp-timeline-item tl-item' + (peekRow === r.id ? ' on' : '')} style=${`left:${left}px;width:${w}px`} onMouseDown=${(ev) => tlDragDown(ev, r, dp, 'move')}><div class="nsp-timeline-item-resizer-left tl-rs l" onMouseDown=${(ev) => tlDragDown(ev, r, dp, 'left')}></div><div class="nsp-timeline-item-resizer-right tl-rs r" onMouseDown=${(ev) => tlDragDown(ev, r, dp, 'right')}></div></div>
        <div class="nsp-timeline-item-properties tl-label" style=${`left:${left}px`}>${r.title || 'Untitled'}</div>
      </div>`; })}
      <div class="tl-row tl-newrow" style=${`top:${dated.length * 36}px`}><div class="tl-new" role="button" onClick=${() => { rows.push({ id: uid(), title: '', created: NOW(), [dp]: isoDate(today) }); commit(); }}><${Icon} n="plusSmall" cls="i16"/><span>New</span></div></div>
    </div>
  </div>`;
}
function tlDragDown(e, r, dp, mode) {
  if (e.button !== 0) return; e.preventDefault(); e.stopPropagation();
  const sx = e.clientX; let moved = false; let last = 0;
  const s0 = r[dp]; const e0 = r[dp + '_end'] || null;
  const onMove = (ev) => {
    const dx = ev.clientX - sx; if (!moved && Math.abs(dx) < 4) return; moved = true;
    const n = Math.round(dx / TL_DAY); if (n === last) return; last = n;
    if (mode === 'move') { r[dp] = shiftIso(s0, n); if (e0) r[dp + '_end'] = shiftIso(e0, n); }
    else if (mode === 'left') { const end = e0 || s0; const ns = shiftIso(s0, n); if (ns <= end) { r[dp] = ns; r[dp + '_end'] = ns === end ? undefined : end; } }
    else { const ne = shiftIso(e0 || s0, n); if (ne >= s0) r[dp + '_end'] = ne === s0 ? undefined : ne; }
    refresh();
  };
  const onUp = () => {
    removeEventListener('mousemove', onMove, true); removeEventListener('mouseup', onUp, true);
    if (!moved) { if (mode === 'move') openRow(r); return; }
    r.edited = NOW(); commit();
  };
  addEventListener('mousemove', onMove, true); addEventListener('mouseup', onUp, true);
}

/* ------------------------------------------------------------------ database calendar view (measured: 991px month grid, 124px weeks, 24px day row, cards 4px inset) */
function CalendarView({ coll, view, rows }) {
  const dp = view.calendar_by && coll.schema[view.calendar_by] ? view.calendar_by : Object.keys(coll.schema).find((k) => coll.schema[k].type === 'date');
  if (!dp) return html`<div class="lib-empty">Add a Date property to use a calendar.</div>`;
  const today = new Date(NOW()); const todayIso = isoDate(today);
  const base = view.calMonth ? new Date(view.calMonth + '-01T12:00:00') : new Date(today.getFullYear(), today.getMonth(), 1);
  const y = base.getFullYear(); const m = base.getMonth();
  const first = new Date(y, m, 1); const start = new Date(y, m, 1 - first.getDay());
  const days = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const weekends = view.weekends !== false;
  const byDay = {}; viewRows(rows, coll, view).forEach((r) => { if (r[dp]) (byDay[r[dp]] = byDay[r[dp]] || []).push(r); });
  const setMonth = (d) => { view.calMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; commit(); };
  const label = (d) => (d.getDate() === 1 ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : String(d.getDate()));
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const keep = (i) => weekends || (i !== 0 && i !== 6);
  return html`<div class=${'nsp-calendar-view cal' + (weekends ? '' : ' noweekends') + (view.wrapAll ? ' wrap' : '')}>
    <div class="cal-head"><div class="cal-month">${base.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div><div class="cal-tools"><div class="cal-manage" role="button" onClick=${() => space.openApp('/calendar')}><${Icon} n="calendarDate10" cls="i16"/><span>Open Calendar</span></div><div class="cal-nav" role="button" onClick=${() => setMonth(new Date(y, m - 1, 1))}><${Icon} n="arrowChevronSingleRightSmall" cls="i20 flipx"/></div><div class="cal-today" role="button" onClick=${() => { delete view.calMonth; commit(); }}>Today</div><div class="cal-nav" role="button" onClick=${() => setMonth(new Date(y, m + 1, 1))}><${Icon} n="arrowChevronSingleRightSmall" cls="i20"/></div></div></div>
    <div class="nsp-calendar-header-days cal-days">${names.map((d, i) => (keep(i) ? html`<div>${d}</div>` : ''))}</div>
    <div class="cal-grid">${[0, 1, 2, 3, 4, 5].map((w) => html`<div class="cal-week">${days.slice(w * 7, w * 7 + 7).map((d, di) => { if (!keep(di)) return ''; const iso = isoDate(d); const items = byDay[iso] || []; return html`<div class=${'cal-cell' + (d.getMonth() !== m ? ' out' : '') + (di === 0 || di === 6 ? ' wkend' : '')} data-date=${iso}>
        <div class="cal-add" role="button" onClick=${() => { rows.push({ id: uid(), title: '', created: NOW(), [dp]: iso }); commit(); }}><${Icon} n="plusSmall" cls="i16"/></div>
        <div class=${'cal-num' + (iso === todayIso ? ' today' : '')}>${label(d)}</div>
        <div class="cal-items">${items.map((r) => html`<div class=${'cal-card' + (peekRow === r.id ? ' on' : '')} key=${r.id} onMouseDown=${(e) => calDragDown(e, r, dp)}>${r.title || 'Untitled'}</div>`)}</div>
      </div>`; })}</div>`)}</div>
  </div>`;
}
function calDragDown(e, r, dp) {
  if (e.button !== 0) return; e.preventDefault();
  const card = e.currentTarget; const sx = e.clientX; const sy = e.clientY; let moved = false; let ghost = null; let over = null; let dx = 0; let dy = 0;
  const onMove = (ev) => {
    if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
    if (!moved) { moved = true; const cr = card.getBoundingClientRect(); dx = sx - cr.left; dy = sy - cr.top; ghost = card.cloneNode(true); ghost.classList.add('card-ghost'); Object.assign(ghost.style, { left: cr.left + 'px', top: cr.top + 'px', width: cr.width + 'px' }); space.root.append(ghost); card.classList.add('dragging'); document.body.style.cursor = 'grabbing'; }
    ghost.style.left = ev.clientX - dx + 'px'; ghost.style.top = ev.clientY - dy + 'px';
    const cell = [...document.querySelectorAll('.cal-cell')].find((c) => { const b = c.getBoundingClientRect(); return ev.clientX >= b.left && ev.clientX < b.right && ev.clientY >= b.top && ev.clientY < b.bottom; }) || null;
    if (over && over !== cell) over.classList.remove('drop');
    over = cell; if (over) over.classList.add('drop');
  };
  const onUp = () => {
    removeEventListener('mousemove', onMove, true); removeEventListener('mouseup', onUp, true);
    if (!moved) { openRow(r); return; }
    ghost.remove(); card.classList.remove('dragging'); document.body.style.cursor = '';
    if (over) { over.classList.remove('drop'); r[dp] = over.dataset.date; r.edited = NOW(); commit(); }
  };
  addEventListener('mousemove', onMove, true); addEventListener('mouseup', onUp, true);
}

function cardDragDown(e, rows, r, gp) {
  if (e.button !== 0) return; e.preventDefault();
  const card = e.currentTarget; const sx = e.clientX; const sy = e.clientY; let moved = false; let ghost = null; let line = null; let target = null; let dx = 0; let dy = 0;
  const onMove = (ev) => {
    if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
    if (!moved) { moved = true; const cr = card.getBoundingClientRect(); dx = sx - cr.left; dy = sy - cr.top; ghost = card.cloneNode(true); ghost.classList.add('card-ghost'); Object.assign(ghost.style, { left: cr.left + 'px', top: cr.top + 'px', width: cr.width + 'px' }); line = document.createElement('div'); line.className = 'board-drop'; line.style.display = 'none'; space.root.append(ghost, line); card.classList.add('dragging'); document.body.style.cursor = 'grabbing'; }
    ghost.style.left = ev.clientX - dx + 'px'; ghost.style.top = ev.clientY - dy + 'px';
    const col = [...document.querySelectorAll('.board-col')].find((c) => { const b = c.getBoundingClientRect(); return ev.clientX >= b.left && ev.clientX < b.right; });
    if (!col) { line.style.display = 'none'; target = null; return; }
    const cards = [...col.querySelectorAll('.board-card')].filter((c) => c !== card);
    const after = cards.find((c) => { const b = c.getBoundingClientRect(); return ev.clientY < b.top + b.height / 2; });
    const cb = col.querySelector('.board-cards').getBoundingClientRect();
    const y = after ? after.getBoundingClientRect().top - 4 : (cards.length ? cards[cards.length - 1].getBoundingClientRect().bottom + 3 : cb.top + 2);
    target = { group: col.dataset.group || null, before: after ? after.dataset.rowId : null };
    Object.assign(line.style, { display: 'block', left: cb.left + 'px', width: cb.width + 'px', top: y + 'px' });
  };
  const onUp = () => {
    removeEventListener('mousemove', onMove, true); removeEventListener('mouseup', onUp, true);
    if (!moved) { openRow(r); return; }
    ghost.remove(); line.remove(); card.classList.remove('dragging'); document.body.style.cursor = '';
    if (!target) return;
    r[gp] = target.group || undefined; r.edited = NOW();
    rows.splice(rows.indexOf(r), 1);
    if (target.before) rows.splice(rows.findIndex((x) => x.id === target.before), 0, r); else { const lastInGroup = rows.map((x, i) => [x, i]).filter(([x]) => (x[gp] || null) === target.group).pop(); rows.splice(lastInGroup ? lastInGroup[1] + 1 : rows.length, 0, r); }
    commit();
  };
  addEventListener('mousemove', onMove, true); addEventListener('mouseup', onUp, true);
}

function Overlay() {
  useStore();
  if (!overlay) return null;
  const body = overlay.kind === 'noPlace' ? html`<${NoPlaceMenu}/>` : overlay.kind === 'gsMore' ? html`<${GetStartedMore}/>` : overlay.kind === 'workspace' ? html`<${WorkspaceMenu}/>` : overlay.kind === 'rowMenu' ? html`<${RowMenu} data=${overlay.data}/>` : overlay.kind === 'search' ? html`<${SearchModal}/>` : overlay.kind === 'pageMenu' ? html`<${PageMenu}/>` : overlay.kind === 'share' ? html`<${SharePopover}/>` : overlay.kind === 'addView' ? html`<${AddViewMenu}/>` : overlay.kind === 'rowActions' ? html`<${RowActionsMenu} data=${overlay.data}/>` : overlay.kind === 'linkPage' ? html`<${LinkPageMenu} data=${overlay.data}/>` : overlay.kind === 'viewMenu' ? html`<${ViewMenu} data=${overlay.data}/>` : overlay.kind === 'cellSelect' ? html`<${SelectEditor} data=${overlay.data}/>` : overlay.kind === 'cellText' ? html`<${TextEditor} data=${overlay.data}/>` : overlay.kind === 'cellDate' ? html`<${DateEditor} data=${overlay.data}/>` : overlay.kind === 'cellPerson' ? html`<${PersonEditor} data=${overlay.data}/>` : overlay.kind === 'cellFiles' ? html`<${FilesEditor} data=${overlay.data}/>` : overlay.kind === 'calcMenu' ? html`<${CalcMenu} data=${overlay.data}/>` : overlay.kind === 'filterEditor' ? html`<${FilterEditor} data=${overlay.data}/>` : overlay.kind === 'noDate' ? html`<${NoDateMenu} data=${overlay.data}/>` : overlay.kind === 'sortEditor' ? html`<${SortEditor}/>` : overlay.kind === 'propMenu' ? html`<${PropMenu} data=${overlay.data}/>` : overlay.kind === 'propPicker' ? html`<${PropPicker} data=${overlay.data}/>` : overlay.kind === 'newMenu' ? html`<${NewRowMenu}/>` : overlay.kind === 'trash' ? html`<${TrashPopover}/>` : overlay.kind === 'help' ? html`<${HelpMenu}/>` : overlay.kind === 'sectionMenu' ? html`<${SectionMenu} data=${overlay.data}/>` : overlay.kind === 'blockMenu' ? html`<${BlockMenu} data=${overlay.data}/>` : overlay.kind === 'moveTo' ? html`<${MoveToMenu} data=${overlay.data}/>` : overlay.kind === 'iconPicker' ? html`<${IconPicker} data=${overlay.data}/>` : overlay.kind === 'coverPicker' ? html`<${CoverPicker} data=${overlay.data}/>` : overlay.kind === 'settings' ? html`<${SettingsModal} data=${overlay.data}/>` : overlay.kind === 'mediaPicker' ? html`<${MediaPicker} data=${overlay.data}/>` : overlay.kind === 'composeMenu' ? html`<${ComposeMenu}/>` : overlay.kind === 'formSetup' ? html`<${FormSetup} data=${overlay.data}/>` : null;
  return html`<div class="ov-root"><div class=${'ov-catch' + (overlay.kind === 'search' || overlay.kind === 'settings' || overlay.kind === 'formSetup' ? ' dim' : '') + (overlay.kind === 'settings' ? ' scrim' : '')} onMouseDown=${closeOverlay}></div>${body}</div>`;
}
// Measured: once a page holds any discussion, open or resolved, the topbar grows a Comments button after Copy link.
let cmtPanel = null;
const pageHasComments = (page) => { if (page.comments && page.comments.length) return true; let hit = false; const walk = (ids) => (ids || []).forEach((id) => { const b = S.blocks[id]; if (!b || hit) return; if ((b.comments && b.comments.length) || (b.resolvedComments && b.resolvedComments.length)) hit = true; walk(b.children); }); walk(page.content); return hit; };
const ago = (t) => { const m = Math.floor((NOW() - (t || NOW())) / 60000); if (m < 1) return 'Edited just now'; if (m < 60) return `Edited ${m}m ago`; const h = Math.floor(m / 60); return h < 24 ? `Edited ${h}h ago` : `Edited ${Math.floor(h / 24)}d ago`; };
// Measured Discussions popover: 456px under the Comments button, right edges aligned; an empty page reads
// "You're all caught up" over an outlined See all button that widens the list to resolved threads.
function DiscussionsPopover({ page }) {
  const ref = useRef(null); const [all, setAll] = useState(false);
  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target) && !e.target.closest('.tb-cmts')) { cmtPanel = null; refresh(); } };
    const onKey = (e) => { if (e.key === 'Escape') { cmtPanel = null; refresh(); } };
    addEventListener('mousedown', onDown, true); addEventListener('keydown', onKey, true);
    return () => { removeEventListener('mousedown', onDown, true); removeEventListener('keydown', onKey, true); };
  }, []);
  const open = []; const resolved = [];
  (page.comments || []).forEach((c) => open.push([null, c]));
  const walk = (ids) => (ids || []).forEach((id) => { const b = S.blocks[id]; if (!b) return; (b.comments || []).forEach((c) => open.push([b, c])); (b.resolvedComments || []).forEach((c) => resolved.push([b, c])); walk(b.children); });
  walk(page.content);
  const list = all ? [...open, ...resolved] : open;
  return html`<div class=${'dz-pop' + (list.length ? ' has' : '')} ref=${ref}>
    <div class="dz-head"><div class="dz-title">Discussions</div>${READY.notifyPrefs ? html`<div class="dz-bell" role="button" aria-label="Notification settings"><${Icon} n="bell" cls="i20"/></div>` : ''}</div>
    ${list.length ? html`<div class="dz-list">${list.map(([b, c]) => html`<div class="dz-item"><div class="bt-head"><div class="pd-avatar"><img src=${space.avatar(c.authorId)} alt=""/></div><div class="bt-name">${c.author}</div><div class="bt-time">${relTime(c.time)}</div></div>${b ? html`<div class="dz-quote">${plain(b.title)}</div>` : ''}<div class="bt-text">${c.text}</div></div>`)}</div>`
      : html`<div class="dz-empty"><${Icon} n="discussionsEmpty" cls="dz-empty-ic"/><div class="dz-e1">You’re all caught up</div><div class="dz-e2">There are no open discussions</div><div class="dz-see" role="button" onClick=${() => setAll(true)}>See all</div></div>`}
  </div>`;
}
function Topbar({ page }) {
  return html`<div class="nsp-topbar">
    ${S.sidebar.collapsed ? html`<div class="tb-open-sb" role="button" data-tip="Open sidebar" onClick=${() => { S.sidebar.collapsed = false; commit(); }}><span class="mirror"><${Icon} n="arrowChevronDoubleBackward" cls="i20"/></span></div>` : ''}
    ${ancestorsOf(page).map((a) => html`<div class="tb-crumb" role="button" onClick=${() => { go(a.id); }}>${hasIcon(a) ? html`<div class="tb-crumb-icon"><div class="tb-crumb-icon-in"><${PageIcon} ic=${a.icon} size=${16.2}/></div></div>` : ''}<div class="tb-crumb-title">${a.title || (a.kind === 'database' ? 'New database' : 'New page')}</div></div><span class="tb-slash">/</span>`)}<div class="tb-crumb">${hasIcon(page) ? html`<div class="tb-crumb-icon"><div class="tb-crumb-icon-in"><${PageIcon} ic=${page.icon} size=${16.2}/></div></div>` : ''}<div class=${'tb-crumb-title' + (hasIcon(page) ? '' : ' noicon')}>${(page.titleParts || [page.title]).join('') || (page.kind === 'database' ? 'New database' : 'New page')}</div></div>
    <div class="tb-private" role="button" onClick=${(e) => openOverlay('share', e.currentTarget)}><${Icon} n="lockFill" cls="i16"/><span class="tb-private-label">${space.sectionLabel(page)}</span><${Icon} n="arrowChevronSingleDownFill" cls="i11"/></div>
    ${cmtPanel === page.id ? html`<${DiscussionsPopover} page=${page}/>` : ''}
    <div class="tb-right">
      ${space.presentOn(page.id).length ? html`<div class="tb-people" aria-label="Also on this page">${space.presentOn(page.id).slice(0, 3).map((p) => html`<img class="tb-person" src=${p.avatar || initialsAvatar(p.name || '?')} alt=${p.name} data-tip=${p.name}/>`)}${space.presentOn(page.id).length > 3 ? html`<span class="tb-more">+${space.presentOn(page.id).length - 3}</span>` : ''}</div>` : ''}
      <div class="tb-btn tb-edited">${ago(page.lastEdited)}</div>
      <div class="tb-btn tb-share" role="button" onClick=${(e) => openOverlay('share', e.currentTarget)}><${Icon} n="lock" cls="i-lock"/><span>Share</span></div>
      <div class="tb-btn sq tb-link" role="button" data-tip="Copy link" onClick=${() => { try { navigator.clipboard.writeText(location.href); } catch (e) {} copiedToast(); }}><${Icon} n="link" cls="i20"/></div>
      ${pageHasComments(page) ? html`<div class="tb-btn sq tb-cmts" role="button" data-tip="View all new discussions" onClick=${() => { cmtPanel = cmtPanel === page.id ? null : page.id; refresh(); }}><${Icon} n="cmtTopbar" cls="i20"/></div>` : ''}
      <div class=${'tb-btn sq' + (page.favorite ? ' fav' : '')} role="button" data-tip=${page.favorite ? 'Remove from Favorites' : 'Add to Favorites'} onClick=${() => { page.favorite = !page.favorite; page.favoritedAt = NOW(); commit(); }}><${Icon} n="star" cls="i20"/></div>
      <div class="tb-btn sq" role="button" data-tip="Style, export, and more…" onClick=${(e) => openOverlay('pageMenu', e.currentTarget)}><${Icon} n="ellipsis" cls="i22"/></div>
    </div>
  </div>`;
}
/* ------------------------------------------------------------------ Templates */
function MpHead({ ic, label }) {
  return html`<div class="mp-sh"><div class="mp-sh-l"><${Icon} n=${ic} cls="i16"/><span>${label}</span></div></div>`;
}
// Copies a template into Private as ordinary pages, blocks and databases, so the copy saves and syncs like any page.
function instantiateTemplate(t) {
  const pid = uid();
  const page = { id: pid, kind: t.database ? 'database' : 'page', icon: { emoji: t.icon }, title: t.title, content: [], lastEdited: NOW(), parent: null, section: 'private' };
  S.pages[pid] = page;
  if (t.page) {
    for (const [type, text, extra] of t.page.blocks) {
      const b = newBlock(type, text ? [[text]] : [], pid);
      if (extra) Object.assign(b, JSON.parse(JSON.stringify(extra)));
      page.content.push(b.id);
    }
  } else {
    const cid = uid(); const vid = uid();
    const schema = { title: { name: 'Name', type: 'title' } };
    const ids = {};
    for (const [name, type] of t.database.props) {
      const id = propId(); ids[name] = id;
      schema[id] = { name, type };
      if (type === 'status') schema[id].options = [{ id: propId(), value: 'Not started', color: 'default', group: 'to_do' }, { id: propId(), value: 'In progress', color: 'blue', group: 'in_progress' }, { id: propId(), value: 'Done', color: 'green', group: 'complete' }];
      if (type === 'select' || type === 'multi_select') schema[id].options = [];
    }
    S.collections[cid] = { id: cid, schema };
    const format = { table_properties: ['title', ...Object.values(ids)].map((p) => ({ property: p, visible: true, width: p === 'title' ? 280 : 180 })) };
    S.views[vid] = { id: vid, type: t.database.view, name: t.database.view === 'board' ? 'Board' : 'Table', format, ...(t.database.view === 'board' && ids.Status ? { group_by: ids.Status } : {}) };
    S.rows[cid] = t.database.rows.map((r) => { const row = { id: uid(), title: r.title, created: NOW() }; for (const [k, v] of Object.entries(r)) if (k !== 'title' && ids[k]) row[ids[k]] = v; return row; });
    Object.assign(page, { collection: cid, views: [vid], description: t.description, hideDescription: true });
  }
  S.sidebar.private.unshift(pid);
  commit();
  return pid;
}
function MarketplacePage() {
  return html`<div class="mp">
    <div class="mp-bar"><a class="mp-crumb" role="link"><${Icon} n="templates" cls="i20"/><span>Templates</span></a></div>
    <div class="mp-col"><div class="mp-secs"><section class="mp-sec"><${MpHead} ic="squareOnCircleSmall" label="Start from a template"/>
      <div class="mp-grid">${TEMPLATES.map((t) => html`<a class="mp-tc" onClick=${() => go(instantiateTemplate(t))}><div class="mp-tc-img"><div class="tpl-preview">${t.icon}</div></div><div class="mp-tc-info"><div class="mp-tc-row"><div class="mp-tc-l"><div class="mp-tc-by"><div class="mp-tc-name">${t.title}</div></div><div class="tpl-desc">${t.description}</div></div><div class="mp-free">Use</div></div></div></a>`)}</div>
    </section></div></div>
  </div>`;
}
function PageStatus({ status }) {
  const text = status === 'no_access' ? 'You don’t have access to this page. Ask whoever shared it to invite you.' : status === 'not_found' ? 'This page doesn’t exist, or it was deleted.' : status === 'error' ? 'This page couldn’t load. Check your connection and try again.' : '';
  return html`<div class="nsp-page-status">${text}</div>`;
}
function App() {
  useStore();
  const r = route();
  const isAi = r === 'ai';
  const isLib = r === 'library' || r.startsWith('library/');
  const isTasks = r === 'tasks';
  const isMarket = r === 'marketplace' || r.startsWith('marketplace/');
  const isApp = r === APP_ROUTE || r === 'home';
  const page = isUuid(r) ? S.pages[r] : null;
  const status = isUuid(r) ? space.pageStatus(r) : 'ready';
  const drawable = page && (page.kind === 'database' ? !!S.collections[page.collection] && !!S.views[page.views && page.views[0]] : Array.isArray(page.content));
  useLayoutEffect(() => { applyFocus(); applySel(); });
  useEffect(() => { if (isAi && !READY.ai) space.go('home', { replace: true }); }, [isAi]);
  useEffect(() => { if (!isApp) document.title = isAi ? 'Nemesis AI' : isLib ? 'Library' : isTasks ? 'My Tasks' : isMarket ? 'Templates' : page ? pageTitleText(page) : 'Nemesis'; });
  const peek = page && page.kind === 'database' && peekRow && drawable ? (S.rows[page.collection] || []).find((x) => x.id === peekRow) : null;
  let main = '';
  if (isMarket) main = html`<div class="nsp-scroller vertical"><${MarketplacePage}/></div>`;
  else if (isTasks) main = html`<${TasksPage}/>`;
  else if (isLib) main = html`<div class="nsp-scroller horizontal"><${LibraryPage} tab=${r.split('/')[1]}/></div>`;
  else if (isAi && READY.ai) main = html`${S.aiOpen && S.aiChats && S.aiChats[S.aiOpen] ? html`<${AiTopbar}/>` : html`<${AiFullTopbar}/>`}<div class="nsp-scroller vertical"><${AiPage}/></div>`;
  else if (isUuid(r) && !drawable) main = html`<${PageStatus} status=${status === 'ready' ? 'loading' : status}/>`;
  else if (page) main = html`
      <${Topbar} page=${page}/>${page.trashed ? html`<div class="trash-banner"><span>This page is in Trash.</span><div class="tb-b" role="button" onClick=${() => restorePage(page.id)}>Restore page</div><div class="tb-b" role="button" onClick=${() => destroyPage(page.id)}>Delete from Trash</div></div>` : ''}
      <div class=${'nsp-scroller ' + (page.kind === 'database' ? 'horizontal' : 'vertical')}>${page.kind === 'database' ? html`<${Database} page=${page}/>` : html`<${Outline} key=${'o' + page.id} page=${page}/><${Page} key=${page.id} page=${page}/>`}</div>`;
  return html`<div class=${'nsp-app-inner' + (peek ? ' has-peek' : '') + (aiSideOpen() && !isAi && !isApp ? ' ais-open' : '') + (isAi ? ' ai-route' : '') + (isApp ? ' app-route' : '')}>
    <${Sidebar} current=${page ? page.id : null}/>
    <div class="nsp-frame">${main}</div>
    ${READY.ai && !isAi && !isApp ? html`<${AiSidePanel} page=${drawable ? page : null}/>` : ''}
    ${isApp ? '' : html`<div class="nsp-help" role="button" aria-label="Help" onClick=${(e) => openOverlay('help', e.currentTarget)}><${Icon} n="questionMarkCircle" cls="i20"/></div>`}
    <${SlashMenu}/>
    <${MentionMenu}/>
    <${BlockHandles}/>
    <${FmtMenu}/>
    ${peek ? html`<${RowPeek} page=${page} row=${peek}/>` : ''}
    <${Overlay}/>
    <${Toast}/>
  </div>`;
}
const tipEl = document.createElement('div');
tipEl.className = 'tip';
let tipTimer = 0;
addEventListener('mouseover', (e) => {
  const t = e.target.closest ? e.target.closest('[data-tip],[data-tip-html]') : null;
  clearTimeout(tipTimer);
  if (!t) { tipEl.classList.remove('on'); return; }
  tipTimer = setTimeout(() => {
    const r = t.getBoundingClientRect();
    if (t.dataset.tipHtml) tipEl.innerHTML = t.dataset.tipHtml; else tipEl.textContent = t.dataset.tip;
    tipEl.classList.add('on');
    const w = tipEl.offsetWidth;
    tipEl.style.left = Math.min(innerWidth - w - 4, Math.max(4, r.left + r.width / 2 - w / 2)) + 'px';
    tipEl.style.top = r.bottom + 6 + 'px';
  }, 500);
});
addEventListener('mousedown', () => { clearTimeout(tipTimer); tipEl.classList.remove('on'); });
/** Draws the Space frontend into `root` (the React host's .nsp element) and connects it to the backend. */
export function mountSpace(root, host) {
  const appEl = document.createElement('div');
  appEl.className = 'nsp-app';
  root.append(appEl, tipEl);
  space.start(root, host);
  if (!window.katex) import('katex').then((m) => { window.katex = m.default || m; refresh(); }).catch(() => {});
  render(html`<${App}/>`, appEl);
  return () => { render(null, appEl); appEl.remove(); tipEl.remove(); space.stop(); };
}
