/**
 * Typing into a page (canvas: NoteTyping, AddBlock, AddMedia, RecordStart). Each text-like block is a field; while
 * one is focused a floating toolbar rides 10px above the keyboard: the Nemesis mark (ask), + (blocks and media),
 * Aa (text style), mic (record), image (media), turn (turn into), undo, comment, @ (mention a page), then the pinned
 * keyboard-down key. Tools appear ONLY while typing, like Notion (owner ruling); reading shows none.
 *
 * 🔴 THE TOOLBAR IS NOT AN InputAccessoryView. In this build (RN 0.85, new architecture) an accessory view draws
 * nothing (measured, see components/NoteBlockEditor.tsx). The toolbar and panels live in a FullWindowOverlay and
 * follow the keyboard's own height from the keyboard events, so nothing here depends on how the page lays out.
 *
 * 🔴 A PANEL TAKES THE KEYBOARD'S PLACE. Opening +, Aa or turn dismisses the keyboard and shows a panel of the same
 * height pinned to the bottom, the toolbar staying where it was; the close key brings the keyboard back to the field.
 *
 * 🔴 SAVING NEVER WAITS FOR BLUR. Tapping the page's done button unmounts this editor before a blur save could run,
 * and typed text was lost. Each field saves 600ms after the last keystroke, blur saves at once (skipped when that
 * text is already saved), and unmounting flushes every unsaved field. Each save sends the field version the last
 * save returned, so a second save is not mistaken for someone else's edit.
 *
 * Titles keep their rich-text segments (marks and page mentions) through edits: see ./rich.ts.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type KeyboardEvent,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import Animated, { Easing, FadeIn, runOnJS, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { FullWindowOverlay } from 'react-native-screens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { linkEmbed, openEmbed, pickAndUploadMedia, sourceEmbed, type MediaKind } from '@/api/noteMedia';
import type { Block, PageSource } from '@/api/space';
import { addBlockComment, saveBlockTitle } from '@/api/spaceWrite';
import { nxType, useNx } from '@/theme/nx';
import { NxIcon, type NxIconName } from '../NxIcon';
import { NxButton } from '../primitives';
import { BookmarkEmbed, FileEmbed } from './FileEmbed';
import { applyEdit, hasMark, insertMention, mentionOf, plainOf, rawText, segDisplay, segsOf, toggleMark, type Seg } from './rich';

export type TurnIntoType = 'text' | 'header' | 'sub_header' | 'sub_sub_header' | 'bulleted_list' | 'numbered_list' | 'to_do' | 'toggle' | 'quote' | 'callout';
export type NewBlockType = TurnIntoType | 'page' | 'file' | 'image' | 'video' | 'audio' | 'bookmark';
export type SaveResult = 'saved' | 'conflict' | 'failed';

/** The props a block needs when it turns into `type` (send as setBlockType's `set`). */
export function turnIntoProps(block: Block, type: TurnIntoType): Record<string, unknown> {
  if (type === 'to_do' && block.type !== 'to_do') return { checked: false };
  if (type === 'callout' && !block.props?.icon) return { icon: '💡' };
  return {};
}

export type BlockEditorProps = {
  blocks: Block[];
  /** Used only when `spaceId` is missing: the page saves the text itself. With `spaceId` the editor saves. */
  onSaveText?: (block: Block, text: string, rich: Seg[]) => void;
  /** After the editor saved a field: reload on 'saved', show the newest version on 'conflict', say so on 'failed'. */
  onSaved?: (block: Block, result: SaveResult) => void;
  onToggle: (block: Block, checked: boolean) => void;
  /** Adds a block after `afterId` (end of page when null). Media blocks come with their props. */
  onAddBlock: (type: NewBlockType, afterId: string | null, props?: Record<string, unknown>) => void;
  onOpenPage: (pageId: string) => void;
  onRecord?: () => void;
  spaceId?: string | null;
  pageId?: string;
  /** Pages the @ button can mention. */
  pages?: { id: string; title: string; icon?: string | null }[];
  /** This page's sources, for Media > From sources. */
  sources?: PageSource[];
  onAsk?: () => void;
  onFlashcards?: () => void;
  onTurnInto?: (block: Block, type: TurnIntoType) => void;
  /** Something outside the blocks' text changed: a comment was added, or a file was read into Sources. */
  onChanged?: () => void;
  /** The typing toolbar is showing (a field is focused or a panel is open): the page hides its Ask bar. */
  onEngaged?: (on: boolean) => void;
};

const TEXT_TYPES = new Set(['text', 'header', 'sub_header', 'sub_sub_header', 'header_4', 'bulleted_list', 'numbered_list', 'to_do', 'quote', 'callout', 'toggle']);
const EMBED_TYPES = new Set(['file', 'image', 'video', 'audio', 'bookmark']);
const KB_FALLBACK = 336;
const HIDDEN = -70;
const SAVE_MS = 600;
const EASE = Easing.bezier(0.32, 0.72, 0, 1);

const serverSegs = (b: Block): Seg[] => segsOf(b.rich ?? b.text);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

type Panel = 'add' | 'style' | 'turn' | 'sources';
type Sheet = { kind: 'link'; embed: boolean } | { kind: 'mention' } | { kind: 'comment' };

const TURN: { label: string; type: TurnIntoType; icon?: NxIconName; glyph?: string }[] = [
  { label: 'Text', type: 'text', icon: 'aa' },
  { label: 'Heading 1', type: 'header', glyph: 'H1' },
  { label: 'Heading 2', type: 'sub_header', glyph: 'H2' },
  { label: 'Heading 3', type: 'sub_sub_header', glyph: 'H3' },
  { label: 'Bulleted list', type: 'bulleted_list', icon: 'bullets' },
  { label: 'Numbered list', type: 'numbered_list', glyph: '1.' },
  { label: 'To-do list', type: 'to_do', icon: 'checklist' },
  { label: 'Toggle list', type: 'toggle', icon: 'chev_r' },
  { label: 'Quote', type: 'quote', glyph: '“' },
  { label: 'Callout', type: 'callout', icon: 'bulb' },
];

const STYLES: { label: string; key: string; glyph: string; style: TextStyle }[] = [
  { label: 'Bold', key: 'b', glyph: 'B', style: { fontWeight: '700' } },
  { label: 'Italic', key: 'i', glyph: 'I', style: { fontStyle: 'italic', fontFamily: 'Georgia' } },
  { label: 'Underline', key: '_', glyph: 'U', style: { textDecorationLine: 'underline' } },
  { label: 'Strikethrough', key: 's', glyph: 'S', style: { textDecorationLine: 'line-through' } },
  { label: 'Code', key: 'c', glyph: '</>', style: { fontFamily: 'Menlo', fontSize: 12 } },
];

export function BlockEditor({
  blocks,
  onSaveText,
  onSaved,
  onToggle,
  onAddBlock,
  onOpenPage,
  onRecord,
  spaceId,
  pageId,
  pages,
  sources,
  onAsk,
  onFlashcards,
  onTurnInto,
  onChanged,
  onEngaged,
}: BlockEditorProps) {
  const c = useNx();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // Floored with a point to spare: two tiles and the gap that add up to exactly the row width wrap one per line
  // after rounding (the panel came out as a single column).
  const tileW = Math.floor((width - 32 - 12) / 2) - 1;

  const titles = useMemo(() => new Map((pages ?? []).map((p) => [p.id, p.title])), [pages]);
  const titleOf = useCallback((id: string) => titles.get(id) ?? '', [titles]);

  // Read from timers and the unmount flush, where props from the render that scheduled them would be stale.
  const live = useRef({ spaceId, onSaveText, onSaved, blocks });
  live.current = { spaceId, onSaveText, onSaved, blocks };

  // ── Drafts and saving ─────────────────────────────────────────────────────────────────────────────────────────
  const [drafts, setDrafts] = useState<Record<string, Seg[]>>(() => Object.fromEntries(blocks.map((b) => [b.id, serverSegs(b)])));
  const draftsRef = useRef(drafts);
  const setDraft = useCallback((id: string, segs: Seg[]) => {
    draftsRef.current = { ...draftsRef.current, [id]: segs };
    setDrafts(draftsRef.current);
  }, []);
  const focusedRef = useRef<string | null>(null);
  const lastFocused = useRef<string | null>(null);
  const inputs = useRef(new Map<string, TextInput>());
  const selections = useRef(new Map<string, { start: number; end: number }>());

  /** The segments (as JSON) the server holds or was last sent, per block: a draft that differs is unsaved. */
  const savedKey = useRef(new Map<string, string>(blocks.map((b) => [b.id, JSON.stringify(serverSegs(b))])));
  const versions = useRef(new Map<string, number>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const chains = useRef(new Map<string, Promise<void>>());
  const inflight = useRef(new Map<string, number>());
  /** Blocks whose save hit a conflict: the next load replaces the draft with the newest text. */
  const adopt = useRef(new Set<string>());
  const pendingFocus = useRef<Set<string> | null>(null);

  const flush = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
    const segs = draftsRef.current[id];
    const { spaceId: sid, onSaveText: pageSave, blocks: list } = live.current;
    const b = list.find((x) => x.id === id);
    if (!segs || !b) return;
    const key = JSON.stringify(segs);
    if (savedKey.current.get(id) === key) return;
    savedKey.current.set(id, key);
    if (!sid) {
      pageSave?.(b, rawText(segs), segs);
      return;
    }
    inflight.current.set(id, (inflight.current.get(id) ?? 0) + 1);
    const run = async () => {
      let result: SaveResult = 'saved';
      try {
        const res = await saveBlockTitle(sid, id, segs, versions.current.get(id));
        result = res.status;
        if (res.status === 'saved' && res.version != null) versions.current.set(id, res.version);
        if (res.status === 'conflict') adopt.current.add(id);
      } catch {
        result = 'failed';
        if (savedKey.current.get(id) === key) savedKey.current.delete(id);
      } finally {
        inflight.current.set(id, Math.max(0, (inflight.current.get(id) ?? 1) - 1));
      }
      live.current.onSaved?.(b, result);
    };
    chains.current.set(id, (chains.current.get(id) ?? Promise.resolve()).then(run));
  }, []);

  const schedule = useCallback(
    (id: string) => {
      const t = timers.current.get(id);
      if (t) clearTimeout(t);
      timers.current.set(id, setTimeout(() => flush(id), SAVE_MS));
    },
    [flush],
  );

  // Leaving the editor (the page's done button unmounts it) saves whatever is still unsaved.
  useEffect(
    () => () => {
      for (const id of Object.keys(draftsRef.current)) flush(id);
    },
    [flush],
  );

  useEffect(() => {
    const next: Record<string, Seg[]> = {};
    for (const b of blocks) {
      if (b.titleVersion != null && b.titleVersion > (versions.current.get(b.id) ?? -1)) versions.current.set(b.id, b.titleVersion);
      const server = serverSegs(b);
      const mine = draftsRef.current[b.id];
      if (adopt.current.has(b.id)) {
        adopt.current.delete(b.id);
        versions.current.delete(b.id);
        if (b.titleVersion != null) versions.current.set(b.id, b.titleVersion);
      } else if (mine) {
        const dirty = JSON.stringify(mine) !== savedKey.current.get(b.id);
        if (focusedRef.current === b.id || dirty || timers.current.has(b.id) || (inflight.current.get(b.id) ?? 0) > 0) {
          next[b.id] = mine;
          continue;
        }
      }
      next[b.id] = server;
      savedKey.current.set(b.id, JSON.stringify(server));
    }
    draftsRef.current = next;
    setDrafts(next);
    const known = pendingFocus.current;
    if (known) {
      const fresh = blocks.find((b) => !known.has(b.id) && TEXT_TYPES.has(b.type));
      if (fresh) {
        pendingFocus.current = null;
        setTimeout(() => inputs.current.get(fresh.id)?.focus(), 60);
      }
    }
  }, [blocks]);

  // ── Undo: snapshots of a field before a burst of typing (a pause over 1.2s starts a new one) or a format ────────
  const undoStack = useRef<{ id: string; segs: Seg[]; at: number }[]>([]);
  const [undoDepth, setUndoDepth] = useState(0);
  const remember = (id: string, segs: Seg[], force = false) => {
    const s = undoStack.current;
    const top = s[s.length - 1];
    const now = Date.now();
    if (!force && top && top.id === id && now - top.at < 1200) {
      top.at = now;
      return;
    }
    s.push({ id, segs, at: now });
    if (s.length > 100) s.shift();
    setUndoDepth(s.length);
  };
  const undo = () => {
    const entry = undoStack.current.pop();
    setUndoDepth(undoStack.current.length);
    if (!entry) return;
    setDraft(entry.id, entry.segs);
    flush(entry.id);
  };

  const change = (id: string, text: string) => {
    const cur = draftsRef.current[id] ?? [];
    const next = applyEdit(cur, text, titleOf);
    if (next === cur) return;
    remember(id, cur);
    setDraft(id, next);
    schedule(id);
  };

  // ── Keyboard, toolbar, panels ────────────────────────────────────────────────────────────────────────────────
  const [engaged, setEngaged] = useState(false);
  const [panel, setPanelState] = useState<Panel | null>(null);
  const panelRef = useRef<Panel | null>(null);
  const setPanel = useCallback((p: Panel | null) => {
    panelRef.current = p;
    setPanelState(p);
  }, []);
  const [addFrom, setAddFrom] = useState<'plus' | 'image'>('plus');
  const addFromRef = useRef<'plus' | 'image'>('plus');
  const [panelH, setPanelH] = useState(KB_FALLBACK);
  const kbUp = useRef(false);
  const lift = useSharedValue(HIDDEN);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const sheetRef = useRef<Sheet | null>(null);
  sheetRef.current = sheet;
  useEffect(() => {
    onEngaged?.(engaged);
  }, [engaged, onEngaged]);
  // 🔴 ENGAGED MUST MEAN VISIBLE. The page hides its Ask and done bar while the editor is engaged, so a toolbar left
  // parked at HIDDEN strands the note with no way out (a reload resets the position but not this flag, and a focus()
  // on an already-focused line fires no onFocus). Whenever engaged, make sure the toolbar is actually raised.
  useEffect(() => {
    if (!engaged || sheet) return;
    if (lift.value <= HIDDEN + 1) {
      lift.value = withTiming(kbUp.current || panelRef.current ? panelH : Math.max(insets.bottom, 12) - 10, { duration: 280, easing: EASE });
    }
  });

  const disengage = useCallback(() => {
    if (!kbUp.current && !panelRef.current && !focusedRef.current) setEngaged(false);
  }, []);

  const hideToolbar = useCallback(() => {
    setPanel(null);
    lift.value = withTiming(HIDDEN, { duration: 280, easing: EASE }, (done) => {
      if (done) runOnJS(disengage)();
    });
  }, [lift, disengage, setPanel]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e: KeyboardEvent) => {
      kbUp.current = true;
      const h = e.endCoordinates.height;
      if (h > 0) setPanelH(h);
      lift.value = withTiming(h, { duration: e.duration || 250, easing: EASE });
    });
    const hide = Keyboard.addListener(hideEvent, (e: KeyboardEvent) => {
      kbUp.current = false;
      if (panelRef.current) return; // the panel takes the keyboard's place; the toolbar stays put
      lift.value = withTiming(HIDDEN, { duration: (e.duration || 250) + 60, easing: EASE }, (done) => {
        if (done) runOnJS(disengage)();
      });
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [lift, disengage]);

  const onFieldFocus = (id: string) => {
    focusedRef.current = id;
    lastFocused.current = id;
    setEngaged(true);
    if (panelRef.current) setPanel(null);
    // 🔴 No keyboard event comes with a hardware keyboard (the Simulator, an iPad keyboard), so the toolbar would stay
    // hidden. It rests above the home indicator until a software keyboard lifts it.
    if (!kbUp.current) lift.value = withTiming(Math.max(insets.bottom, 12) - 10, { duration: 280, easing: EASE });
  };
  const onFieldBlur = (id: string) => {
    if (focusedRef.current === id) focusedRef.current = null;
    flush(id);
    // Focus went to another field on the page (the title): the keyboard stays up, but these tools are not for it.
    setTimeout(() => {
      if (!focusedRef.current && !panelRef.current && kbUp.current) setEngaged(false);
      // Hardware keyboard: nothing else will lower the resting toolbar once no field is focused.
      else if (!focusedRef.current && !panelRef.current && !kbUp.current && !sheetRef.current) hideToolbar();
    }, 80);
  };

  const refocus = () => {
    const id = lastFocused.current;
    const input = id ? inputs.current.get(id) : undefined;
    if (input) input.focus();
    else hideToolbar();
  };
  const openPanel = (p: Panel) => {
    setNotice(null);
    setPanel(p);
    Keyboard.dismiss();
    // The panel takes the keyboard's place, so the toolbar sits on top of it (canvas AddBlock). With a software
    // keyboard it is already there; with a hardware keyboard it has to rise from its resting spot.
    lift.value = withTiming(panelH, { duration: 280, easing: EASE });
  };
  const closePanel = () => {
    setPanel(null);
    refocus();
  };
  const target = () => (lastFocused.current ? live.current.blocks.find((b) => b.id === lastFocused.current) : undefined);

  const toolbarStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -(lift.value + 10) }] }));

  // Mic: the button presses in with a blue tint, the keyboard goes down, then the recorder opens (canvas RecordStart).
  const micScale = useSharedValue(1);
  const micTint = useSharedValue(0);
  const [micOn, setMicOn] = useState(false);
  const micStyle = useAnimatedStyle(() => ({ transform: [{ scale: micScale.value }], backgroundColor: `rgba(59,147,240,${0.2 * micTint.value})` }));
  const record = () => {
    if (!onRecord) return;
    setMicOn(true);
    micScale.value = withSequence(withTiming(0.8, { duration: 80 }), withTiming(1.06, { duration: 100 }), withTiming(1, { duration: 90 }));
    micTint.value = withSequence(withTiming(1, { duration: 80 }), withTiming(0.8, { duration: 100 }), withTiming(0, { duration: 240 }));
    setTimeout(() => {
      if (panelRef.current) hideToolbar();
      Keyboard.dismiss();
    }, 150);
    setTimeout(() => {
      setMicOn(false);
      onRecord();
    }, 280);
  };

  const openAdd = (from: 'plus' | 'image') => {
    if (panelRef.current === 'add' && addFromRef.current === from) {
      closePanel();
      return;
    }
    addFromRef.current = from;
    setAddFrom(from);
    openPanel('add');
  };
  const addScroll = useRef<ScrollView>(null);
  const mediaY = useRef(0);
  useEffect(() => {
    if (panel !== 'add') return;
    const y = addFrom === 'image' ? mediaY.current : 0;
    requestAnimationFrame(() => addScroll.current?.scrollTo({ y, animated: false }));
  }, [panel, addFrom]);

  // ── Actions ──────────────────────────────────────────────────────────────────────────────────────────────────
  const addTextBlock = (type: NewBlockType) => {
    pendingFocus.current = new Set(live.current.blocks.map((b) => b.id));
    onAddBlock(type, lastFocused.current);
    setPanel(null);
    setTimeout(() => {
      if (pendingFocus.current && !focusedRef.current) {
        pendingFocus.current = null;
        hideToolbar();
      }
    }, 2500);
  };

  const attach = async (kind: MediaKind) => {
    if (!spaceId || !pageId || busy) return;
    setNotice(null);
    try {
      const res = await pickAndUploadMedia(kind, spaceId, pageId, setBusy);
      if (!res) return;
      onAddBlock(res.block.type, lastFocused.current, res.block.props);
      if (res.readSource) {
        setBusy('Adding it to Sources');
        const warning = await res.readSource();
        onChanged?.();
        if (warning) {
          setNotice(warning);
          return;
        }
      }
      closePanel();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'That file could not be added. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const applyStyle = (key: string) => {
    const id = lastFocused.current;
    if (!id) return;
    const cur = draftsRef.current[id] ?? [];
    const sel = selections.current.get(id) ?? { start: 0, end: 0 };
    remember(id, cur, true);
    setDraft(id, toggleMark(cur, sel.start, sel.end, key, titleOf));
    flush(id);
  };
  const styleOn = (key: string) => {
    const id = lastFocused.current;
    if (!id) return false;
    const sel = selections.current.get(id) ?? { start: 0, end: 0 };
    return hasMark(drafts[id] ?? [], sel.start, sel.end, key, titleOf);
  };

  const turnInto = (type: TurnIntoType) => {
    const b = target();
    if (!b || !onTurnInto) return;
    flush(b.id);
    onTurnInto(b, type);
    closePanel();
  };

  const [sheetText, setSheetText] = useState('');
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [sheetBusy, setSheetBusy] = useState(false);
  const openSheet = (s: Sheet) => {
    setSheetText('');
    setSheetError(null);
    setSheetBusy(false);
    Keyboard.dismiss();
    setSheet(s);
  };
  const closeSheet = (backToField: boolean) => {
    setSheet(null);
    setPanel(null);
    if (!backToField) {
      hideToolbar();
      return;
    }
    setTimeout(() => {
      refocus();
      // 🔴 When the cursor never left its line (a hardware keyboard, or the sheet closed before a blur landed), focus()
      // fires no onFocus, so nothing would raise the toolbar again and the note is left with no toolbar and no
      // done button. Put it back explicitly: on the keyboard if one is up, else at its resting spot.
      if (lastFocused.current) {
        setEngaged(true);
        lift.value = withTiming(kbUp.current ? panelH : Math.max(insets.bottom, 12) - 10, { duration: 280, easing: EASE });
      }
    }, 350);
  };
  const submitLink = (embed: boolean) => {
    const block = linkEmbed(sheetText, embed);
    if (!block) {
      setSheetError('That does not look like a web link. Paste the full address.');
      return;
    }
    onAddBlock(block.type, lastFocused.current, block.props);
    closeSheet(true);
  };
  const mention = (id: string) => {
    const field = lastFocused.current;
    if (!field) return;
    const cur = draftsRef.current[field] ?? [];
    const at = selections.current.get(field)?.end ?? plainOf(cur, titleOf).length;
    remember(field, cur, true);
    setDraft(field, insertMention(cur, at, id, titleOf));
    flush(field);
    closeSheet(true);
  };
  const postComment = async () => {
    const b = target();
    const text = sheetText.trim();
    if (!b || !spaceId || !text) return;
    setSheetBusy(true);
    setSheetError(null);
    try {
      await addBlockComment(spaceId, b.id, text);
      onChanged?.();
      closeSheet(true);
    } catch (e) {
      setSheetError(e instanceof Error ? e.message : 'The comment did not save. Try again.');
    } finally {
      setSheetBusy(false);
    }
  };

  // ── Rendering ────────────────────────────────────────────────────────────────────────────────────────────────
  const segStyle = (s: Seg): StyleProp<TextStyle> => {
    const marks = s[1];
    if (!marks || !marks.length) return undefined;
    if (mentionOf(s)) return { fontWeight: '500', textDecorationLine: 'underline', textDecorationColor: c.ring };
    const has = (k: string) => marks.some((m) => m[0] === k);
    const under = has('_') || has('a');
    const strike = has('s');
    return {
      ...(has('b') ? { fontWeight: '600' as const } : null),
      ...(has('i') ? { fontStyle: 'italic' as const } : null),
      ...(under || strike ? { textDecorationLine: under && strike ? ('underline line-through' as const) : under ? ('underline' as const) : ('line-through' as const) } : null),
      ...(has('c') ? { fontFamily: 'Menlo', fontSize: 14, backgroundColor: c.sel, color: c.danger } : null),
    };
  };

  const field = (b: Block, style: TextStyle, placeholder = ' ') => {
    const segs = drafts[b.id] ?? serverSegs(b);
    return (
      <TextInput
        ref={(r) => {
          if (r) inputs.current.set(b.id, r);
          else inputs.current.delete(b.id);
        }}
        onChangeText={(t) => change(b.id, t)}
        onSelectionChange={(e) => selections.current.set(b.id, e.nativeEvent.selection)}
        onFocus={() => onFieldFocus(b.id)}
        onBlur={() => onFieldBlur(b.id)}
        multiline
        scrollEnabled={false}
        placeholder={placeholder}
        placeholderTextColor={c.t3}
        style={[style, { flex: 1, padding: 0, textDecorationLine: b.type === 'to_do' && b.checked ? 'line-through' : 'none' }]}
      >
        {segs.length
          ? segs.map((s, i) => (
              <Text key={i} style={segStyle(s)}>
                {segDisplay(s, titleOf)}
              </Text>
            ))
          : null}
      </TextInput>
    );
  };

  let run = 0;
  let prevDepth = -1;
  const body = blocks.map((b) => {
    let n = 0;
    if (b.type === 'numbered_list') {
      run = prevDepth === b.depth ? run + 1 : 1;
      prevDepth = b.depth;
      n = run;
    } else {
      run = 0;
      prevDepth = -1;
    }
    const pad = { marginLeft: b.depth * 20 };
    const p = b.props ?? {};
    if (b.type === 'page' && b.pageId) {
      return (
        <Pressable key={b.id} onPress={() => onOpenPage(b.pageId!)} style={[styles.line, { alignItems: 'center', minHeight: 32 }, pad]}>
          <NxIcon name="notes" size={18} color={c.t2} />
          <Text style={[nxType.body, { color: c.t1, textDecorationLine: 'underline', textDecorationColor: c.ring }]}>{titleOf(b.pageId) || b.text || 'Untitled'}</Text>
        </Pressable>
      );
    }
    if (EMBED_TYPES.has(b.type)) {
      const src = str(p.src) ?? '';
      const open = src ? () => void openEmbed(src).catch(() => undefined) : undefined;
      if (b.type === 'bookmark') return src ? <View key={b.id} style={pad}><BookmarkEmbed url={src} onPress={open} /></View> : null;
      return (
        <View key={b.id} style={pad}>
          <FileEmbed name={str(p.name) || 'File'} mime={str(p.mime) ?? (b.type === 'file' ? null : `${b.type}/*`)} bytes={num(p.bytes)} onPress={open} />
        </View>
      );
    }
    if (!TEXT_TYPES.has(b.type)) return null;
    const style = textStyle(b.type, c.t1);
    switch (b.type) {
      case 'bulleted_list':
        return (
          <View key={b.id} style={[styles.line, pad]}>
            <Text style={[nxType.body, { color: c.t3 }]}>•</Text>
            {field(b, style)}
          </View>
        );
      case 'numbered_list':
        return (
          <View key={b.id} style={[styles.line, pad]}>
            <Text style={[nxType.body, { color: c.t3, fontVariant: ['tabular-nums'] }]}>{n}.</Text>
            {field(b, style)}
          </View>
        );
      case 'to_do':
        return (
          <View key={b.id} style={[styles.line, pad]}>
            <Pressable onPress={() => onToggle(b, !b.checked)} hitSlop={8} style={[styles.box, b.checked ? { backgroundColor: c.acc, borderColor: c.acc } : { borderColor: c.t3 }]}>
              {b.checked ? <NxIcon name="check" size={13} color="#fff" strokeWidth={2.6} /> : null}
            </Pressable>
            {field(b, style)}
          </View>
        );
      case 'toggle':
        return (
          <View key={b.id} style={[styles.line, { gap: 8 }, pad]}>
            <View style={{ height: 26, justifyContent: 'center' }}>
              <NxIcon name="chev_r" size={14} color={c.t2} strokeWidth={2} />
            </View>
            {field(b, { ...style, fontWeight: '500' })}
          </View>
        );
      case 'quote':
        return (
          <View key={b.id} style={[{ borderLeftWidth: 3, borderLeftColor: c.t1, paddingLeft: 14, marginVertical: 4 }, pad]}>
            {field(b, style)}
          </View>
        );
      case 'callout':
        return (
          <View key={b.id} style={[styles.line, { backgroundColor: c.sunk, borderRadius: 8, padding: 12 }, pad]}>
            <Text style={nxType.body}>{str(p.icon) || '💡'}</Text>
            {field(b, style)}
          </View>
        );
      default:
        return (
          <View key={b.id} style={[styles.line, pad, b.type.includes('header') && { marginTop: 8 }]}>
            {field(b, style, b.type === 'text' ? 'Type something' : ' ')}
          </View>
        );
    }
  });

  const canUpload = !!spaceId && !!pageId;
  const ready = (sources ?? []).filter((s) => s.status === 'ready');
  const label = { fontSize: 14, color: c.t3 } as const;
  const tile = (key: string, props: TileProps) => <Tile key={key} width={tileW} {...props} />;

  const basic: React.ReactNode[] = [
    tile('text', { icon: 'aa', label: 'Text', onPress: () => addTextBlock('text') }),
    tile('heading', { icon: 'hash', label: 'Heading', onPress: () => addTextBlock('sub_header') }),
    tile('bulleted', { icon: 'bullets', label: 'Bulleted list', onPress: () => addTextBlock('bulleted_list') }),
    tile('todo', { icon: 'checklist', label: 'To-do list', onPress: () => addTextBlock('to_do') }),
    tile('toggle', { icon: 'chev_r', label: 'Toggle list', onPress: () => addTextBlock('toggle') }),
    tile('page', {
      icon: 'compose',
      label: 'Page',
      onPress: () => {
        onAddBlock('page', lastFocused.current);
        hideToolbar();
      },
    }),
    onRecord
      ? tile('recording', {
          icon: 'mic',
          label: 'Recording',
          onPress: () => {
            hideToolbar();
            onRecord();
          },
        })
      : null,
    onFlashcards
      ? tile('flashcards', {
          icon: 'cards',
          label: 'Flashcards',
          onPress: () => {
            hideToolbar();
            onFlashcards();
          },
        })
      : null,
  ];
  const media: React.ReactNode[] = [
    canUpload ? tile('file', { icon: 'file', label: 'File', disabled: !!busy, onPress: () => void attach('file') }) : null,
    canUpload ? tile('image', { icon: 'image', label: 'Image', disabled: !!busy, onPress: () => void attach('image') }) : null,
    canUpload ? tile('pdf', { icon: 'notes', label: 'PDF', disabled: !!busy, onPress: () => void attach('pdf') }) : null,
    canUpload ? tile('audio', { icon: 'mic', label: 'Audio', disabled: !!busy, onPress: () => void attach('audio') }) : null,
    canUpload ? tile('video', { icon: 'play', label: 'Video', disabled: !!busy, onPress: () => void attach('video') }) : null,
    tile('embed', { icon: 'globe', label: 'Web embed', onPress: () => openSheet({ kind: 'link', embed: true }) }),
    tile('bookmark', { icon: 'link', label: 'Bookmark', onPress: () => openSheet({ kind: 'link', embed: false }) }),
    sources ? tile('sources', { icon: 'clip', label: 'From sources', onPress: () => setPanel('sources') }) : null,
  ];

  const status = busy ? (
    <View style={styles.status}>
      <ActivityIndicator size="small" color={c.t3} />
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: c.t2 }}>
        {busy}
      </Text>
    </View>
  ) : notice ? (
    <Text style={{ fontSize: 14, lineHeight: 20, color: c.danger }}>{notice}</Text>
  ) : null;

  const panelBody =
    panel === 'add' ? (
      <ScrollView ref={addScroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 90 }}>
        {status}
        <Text style={label}>Basic blocks</Text>
        <View style={styles.grid}>{basic}</View>
        <View
          style={{ gap: 10, paddingTop: 8 }}
          onLayout={(e) => {
            mediaY.current = e.nativeEvent.layout.y;
            if (addFromRef.current === 'image') addScroll.current?.scrollTo({ y: mediaY.current, animated: false });
          }}
        >
          <Text style={label}>Media</Text>
          <View style={styles.grid}>{media}</View>
        </View>
      </ScrollView>
    ) : panel === 'style' ? (
      <View style={{ gap: 10 }}>
        <Text style={label}>Text style</Text>
        <View style={styles.grid}>
          {STYLES.map((s) => tile(s.key, { glyph: s.glyph, glyphStyle: s.style, label: s.label, on: styleOn(s.key), onPress: () => applyStyle(s.key) }))}
        </View>
        <Text style={{ fontSize: 13, lineHeight: 18, color: c.t3 }}>Styles the words you selected, or the whole line when nothing is selected.</Text>
      </View>
    ) : panel === 'turn' ? (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 20 }}>
        <Text style={label}>Turn into</Text>
        <View style={styles.grid}>
          {TURN.map((t) => tile(t.type, { icon: t.icon, glyph: t.glyph, label: t.label, on: target()?.type === t.type, onPress: () => turnInto(t.type) }))}
        </View>
      </ScrollView>
    ) : panel === 'sources' ? (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 20 }}>
        <Pressable onPress={() => setPanel('add')} style={styles.back} accessibilityRole="button" accessibilityLabel="Back to Media">
          <NxIcon name="chev_l" size={16} color={c.t3} />
          <Text style={label}>From sources</Text>
        </Pressable>
        {ready.length === 0 ? (
          <Text style={{ fontSize: 15, lineHeight: 22, color: c.t2 }}>This page has no ready sources yet. Add one in the Sources tab.</Text>
        ) : (
          ready.map((s) => (
            <FileEmbed
              key={s.id}
              name={s.name}
              mime={s.mime}
              bytes={s.bytes}
              onPress={() => {
                const block = sourceEmbed(s);
                onAddBlock(block.type, lastFocused.current, block.props);
                closePanel();
              }}
            />
          ))
        )}
      </ScrollView>
    ) : null;

  const toolColor = (on: boolean) => (on ? c.t1 : c.t2);
  const block = target();
  const filteredPages = (pages ?? []).filter((pg) => pg.id !== pageId && (pg.title || 'Untitled').toLowerCase().includes(sheetText.trim().toLowerCase())).slice(0, 50);

  return (
    <View style={{ gap: 2 }}>
      {body}

      {engaged && !sheet ? (
        <FullWindowOverlay>
          <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
            {panel ? (
              <Animated.View entering={FadeIn.duration(160)} style={[styles.panel, { height: panelH, backgroundColor: c.sunk, borderColor: c.ln }]}>
                {panel !== 'add' && status ? <View style={{ marginBottom: 8 }}>{status}</View> : null}
                {panelBody}
              </Animated.View>
            ) : null}
            <Animated.View style={[styles.toolbarWrap, toolbarStyle]}>
              <View style={[styles.toolbar, { backgroundColor: c.card, borderColor: c.ring }]}>
                <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={styles.tools}>
                  {onAsk ? (
                    <Tool
                      label="Ask Nemesis about this note"
                      onPress={() => {
                        Keyboard.dismiss();
                        setPanel(null);
                        onAsk();
                      }}
                    >
                      <NxIcon name="mark" size={18} color={c.t1} />
                    </Tool>
                  ) : null}
                  <Tool label="Add a block" on={panel === 'add' && addFrom === 'plus'} onPress={() => openAdd('plus')}>
                    <NxIcon name="plus" size={20} color={toolColor(panel === 'add' && addFrom === 'plus')} />
                  </Tool>
                  <Tool label="Text style" on={panel === 'style'} onPress={() => (panel === 'style' ? closePanel() : openPanel('style'))}>
                    <NxIcon name="aa" size={20} color={toolColor(panel === 'style')} />
                  </Tool>
                  {onRecord ? (
                    <Animated.View style={[styles.tool, micStyle]}>
                      <Pressable onPress={record} accessibilityRole="button" accessibilityLabel="Record" style={styles.toolHit}>
                        <NxIcon name="mic" size={20} color={micOn ? c.acc : c.t2} />
                      </Pressable>
                    </Animated.View>
                  ) : null}
                  <Tool label="Add a file or link" on={panel === 'add' && addFrom === 'image'} onPress={() => openAdd('image')}>
                    <NxIcon name="image" size={20} color={toolColor(panel === 'add' && addFrom === 'image')} />
                  </Tool>
                  {onTurnInto ? (
                    <Tool label="Turn into" on={panel === 'turn'} onPress={() => (panel === 'turn' ? closePanel() : openPanel('turn'))}>
                      <NxIcon name="turn" size={20} color={toolColor(panel === 'turn')} />
                    </Tool>
                  ) : null}
                  <Tool label="Undo" disabled={undoDepth === 0} onPress={undo}>
                    <NxIcon name="undo" size={20} color={c.t2} />
                  </Tool>
                  {spaceId ? (
                    <Tool label="Comment on this line" onPress={() => openSheet({ kind: 'comment' })}>
                      <NxIcon name="comment" size={20} color={c.t2} />
                    </Tool>
                  ) : null}
                  {pages ? (
                    <Tool label="Mention a page" onPress={() => openSheet({ kind: 'mention' })}>
                      <NxIcon name="at" size={20} color={c.t2} />
                    </Tool>
                  ) : null}
                </ScrollView>
                <View style={[styles.divider, { backgroundColor: c.ln }]} />
                <Pressable
                  onPress={() => (panel ? closePanel() : Keyboard.dismiss())}
                  style={styles.kbd}
                  accessibilityRole="button"
                  accessibilityLabel={panel ? 'Close the panel' : 'Hide the keyboard'}
                >
                  <NxIcon name={panel ? 'xcirc' : 'kbd_down'} size={21} color={c.t2} />
                </Pressable>
              </View>
            </Animated.View>
          </View>
        </FullWindowOverlay>
      ) : null}

      <EditorSheet
        visible={sheet?.kind === 'link'}
        title={sheet?.kind === 'link' && sheet.embed ? 'Web embed' : 'Bookmark'}
        onClose={() => closeSheet(true)}
      >
        <TextInput
          value={sheetText}
          onChangeText={(t) => {
            setSheetText(t);
            setSheetError(null);
          }}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="Paste a link"
          placeholderTextColor={c.t3}
          returnKeyType="done"
          onSubmitEditing={() => sheet?.kind === 'link' && submitLink(sheet.embed)}
          style={[styles.input, { backgroundColor: c.sunk, color: c.t1 }]}
        />
        {sheetError ? <Text style={[styles.sheetError, { color: c.danger }]}>{sheetError}</Text> : null}
        <NxButton
          label={sheet?.kind === 'link' && sheet.embed ? 'Embed link' : 'Create bookmark'}
          disabled={!sheetText.trim()}
          onPress={() => sheet?.kind === 'link' && submitLink(sheet.embed)}
        />
      </EditorSheet>

      <EditorSheet visible={sheet?.kind === 'mention'} title="Mention a page" onClose={() => closeSheet(true)}>
        <TextInput
          value={sheetText}
          onChangeText={setSheetText}
          autoFocus
          placeholder="Search pages"
          placeholderTextColor={c.t3}
          style={[styles.input, { backgroundColor: c.sunk, color: c.t1 }]}
        />
        <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
          {filteredPages.length === 0 ? (
            <Text style={{ fontSize: 15, color: c.t2, paddingVertical: 12 }}>No pages match.</Text>
          ) : (
            filteredPages.map((pg) => (
              <Pressable
                key={pg.id}
                onPress={() => mention(pg.id)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.pageRow, pressed && { backgroundColor: c.soft }]}
              >
                {pg.icon ? <Text style={{ fontSize: 17, width: 22, textAlign: 'center' }}>{pg.icon}</Text> : <NxIcon name="notes" size={19} color={c.t2} />}
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, color: c.t1 }}>
                  {pg.title || 'Untitled'}
                </Text>
              </Pressable>
            ))
          )}
        </ScrollView>
      </EditorSheet>

      <EditorSheet visible={sheet?.kind === 'comment'} title="Comment" onClose={() => closeSheet(true)}>
        {block ? (
          <Text numberOfLines={2} style={{ fontSize: 14, lineHeight: 20, color: c.t2, borderLeftWidth: 3, borderLeftColor: c.ln, paddingLeft: 10 }}>
            {plainOf(drafts[block.id] ?? serverSegs(block), titleOf) || 'This line'}
          </Text>
        ) : null}
        <TextInput
          value={sheetText}
          onChangeText={setSheetText}
          autoFocus
          multiline
          placeholder="Add a comment"
          placeholderTextColor={c.t3}
          style={[styles.input, { backgroundColor: c.sunk, color: c.t1, height: undefined, minHeight: 88, paddingTop: 12, textAlignVertical: 'top' }]}
        />
        {sheetError ? <Text style={[styles.sheetError, { color: c.danger }]}>{sheetError}</Text> : null}
        <NxButton label={sheetBusy ? 'Saving' : 'Comment'} disabled={sheetBusy || !sheetText.trim()} onPress={() => void postComment()} />
      </EditorSheet>
    </View>
  );
}

function Tool({ label, on, disabled, onPress, children }: { label: string; on?: boolean; disabled?: boolean; onPress: () => void; children: React.ReactNode }) {
  const c = useNx();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!on, disabled: !!disabled }}
      style={({ pressed }) => [styles.tool, on ? { backgroundColor: c.sel } : pressed ? { backgroundColor: c.soft } : null, disabled && { opacity: 0.35 }]}
    >
      {children}
    </Pressable>
  );
}

type TileProps = { icon?: NxIconName; glyph?: string; glyphStyle?: TextStyle; label: string; on?: boolean; disabled?: boolean; onPress: () => void };

function Tile({ icon, glyph, glyphStyle, label, on, disabled, onPress, width }: TileProps & { width: number }) {
  const c = useNx();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!on, disabled: !!disabled }}
      style={({ pressed }) => [styles.tile, { width, backgroundColor: on ? c.sel : c.card, borderColor: c.ln }, pressed && { opacity: 0.7 }, disabled && { opacity: 0.4 }]}
    >
      <View style={styles.tileIcon}>
        {icon ? <NxIcon name={icon} size={19} color={c.t2} /> : <Text style={[{ fontSize: 15, fontWeight: '600', color: c.t2 }, glyphStyle]}>{glyph}</Text>}
      </View>
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, fontWeight: '500', color: c.t1 }}>
        {label}
      </Text>
      {on ? <NxIcon name="check" size={16} color={c.t2} /> : null}
    </Pressable>
  );
}

function EditorSheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  const c = useNx();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.dim }]} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: c.bg, paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.sheetHead}>
            <Text style={{ flex: 1, fontSize: 17, fontWeight: '600', color: c.t1 }}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
              <NxIcon name="x" size={20} color={c.t2} />
            </Pressable>
          </View>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function textStyle(type: string, color: string): TextStyle {
  switch (type) {
    case 'header':
      return { fontSize: 24, lineHeight: 32, fontWeight: '700', color };
    case 'sub_header':
      return { ...nxType.h2, color };
    case 'sub_sub_header':
    case 'header_4':
      return { fontSize: 17, lineHeight: 24, fontWeight: '600', color };
    default:
      return { ...nxType.body, color };
  }
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', gap: 10 },
  box: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, marginTop: 4, alignItems: 'center', justifyContent: 'center' },
  toolbarWrap: { position: 'absolute', left: 12, right: 12, bottom: 0 },
  toolbar: {
    height: 48,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#2a1c00',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
  tools: { alignItems: 'center', gap: 2, paddingLeft: 6, paddingRight: 4 },
  tool: { width: 40, height: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  toolHit: { width: 40, height: 38, alignItems: 'center', justifyContent: 'center' },
  divider: { width: 1, height: 24 },
  kbd: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 34,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, columnGap: 12 },
  tile: { height: 44, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 },
  tileIcon: { width: 22, alignItems: 'center' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 24 },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, paddingHorizontal: 16, gap: 12 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', minHeight: 28 },
  sheetError: { fontSize: 14, lineHeight: 20 },
  input: { height: 48, borderRadius: 10, paddingHorizontal: 14, fontSize: 16 },
  pageRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 6, borderRadius: 10 },
});
