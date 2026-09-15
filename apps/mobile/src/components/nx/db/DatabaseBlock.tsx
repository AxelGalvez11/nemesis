/**
 * A database inside a note: its title, a strip of saved views (+ to add one) and the active view, reading and writing
 * the same records the web's Space app does (see api/database.ts for the shapes).
 *
 * `block` is the note's `page` block that links the database page (`block.pageId`), or, on the database page itself,
 * `{ id: <database page id> }`. The database's collection, views and rows belong to its own page, so they are loaded
 * here under the same query key the page screen uses (`['ws-page', id]`).
 *
 * Every change shows at once (the cached page is patched), is written through ws_apply, then the page is reloaded so
 * edits made on the web a moment earlier appear too.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addProperty as apiAddProperty,
  addRow as apiAddRow,
  addView as apiAddView,
  databaseFrom,
  deleteRow as apiDeleteRow,
  deleteView as apiDeleteView,
  ensureRowPage,
  formatWithColumn,
  freePropId,
  loadDatabase,
  newViewProps,
  setDatabaseTitle,
  setRowValues,
  setSchemaProp,
  setViewProps,
  type DbRow,
  type DbView,
  type SchemaProp,
  type ViewType,
} from '@/api/database';
import type { LoadedPage, SpaceRecord } from '@/api/space';
import { newId } from '@/api/spaceWrite';
import { useNx } from '@/theme/nx';
import { NxIcon } from '../NxIcon';
import { nxHaptic } from '../motion';
import { SkelBar, SkelGroup } from '../Skeleton';
import { AddPropertySheet, AddViewSheet, CellEditorSheet, PickerSheet, PromptSheet, useLast, type CellTarget, type NewPropSpec, type PickerItem, type PickerSpec, type PromptSpec } from './editors';
import { PROP_ICON, blank, fmtDate, keysOfType, seedFromFilters, titleKey, viewIcon, viewName, viewRows, VIEW_TYPES } from './logic';
import { DbSheet, SheetRow } from './shared';
import { BoardView, CalendarView, ChartView, FeedView, GalleryView, ListView, MapView, TableView, TimelineView, boardGroupProp, type DbActions, type RowMenuOpts, type ViewProps } from './views';

export type DatabaseBlockProps = {
  spaceId: string;
  /** The page the block sits on (the note). */
  pageId: string;
  block: { id: string; pageId?: string };
  /** The note's loaded records. Not needed to draw (the database loads its own page); accepted for callers that have them. */
  records?: SpaceRecord[];
  canEdit: boolean;
  /** Something the note shows changed (the database's title). */
  onChanged?: () => void;
};

type Patch = (l: LoadedPage) => LoadedPage;
const PAUSE = 320;

export function DatabaseBlock({ spaceId, pageId, block, canEdit, onChanged }: DatabaseBlockProps) {
  const c = useNx();
  const router = useRouter();
  const qc = useQueryClient();
  const dbPageId = block.pageId ?? block.id;
  const key = useMemo(() => ['ws-page', dbPageId], [dbPageId]);
  const q = useQuery({ queryKey: key, queryFn: () => loadDatabase(dbPageId), enabled: !!dbPageId });
  const db = useMemo(() => (q.data ? databaseFrom(q.data) : null), [q.data]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cell, setCell] = useState<CellTarget | null>(null);
  const [picker, setPicker] = useState<PickerSpec | null>(null);
  const [addViewOpen, setAddViewOpen] = useState(false);
  const [newProp, setNewProp] = useState<NewPropSpec | null>(null);
  const [prompt, setPrompt] = useState<PromptSpec | null>(null);
  const [day, setDay] = useState<{ iso: string | null; pid: string } | null>(null);
  const dayShown = useLast(day);

  const editable = canEdit && (db?.role === 'edit' || db?.role === 'full');
  const view: DbView = db?.views.find((v) => v.id === activeId) ?? db?.views[0] ?? { id: '', type: 'table', props: {} };
  const rows = useMemo(() => (db ? viewRows(db, view) : []), [db, view]);

  // ── Writing ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const run = useCallback(
    async (optimistic: Patch | null, remote: () => Promise<unknown>, notify = false) => {
      setError(null);
      if (optimistic) {
        await qc.cancelQueries({ queryKey: key });
        qc.setQueryData<LoadedPage>(key, (old) => (old ? optimistic(old) : old));
      }
      try {
        await remote();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That change did not save. Check your connection and try again.');
      } finally {
        void qc.invalidateQueries({ queryKey: key });
        if (notify) onChanged?.();
      }
    },
    [qc, key, onChanged],
  );

  if (q.isLoading) return <DatabaseSkeleton />;
  if (!db) {
    return (
      <View style={[styles.box, { borderColor: c.ln }]}>
        <Text style={{ fontSize: 15, color: c.t2 }}>{q.error ? 'This database could not be loaded.' : 'This page is not a database.'}</Text>
        {q.error ? (
          <Pressable onPress={() => void q.refetch()} accessibilityRole="button">
            <Text style={{ fontSize: 15, color: c.acc }}>Try again</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const cid = db.collectionId;
  const lastRow = db.rowIds.length ? db.rowIds[db.rowIds.length - 1]! : null;

  const setValues = (row: DbRow, values: Record<string, unknown>) => void run((l) => withProps(l, row.id, values), () => setRowValues(spaceId, row.id, values));

  const addRow = (values: Record<string, unknown> = {}) => {
    const id = newId();
    const seeded: Record<string, unknown> = { ...seedFromFilters(view, db.schema) };
    for (const [k, v] of Object.entries(values)) if (v !== null && v !== undefined) seeded[k] = v;
    const rec: SpaceRecord = { id, kind: 'row', type: '', parent_id: cid, page_id: db.pageId, props: { title: '', ...seeded }, alive: true, edited_at: new Date().toISOString() };
    void run((l) => withList(withRecord(l, rec), cid, 'rows', [id, lastRow]), () => apiAddRow(spaceId, cid, seeded, lastRow, id));
  };

  const openRow = async (row: DbRow) => {
    setError(null);
    try {
      const pid = await ensureRowPage(spaceId, db, row);
      router.push({ pathname: '/page/[id]', params: { id: pid } });
    } catch {
      setError(editable ? 'This row could not be opened. Try again.' : 'This row has no page yet. Someone who can edit the database has to open it first.');
    }
  };

  const editCell = (row: DbRow, pid: string, prop?: SchemaProp) => {
    const p = prop ?? db.schema[pid];
    if (!p || !editable) return;
    if (p.type === 'checkbox') setValues(row, { [pid]: !row[pid] });
    else setCell({ row, pid, prop: p });
  };

  const setView = (set: Record<string, unknown>) => {
    if (!view.id) return;
    void run((l) => withProps(l, view.id, set), () => setViewProps(spaceId, view.id, set));
  };

  const saveProp = (pid: string, prop: SchemaProp) => void run((l) => withProps(l, cid, { [`s:${pid}`]: prop }), () => setSchemaProp(spaceId, cid, pid, prop));

  const addProperty = (spec: NewPropSpec) => {
    setNewProp(null);
    const pid = freePropId(db.schema);
    const prop: SchemaProp = { name: spec.name, type: spec.type, ...(spec.type === 'select' || spec.type === 'multi_select' ? { options: (spec.options ?? []).map((o) => ({ id: newId(), ...o })) } : {}) };
    const target = view.id ? view : undefined;
    void run(
      (l) => {
        let next = withProps(l, cid, { [`s:${pid}`]: prop });
        if (target) next = withProps(next, target.id, { format: formatWithColumn(target, db.schema, pid) });
        return next;
      },
      () => apiAddProperty(spaceId, cid, prop, db.schema, target, pid),
    ).then(() => spec.then?.(pid));
  };

  const pickProperty = (title: string, field: string, types: string[], newName: string) => {
    const items: PickerItem[] = keysOfType(db.schema, types).map((pid) => ({ key: pid, label: db.schema[pid]!.name || 'Untitled', icon: PROP_ICON[db.schema[pid]!.type] ?? 'aa', selected: view.props[field] === pid }));
    if (editable) items.push({ key: '__new', label: `New ${newName} property`, icon: 'plus' });
    setPicker({
      title,
      items,
      onPick: (k) => {
        if (k === '__new') setNewProp({ type: types[0]!, name: newName, then: (pid) => setView({ [field]: pid }) });
        else setView({ [field]: k });
      },
    });
  };

  const deleteRow = (row: DbRow) => {
    Alert.alert('Delete this row?', 'It is removed for everyone who can open this database.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void run((l) => withList(without(l, row.id), cid, 'rows', undefined, row.id), () => apiDeleteRow(spaceId, cid, row.id)) },
    ]);
  };

  const rowMenu = (row: DbRow, opts: RowMenuOpts = {}) => {
    const items: PickerItem[] = [{ key: 'open', label: 'Open page', icon: 'open_out' }];
    if (editable) {
      items.push({ key: 'rename', label: 'Rename', icon: 'compose' });
      if (opts.movePid && db.schema[opts.movePid]) {
        const prop = db.schema[opts.movePid]!;
        const cur = row[opts.movePid];
        for (const o of prop.options ?? []) items.push({ key: `move:${o.value}`, label: `Move to ${o.value}`, icon: 'turn', selected: cur === o.value });
        items.push({ key: 'move:', label: `Move to No ${prop.name}`, icon: 'turn', selected: blank(cur) });
      }
      if (opts.datePid && db.schema[opts.datePid]) {
        const dp = opts.datePid;
        items.push({ key: 'date', label: 'Change start date', icon: 'calendar', detail: typeof row[dp] === 'string' ? fmtDate(row[dp] as string) : undefined });
        if (opts.endDate) items.push({ key: 'end', label: 'Change end date', icon: 'calendar', detail: typeof row[`${dp}_end`] === 'string' ? fmtDate(row[`${dp}_end`] as string) : undefined });
      }
      items.push({ key: 'delete', label: 'Delete', icon: 'trash', danger: true });
    }
    setPicker({
      title: row.title || 'Untitled',
      items,
      onPick: (k) => {
        if (k === 'open') void openRow(row);
        else if (k === 'rename') editCell(row, titleKey(db.schema) ?? 'title');
        else if (k.startsWith('move:') && opts.movePid) setValues(row, { [opts.movePid]: k.slice(5) || null });
        else if (k === 'date' && opts.datePid) editCell(row, opts.datePid);
        else if (k === 'end' && opts.datePid) editCell(row, `${opts.datePid}_end`, { name: 'End date', type: 'date' });
        else if (k === 'delete') deleteRow(row);
      },
    });
  };

  const createView = (type: ViewType, name: string, base: DbView | undefined = view.id ? view : undefined) => {
    setAddViewOpen(false);
    const id = newId();
    const props = newViewProps(db, type, name, base);
    const last = db.viewIds.length ? db.viewIds[db.viewIds.length - 1]! : null;
    const rec: SpaceRecord = { id, kind: 'view', type, parent_id: db.pageId, page_id: db.pageId, props, alive: true, edited_at: new Date().toISOString() };
    setActiveId(id);
    void run((l) => withList(withRecord(l, rec), db.pageId, 'views', [id, last]), () => apiAddView(spaceId, db, type, name, base, id));
  };

  const viewMenu = (v: DbView) => {
    const items: PickerItem[] = [{ key: 'rename', label: 'Rename view', icon: 'compose' }];
    const propName = (field: string) => {
      const k = v.props[field];
      return typeof k === 'string' && db.schema[k] ? db.schema[k]!.name : undefined;
    };
    if (v.type === 'board') items.push({ key: 'group_by', label: 'Group by', icon: 'board', detail: db.schema[boardGroupProp(db, v) ?? '']?.name });
    if (v.type === 'calendar') items.push({ key: 'calendar_by', label: 'Show calendar by', icon: 'calendar', detail: propName('calendar_by') });
    if (v.type === 'timeline') items.push({ key: 'timeline_by', label: 'Show timeline by', icon: 'timeline', detail: propName('timeline_by') });
    if (v.type === 'chart') {
      items.push({ key: 'chartX', label: 'What to show', icon: 'chart', detail: propName('chartX') });
      items.push({ key: 'type:bar', label: 'Bar chart', icon: 'chart', selected: v.props.chartType !== 'donut' && v.props.chartType !== 'number' });
      items.push({ key: 'type:donut', label: 'Donut chart', icon: 'donut', selected: v.props.chartType === 'donut' });
    }
    if (v.type === 'map') items.push({ key: 'map_by', label: 'Show places from', icon: 'pin', detail: propName('map_by') });
    items.push({ key: 'duplicate', label: 'Duplicate view', icon: 'copy' });
    if (db.views.length > 1) items.push({ key: 'delete', label: 'Delete view', icon: 'trash', danger: true });
    setPicker({
      title: viewName(v),
      items,
      onPick: (k) => {
        if (k === 'rename') {
          setPrompt({ title: 'Rename view', initial: viewName(v), placeholder: 'View name', action: 'Save', onSubmit: (t) => t && void run((l) => withProps(l, v.id, { name: t }), () => setViewProps(spaceId, v.id, { name: t })) });
        } else if (k === 'group_by') pickProperty('Group by', 'group_by', ['select', 'status'], 'Status');
        else if (k === 'calendar_by') pickProperty('Show calendar by', 'calendar_by', ['date'], 'Date');
        else if (k === 'timeline_by') pickProperty('Show timeline by', 'timeline_by', ['date'], 'Date');
        else if (k === 'chartX') pickProperty('What to show', 'chartX', ['select', 'multi_select', 'status'], 'Category');
        else if (k === 'map_by') pickProperty('Show places from', 'map_by', ['text'], 'Place');
        else if (k.startsWith('type:')) setView({ chartType: k.slice(5) });
        else if (k === 'duplicate') createView(v.type, `${viewName(v)} (1)`, v);
        else if (k === 'delete') {
          Alert.alert(`Delete ${viewName(v)}?`, 'The rows stay. Only this way of showing them goes away.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => {
                setActiveId(null);
                void run((l) => withList(without(l, v.id), db.pageId, 'views', undefined, v.id), () => apiDeleteView(spaceId, db.pageId, v.id));
              },
            },
          ]);
        }
      },
    });
  };

  const renameDatabase = () =>
    setPrompt({
      title: 'Rename database',
      initial: db.title,
      placeholder: 'New database',
      action: 'Save',
      onSubmit: (t) => void run((l) => withProps(l, db.pageId, { title: t }), () => setDatabaseTitle(spaceId, db.pageId, t), true),
    });

  const actions: DbActions = {
    editable,
    openRow: (r) => void openRow(r),
    editCell,
    setValues,
    addRow,
    rowMenu,
    setView,
    pickProperty,
    addProperty: (type, name, then, options) => setNewProp({ type, name, then, options }),
    showDay: (iso, pid) => setDay({ iso, pid }),
  };

  const selectView = (id: string) => {
    nxHaptic('selection');
    setActiveId(id);
  };

  const props: ViewProps = { db, view, rows, a: actions };
  const body =
    view.type === 'board' ? <BoardView {...props} />
    : view.type === 'list' ? <ListView {...props} />
    : view.type === 'gallery' ? <GalleryView {...props} />
    : view.type === 'calendar' ? <CalendarView {...props} />
    : view.type === 'timeline' ? <TimelineView {...props} />
    : view.type === 'chart' ? <ChartView {...props} />
    : view.type === 'feed' ? <FeedView {...props} />
    : view.type === 'map' ? <MapView {...props} />
    : <TableView {...props} />;

  const dayRows = dayShown ? rows.filter((r) => (dayShown.iso ? typeof r[dayShown.pid] === 'string' && (r[dayShown.pid] as string).slice(0, 10) === dayShown.iso : blank(r[dayShown.pid]))) : [];
  const knownType = VIEW_TYPES.some((t) => t.type === view.type);

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <NxIcon name="table" size={18} color={c.t2} />
        <Pressable disabled={!editable} onPress={renameDatabase} style={{ flex: 1 }} accessibilityRole={editable ? 'button' : 'text'} accessibilityLabel={editable ? 'Rename database' : undefined}>
          <Text numberOfLines={1} style={{ fontSize: 18, fontWeight: '600', color: db.title ? c.t1 : c.t3 }}>
            {db.title || 'New database'}
          </Text>
        </Pressable>
        {block.pageId && block.pageId !== pageId ? (
          <Pressable onPress={() => router.push({ pathname: '/page/[id]', params: { id: dbPageId } })} hitSlop={8} accessibilityRole="button" accessibilityLabel="Open as a full page">
            <NxIcon name="open_out" size={18} color={c.t2} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {db.views.map((v) => {
          const on = v.id === view.id;
          return (
            <Pressable
              key={v.id}
              onPress={() => (on ? editable && viewMenu(v) : selectView(v.id))}
              onLongPress={() => editable && viewMenu(v)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityHint={on && editable ? 'Opens this view’s settings' : undefined}
              style={({ pressed }) => [styles.tab, on && { backgroundColor: c.sel }, pressed && !on && { backgroundColor: c.soft }]}
            >
              <NxIcon name={viewIcon(v.type)} size={16} color={on ? c.t1 : c.t2} />
              <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '500', color: on ? c.t1 : c.t2, maxWidth: 140 }}>
                {viewName(v)}
              </Text>
              {on && editable ? <NxIcon name="chev_d" size={12} color={c.t3} /> : null}
            </Pressable>
          );
        })}
        {editable ? (
          <Pressable onPress={() => setAddViewOpen(true)} accessibilityRole="button" accessibilityLabel="Add a view" style={({ pressed }) => [styles.tabAdd, pressed && { backgroundColor: c.soft }]}>
            <NxIcon name="plus" size={17} color={c.t2} />
          </Pressable>
        ) : null}
      </ScrollView>

      {error ? <Text style={{ fontSize: 14, color: c.danger }}>{error}</Text> : null}
      {!knownType ? <Text style={{ fontSize: 13, color: c.t3 }}>This view type is shown as a table on the phone.</Text> : null}

      <Animated.View key={view.id || 'none'} entering={FadeIn.duration(180)}>
        {body}
      </Animated.View>

      <CellEditorSheet target={cell} onClose={() => setCell(null)} onSave={setValues} onSaveProp={saveProp} onOpenRow={(r) => void openRow(r)} />
      <PickerSheet spec={picker} onClose={() => setPicker(null)} />
      <AddViewSheet visible={addViewOpen} onClose={() => setAddViewOpen(false)} onCreate={(type, name) => createView(type, name)} />
      <AddPropertySheet spec={newProp} onClose={() => setNewProp(null)} onAdd={addProperty} />
      <PromptSheet spec={prompt} onClose={() => setPrompt(null)} />
      <DbSheet visible={!!day} title={dayShown ? (dayShown.iso ? fmtDate(dayShown.iso) : `No ${db.schema[dayShown.pid]?.name ?? 'date'}`) : ''} onClose={() => setDay(null)}>
        <View>
          {dayRows.map((r) => (
            <SheetRow
              key={r.id}
              icon="notes"
              label={r.title || 'Untitled'}
              onPress={() => {
                setDay(null);
                setTimeout(() => void openRow(r), PAUSE);
              }}
            />
          ))}
          {dayRows.length === 0 ? <Text style={{ fontSize: 15, color: c.t2, paddingVertical: 8 }}>Nothing here yet.</Text> : null}
        </View>
        {editable && dayShown?.iso ? <SheetRow icon="plus" label="New on this day" onPress={() => addRow({ [dayShown.pid]: dayShown.iso })} /> : null}
      </DbSheet>
    </View>
  );
}

function DatabaseSkeleton() {
  return (
    <SkelGroup style={{ gap: 12, paddingVertical: 8 }}>
      <SkelBar width="46%" height={18} radius={5} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <SkelBar width={78} height={28} radius={8} />
        <SkelBar width={66} height={28} radius={8} />
        <SkelBar width={28} height={28} radius={8} />
      </View>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
          <SkelBar width="38%" height={14} />
          <SkelBar width="26%" height={14} />
          <SkelBar width="18%" height={14} />
        </View>
      ))}
    </SkelGroup>
  );
}

// ── Patching the cached page ────────────────────────────────────────────────────────────────────────────────────────
function merge(props: Record<string, unknown>, set: Record<string, unknown>): Record<string, unknown> {
  const out = { ...props };
  for (const [k, v] of Object.entries(set)) {
    if (v === null || v === undefined) delete out[k];
    else out[k] = v;
  }
  return out;
}

function withProps(l: LoadedPage, id: string, set: Record<string, unknown>): LoadedPage {
  const f = (r: SpaceRecord) => (r.id === id ? { ...r, props: merge(r.props, set) } : r);
  return { ...l, page: f(l.page), records: l.records.map(f) };
}

function withRecord(l: LoadedPage, rec: SpaceRecord): LoadedPage {
  return { ...l, records: [...l.records.filter((r) => r.id !== rec.id), rec] };
}

function without(l: LoadedPage, id: string): LoadedPage {
  return { ...l, records: l.records.filter((r) => r.id !== id) };
}

/** The same list rule as ws_list_apply: removals first, then each insert after its anchor (null = front, missing = end). */
function withList(l: LoadedPage, id: string, field: string, ins?: [string, string | null], del?: string): LoadedPage {
  const rec = l.page.id === id ? l.page : l.records.find((r) => r.id === id);
  let list = Array.isArray(rec?.props[field]) ? (rec!.props[field] as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  if (del) list = list.filter((x) => x !== del);
  if (ins) {
    const [item, after] = ins;
    list = list.filter((x) => x !== item);
    if (after === null) list = [item, ...list];
    else {
      const at = list.indexOf(after);
      list = at < 0 ? [...list, item] : [...list.slice(0, at + 1), item, ...list.slice(at + 1)];
    }
  }
  return withProps(l, id, { [field]: list });
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginVertical: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  tabs: { gap: 4, alignItems: 'center', paddingRight: 8 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 10, borderRadius: 8 },
  tabAdd: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  box: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 8, marginVertical: 10 },
});
