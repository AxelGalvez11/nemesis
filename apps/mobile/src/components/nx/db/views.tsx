/**
 * The nine database views. Each reads the rows a view shows (logic.ts viewRows) and acts through `DbActions`, which
 * DatabaseBlock implements with real writes.
 */
import React, { useMemo, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useQueries, useQuery } from '@tanstack/react-query';
import Svg, { G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { rowPageLines, type Database, type DbRow, type DbView, type SchemaProp } from '@/api/database';
import { embedUrl } from '@/api/noteMedia';
import { useNx } from '@/theme/nx';
import { NxIcon } from '../NxIcon';
import {
  EDITABLE,
  MONTHS,
  PROP_ICON,
  WEEKDAYS,
  blank,
  chartSeries,
  columnsOf,
  datePropOf,
  dayDiff,
  isoDate,
  keysOfType,
  monthDays,
  optionColor,
  parseIso,
  shiftIso,
  valueText,
  type Column,
} from './logic';
import { EmptyView, NewRowButton, PressScale, ValuePills } from './shared';

export type RowMenuOpts = { movePid?: string; datePid?: string; endDate?: boolean };

export type DbActions = {
  editable: boolean;
  openRow: (row: DbRow) => void;
  /** Opens the editor for a cell; a checkbox flips at once. `prop` stands in for a field the schema lacks (an end date). */
  editCell: (row: DbRow, pid: string, prop?: SchemaProp) => void;
  setValues: (row: DbRow, values: Record<string, unknown>) => void;
  addRow: (values?: Record<string, unknown>) => void;
  rowMenu: (row: DbRow, opts?: RowMenuOpts) => void;
  /** Sets fields on the view being shown. */
  setView: (set: Record<string, unknown>) => void;
  /** Lets the student choose which property a view reads (`field` on the view), or make a new one of `types[0]`. */
  pickProperty: (title: string, field: string, types: string[], newName: string) => void;
  addProperty: (type: string, name: string, then?: (pid: string) => void, options?: { value: string; color: string }[]) => void;
  /** Rows on one day (or with no date when `iso` is null). */
  showDay: (iso: string | null, pid: string) => void;
};

export type ViewProps = { db: Database; view: DbView; rows: DbRow[]; a: DbActions };

const hair = StyleSheet.hairlineWidth;

function CellValue({ col, row }: { col: Column; row: DbRow }) {
  const c = useNx();
  const v = col.prop.type === 'title' ? row.title : row[col.pid];
  if (col.prop.type === 'select' || col.prop.type === 'status' || col.prop.type === 'multi_select') return <ValuePills prop={col.prop} value={v} max={2} />;
  if (col.prop.type === 'checkbox') {
    return (
      <View style={[styles.check, v ? { backgroundColor: c.acc, borderColor: c.acc } : { borderColor: c.t3 }]}>
        {v ? <NxIcon name="check" size={12} color="#fff" strokeWidth={2.6} /> : null}
      </View>
    );
  }
  const text = valueText(col.prop, v, row);
  return (
    <Text numberOfLines={1} style={{ fontSize: 14, color: col.prop.type === 'url' ? c.acc : c.t1 }}>
      {text}
    </Text>
  );
}

/** Up to `max` non-title properties that have a value, as small chips or grey text. */
function PropChips({ db, view, row, skip, max = 2 }: { db: Database; view: DbView; row: DbRow; skip?: string; max?: number }) {
  const c = useNx();
  const cols = columnsOf(db, view).filter((col) => col.prop.type !== 'title' && col.pid !== skip && col.prop.type !== 'checkbox' && !blank(row[col.pid]));
  if (!cols.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {cols.slice(0, max).map((col) =>
        col.prop.type === 'select' || col.prop.type === 'status' || col.prop.type === 'multi_select' ? (
          <ValuePills key={col.pid} prop={col.prop} value={row[col.pid]} max={2} />
        ) : (
          <Text key={col.pid} numberOfLines={1} style={{ fontSize: 13, color: c.t2, maxWidth: 160 }}>
            {valueText(col.prop, row[col.pid], row)}
          </Text>
        ),
      )}
    </View>
  );
}

// ── Table ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const ROW_H = 44;
const HEAD_H = 36;
const TITLE_W = 156;

export function TableView({ db, view, rows, a }: ViewProps) {
  const c = useNx();
  const cols = columnsOf(db, view);
  const titleCol = cols.find((x) => x.prop.type === 'title');
  const rest = cols.filter((x) => x !== titleCol);

  const header = (col: Column) => (
    <View key={col.pid} style={[styles.th, { width: col.width, borderColor: c.ln }]}>
      <NxIcon name={PROP_ICON[col.prop.type] ?? 'aa'} size={14} color={c.t3} />
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: c.t2 }}>
        {col.prop.name}
      </Text>
    </View>
  );

  return (
    <View style={{ borderTopWidth: hair, borderBottomWidth: hair, borderColor: c.ln }}>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: TITLE_W, borderRightWidth: hair, borderColor: c.ln, backgroundColor: c.bg }}>
          <View style={[styles.th, { width: TITLE_W, borderColor: c.ln }]}>
            <NxIcon name="aa" size={14} color={c.t3} />
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: c.t2 }}>
              {titleCol?.prop.name ?? 'Name'}
            </Text>
          </View>
          {rows.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => a.openRow(r)}
              onLongPress={() => a.rowMenu(r)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${r.title || 'Untitled'}`}
              style={({ pressed }) => [styles.td, { width: TITLE_W, borderColor: c.ln, gap: 6 }, pressed && { backgroundColor: c.soft }]}
            >
              <NxIcon name="notes" size={15} color={c.t3} />
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, fontWeight: '500', color: r.title ? c.t1 : c.t3 }}>
                {r.title || 'Untitled'}
              </Text>
            </Pressable>
          ))}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
          <View>
            <View style={{ flexDirection: 'row' }}>
              {rest.map(header)}
              {a.editable ? (
                <Pressable
                  onPress={() => a.addProperty('text', '')}
                  accessibilityRole="button"
                  accessibilityLabel="Add a property"
                  style={({ pressed }) => [styles.th, { width: 48, justifyContent: 'center', borderColor: c.ln }, pressed && { backgroundColor: c.soft }]}
                >
                  <NxIcon name="plus" size={16} color={c.t2} />
                </Pressable>
              ) : null}
            </View>
            {rows.map((r) => (
              <View key={r.id} style={{ flexDirection: 'row' }}>
                {rest.map((col) => {
                  const can = a.editable && EDITABLE.has(col.prop.type);
                  return (
                    <Pressable
                      key={col.pid}
                      disabled={!can}
                      onPress={() => a.editCell(r, col.pid)}
                      accessibilityRole={can ? 'button' : undefined}
                      accessibilityLabel={`${col.prop.name}: ${valueText(col.prop, r[col.pid], r) || 'Empty'}`}
                      style={({ pressed }) => [styles.td, { width: col.width, borderColor: c.ln }, pressed && { backgroundColor: c.sel }]}
                    >
                      <CellValue col={col} row={r} />
                    </Pressable>
                  );
                })}
                {a.editable ? <View style={[styles.td, { width: 48, borderColor: c.ln }]} /> : null}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
      {rows.length === 0 ? <Text style={{ fontSize: 14, color: c.t3, paddingVertical: 12, paddingHorizontal: 8 }}>No rows in this view yet.</Text> : null}
      {a.editable ? <NewRowButton onPress={() => a.addRow()} /> : null}
    </View>
  );
}

// ── Board ───────────────────────────────────────────────────────────────────────────────────────────────────────────
export function boardGroupProp(db: Database, view: DbView): string | undefined {
  const g = view.props.group_by;
  if (typeof g === 'string' && ['select', 'status'].includes(db.schema[g]?.type ?? '')) return g;
  return keysOfType(db.schema, ['status'])[0] ?? keysOfType(db.schema, ['select'])[0];
}

const STARTER_OPTIONS = [
  { value: 'Not started', color: 'gray' },
  { value: 'In progress', color: 'blue' },
  { value: 'Done', color: 'green' },
];

export function BoardView({ db, view, rows, a }: ViewProps) {
  const c = useNx();
  const dark = useColorScheme() === 'dark';
  const gp = boardGroupProp(db, view);
  if (!gp) {
    return (
      <EmptyView
        text="A board sorts rows into columns by a Select property. This database has none yet."
        action={a.editable ? 'Add a Status property' : undefined}
        onAction={() => a.addProperty('select', 'Status', (pid) => a.setView({ group_by: pid }), STARTER_OPTIONS)}
      />
    );
  }
  const prop = db.schema[gp]!;
  const options = prop.options ?? [];
  const known = new Set(options.map((o) => o.value));
  const none = rows.filter((r) => typeof r[gp] !== 'string' || !known.has(r[gp] as string));
  const groups = [
    ...(none.length ? [{ key: '', value: null as string | null, label: `No ${prop.name}`, color: undefined as string | undefined, rows: none }] : []),
    ...options.map((o) => ({ key: o.value, value: o.value as string | null, label: o.value, color: o.color, rows: rows.filter((r) => r[gp] === o.value) })),
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 8 }}>
      {groups.map((g) => {
        const tint = g.value ? optionColor(g.color, dark).bg : c.soft;
        return (
          <View key={g.key || '__none'} style={[styles.boardCol, { backgroundColor: tint }]}>
            <View style={styles.boardHead}>
              {g.value ? (
                <ValuePills prop={prop} value={g.value} />
              ) : (
                <Text style={{ fontSize: 14, fontWeight: '500', color: c.t2 }}>{g.label}</Text>
              )}
              <Text style={{ fontSize: 13, color: c.t3 }}>{g.rows.length}</Text>
              <View style={{ flex: 1 }} />
              {a.editable ? (
                <Pressable onPress={() => a.addRow({ [gp]: g.value })} hitSlop={8} accessibilityRole="button" accessibilityLabel={`New in ${g.label}`}>
                  <NxIcon name="plus" size={17} color={c.t2} />
                </Pressable>
              ) : null}
            </View>
            {g.rows.map((r) => (
              <PressScale key={r.id} onPress={() => a.openRow(r)} onLongPress={() => a.rowMenu(r, { movePid: gp })} label={`Open ${r.title || 'Untitled'}`} style={[styles.card, { backgroundColor: c.card, borderColor: c.ln }]}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                  <Text numberOfLines={3} style={{ flex: 1, fontSize: 15, fontWeight: '500', color: r.title ? c.t1 : c.t3 }}>
                    {r.title || 'Untitled'}
                  </Text>
                  <Pressable onPress={() => a.rowMenu(r, { movePid: gp })} hitSlop={10} accessibilityRole="button" accessibilityLabel="Card actions">
                    <NxIcon name="dots" size={18} color={c.t3} />
                  </Pressable>
                </View>
                <PropChips db={db} view={view} row={r} skip={gp} />
              </PressScale>
            ))}
            {a.editable ? <NewRowButton label="New page" onPress={() => a.addRow({ [gp]: g.value })} /> : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

// ── List ────────────────────────────────────────────────────────────────────────────────────────────────────────────
export function ListView({ db, view, rows, a }: ViewProps) {
  const c = useNx();
  return (
    <View>
      {rows.map((r) => (
        <Pressable
          key={r.id}
          onPress={() => a.openRow(r)}
          onLongPress={() => a.rowMenu(r)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.listRow, { borderColor: c.ln }, pressed && { backgroundColor: c.soft }]}
        >
          <NxIcon name="notes" size={17} color={c.t3} />
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, fontWeight: '500', color: r.title ? c.t1 : c.t3 }}>
            {r.title || 'Untitled'}
          </Text>
          <View style={{ maxWidth: '55%' }}>
            <PropChips db={db} view={view} row={r} />
          </View>
        </Pressable>
      ))}
      {rows.length === 0 ? <Text style={{ fontSize: 14, color: c.t3, paddingVertical: 12 }}>No rows in this view yet.</Text> : null}
      {a.editable ? <NewRowButton label="New page" onPress={() => a.addRow()} /> : null}
    </View>
  );
}

// ── Gallery ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const IMAGE = /\.(png|jpe?g|gif|webp|heic|heif|bmp|tiff?)$/i;

function coverRef(db: Database, row: DbRow): string | null {
  for (const pid of keysOfType(db.schema, ['files'])) {
    const list = row[pid];
    if (!Array.isArray(list)) continue;
    for (const f of list) {
      const file = f as { name?: unknown; ref?: unknown; url?: unknown };
      const ref = typeof file.ref === 'string' ? file.ref : typeof file.url === 'string' ? file.url : null;
      if (ref && (IMAGE.test(String(file.name ?? '')) || IMAGE.test(ref))) return ref;
    }
  }
  return null;
}

function initials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'U';
  return (words[0]![0]! + (words[1]?.[0] ?? '')).toUpperCase();
}

function Cover({ db, row }: { db: Database; row: DbRow }) {
  const c = useNx();
  const ref = coverRef(db, row);
  const url = useQuery({
    queryKey: ['embed-url', ref],
    queryFn: () => (ref && /^https?:/i.test(ref) ? Promise.resolve(ref) : embedUrl(ref!)),
    enabled: !!ref,
    staleTime: 6 * 3600_000,
  });
  if (url.data) return <Image source={{ uri: url.data }} style={styles.cover} resizeMode="cover" />;
  const tints = [c.c1, c.c2, c.c3];
  const tint = tints[row.id.charCodeAt(0) % tints.length]!;
  return (
    <View style={[styles.cover, { backgroundColor: tint, alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ fontSize: 26, fontWeight: '600', color: c.t2 }}>{initials(row.title)}</Text>
    </View>
  );
}

export function GalleryView({ db, view, rows, a }: ViewProps) {
  const c = useNx();
  const [w, setW] = useState(0);
  const cardW = w ? (w - 10) / 2 : 0;
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={styles.gallery}>
      {cardW
        ? rows.map((r) => (
            <PressScale key={r.id} onPress={() => a.openRow(r)} onLongPress={() => a.rowMenu(r)} label={`Open ${r.title || 'Untitled'}`} style={[styles.galCard, { width: cardW, borderColor: c.ln, backgroundColor: c.card }]}>
              <Cover db={db} row={r} />
              <View style={{ padding: 10, gap: 6 }}>
                <Text numberOfLines={2} style={{ fontSize: 15, fontWeight: '500', color: r.title ? c.t1 : c.t3 }}>
                  {r.title || 'Untitled'}
                </Text>
                <PropChips db={db} view={view} row={r} max={1} />
              </View>
            </PressScale>
          ))
        : null}
      {cardW && a.editable ? (
        <Pressable
          onPress={() => a.addRow()}
          accessibilityRole="button"
          accessibilityLabel="New page"
          style={({ pressed }) => [styles.galCard, styles.galNew, { width: cardW, borderColor: c.ln }, pressed && { backgroundColor: c.soft }]}
        >
          <NxIcon name="plus" size={20} color={c.t3} />
          <Text style={{ fontSize: 14, color: c.t3 }}>New page</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ── Calendar ────────────────────────────────────────────────────────────────────────────────────────────────────────
export function CalendarView({ db, view, rows, a }: ViewProps) {
  const c = useNx();
  const dp = datePropOf(view, db.schema);
  const now = new Date();
  const [month, setMonth] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const byDay = useMemo(() => {
    const out: Record<string, DbRow[]> = {};
    if (dp) for (const r of rows) if (typeof r[dp] === 'string') (out[(r[dp] as string).slice(0, 10)] ??= []).push(r);
    return out;
  }, [rows, dp]);
  if (!dp) {
    return (
      <EmptyView
        text="A calendar places rows on the days in a Date property. This database has none yet."
        action={a.editable ? 'Add a Date property' : undefined}
        onAction={() => a.addProperty('date', 'Date', (pid) => a.setView({ calendar_by: pid }))}
      />
    );
  }
  const today = isoDate(now);
  const days = monthDays(month.y, month.m);
  const undated = rows.filter((r) => typeof r[dp] !== 'string' || !r[dp]).length;
  const step = (n: number) => setMonth(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 }));
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.calHead}>
        <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: c.t1 }}>
          {MONTHS[month.m]} {month.y}
        </Text>
        <Pressable onPress={() => step(-1)} hitSlop={6} style={styles.navBtn} accessibilityRole="button" accessibilityLabel="Previous month">
          <NxIcon name="chev_l" size={18} color={c.t2} />
        </Pressable>
        <Pressable onPress={() => setMonth({ y: now.getFullYear(), m: now.getMonth() })} style={[styles.todayBtn, { backgroundColor: c.sel }]} accessibilityRole="button">
          <Text style={{ fontSize: 13, fontWeight: '500', color: c.t1 }}>Today</Text>
        </Pressable>
        <Pressable onPress={() => step(1)} hitSlop={6} style={styles.navBtn} accessibilityRole="button" accessibilityLabel="Next month">
          <NxIcon name="chev_r" size={18} color={c.t2} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {WEEKDAYS.map((d) => (
          <Text key={d} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: c.t3 }}>
            {d}
          </Text>
        ))}
      </View>
      <View style={{ borderTopWidth: hair, borderLeftWidth: hair, borderColor: c.ln }}>
        {[0, 1, 2, 3, 4, 5].map((w) => (
          <View key={w} style={{ flexDirection: 'row' }}>
            {days.slice(w * 7, w * 7 + 7).map((d) => {
              const iso = isoDate(d);
              const items = byDay[iso] ?? [];
              const out = d.getMonth() !== month.m;
              return (
                <Pressable
                  key={iso}
                  onPress={() => a.showDay(iso, dp)}
                  accessibilityRole="button"
                  accessibilityLabel={`${iso}, ${items.length} ${items.length === 1 ? 'row' : 'rows'}`}
                  style={({ pressed }) => [styles.calCell, { borderColor: c.ln }, out && { backgroundColor: c.sunk }, pressed && { backgroundColor: c.sel }]}
                >
                  <View style={[styles.calNum, iso === today && { backgroundColor: c.acc }]}>
                    <Text style={{ fontSize: 12, color: iso === today ? '#fff' : out ? c.t3 : c.t1, fontWeight: iso === today ? '600' : '400' }}>{d.getDate()}</Text>
                  </View>
                  {items.slice(0, 2).map((r) => (
                    <View key={r.id} style={[styles.calChip, { backgroundColor: 'rgba(59,147,240,0.16)' }]}>
                      <Text numberOfLines={1} style={{ fontSize: 10, color: c.t1 }}>
                        {r.title || 'Untitled'}
                      </Text>
                    </View>
                  ))}
                  {items.length > 2 ? <Text style={{ fontSize: 10, color: c.t2, paddingLeft: 2 }}>+{items.length - 2}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      {undated ? (
        <Pressable onPress={() => a.showDay(null, dp)} accessibilityRole="button" style={{ paddingVertical: 6 }}>
          <Text style={{ fontSize: 14, color: c.t2 }}>
            {undated} {undated === 1 ? 'row has' : 'rows have'} no {db.schema[dp]!.name}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ── Timeline ────────────────────────────────────────────────────────────────────────────────────────────────────────
const TL_DAY = 12;
const TL_ROW = 40;
const TL_HEAD = 28;

export function TimelineView({ db, view, rows, a }: ViewProps) {
  const c = useNx();
  const dp = datePropOf(view, db.schema);
  if (!dp) {
    return (
      <EmptyView
        text="A timeline draws rows as bars from their dates. This database has no Date property yet."
        action={a.editable ? 'Add a Date property' : undefined}
        onAction={() => a.addProperty('date', 'Date', (pid) => a.setView({ timeline_by: pid }))}
      />
    );
  }
  const endKey = `${dp}_end`;
  const today = isoDate(new Date());
  const dated = rows.filter((r) => typeof r[dp] === 'string' && /^\d{4}-\d{2}-\d{2}/.test(r[dp] as string));
  const undated = rows.length - dated.length;
  const spans = dated.map((r) => {
    const s = (r[dp] as string).slice(0, 10);
    const e = typeof r[endKey] === 'string' && (r[endKey] as string) >= s ? (r[endKey] as string).slice(0, 10) : s;
    return { r, s, e };
  });
  let first = shiftIso(today, -28);
  let last = shiftIso(today, 84);
  for (const sp of spans) {
    if (sp.s < first) first = sp.s;
    if (sp.e > last) last = sp.e;
  }
  first = shiftIso(first, -parseIso(first).getDay());
  const weeks = Math.ceil((dayDiff(first, last) + 7) / 7);
  const width = weeks * 7 * TL_DAY;
  const todayX = dayDiff(first, today) * TL_DAY + TL_DAY / 2;

  return (
    <View style={{ gap: 6 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentOffset={{ x: Math.max(0, todayX - 90), y: 0 }} style={{ borderTopWidth: hair, borderBottomWidth: hair, borderColor: c.ln }}>
        <View style={{ width, height: TL_HEAD + Math.max(1, spans.length) * TL_ROW + 8 }}>
          {Array.from({ length: weeks }, (_, i) => {
            const d = parseIso(shiftIso(first, i * 7));
            return (
              <View key={i} style={[styles.tlWeek, { left: i * 7 * TL_DAY, width: 7 * TL_DAY, borderColor: c.ln }]}>
                <Text numberOfLines={1} style={{ fontSize: 11, color: c.t3 }}>
                  {MONTHS[d.getMonth()]!.slice(0, 3)} {d.getDate()}
                </Text>
              </View>
            );
          })}
          <View style={[styles.tlNow, { left: todayX, backgroundColor: c.danger }]} />
          {spans.map(({ r, s, e }, i) => {
            const left = dayDiff(first, s) * TL_DAY + 1;
            const w = Math.max(TL_DAY - 2, (dayDiff(s, e) + 1) * TL_DAY - 2);
            return (
              <Pressable
                key={r.id}
                onPress={() => a.openRow(r)}
                onLongPress={() => a.rowMenu(r, { datePid: dp, endDate: true })}
                accessibilityRole="button"
                accessibilityLabel={`${r.title || 'Untitled'}, ${s}${e !== s ? ` to ${e}` : ''}`}
                style={{ position: 'absolute', top: TL_HEAD + i * TL_ROW + 6, left, flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                <View style={[styles.tlBar, { width: w, backgroundColor: c.card, borderColor: c.acc }]} />
                <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '500', color: c.t1, maxWidth: 220 }}>
                  {r.title || 'Untitled'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      {spans.length === 0 ? <Text style={{ fontSize: 14, color: c.t3 }}>No rows have a {db.schema[dp]!.name} yet.</Text> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {a.editable ? <NewRowButton onPress={() => a.addRow({ [dp]: today })} /> : null}
        {undated ? (
          <Pressable onPress={() => a.showDay(null, dp)} accessibilityRole="button">
            <Text style={{ fontSize: 14, color: c.t2 }}>
              {undated} without a {db.schema[dp]!.name}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {a.editable && spans.length ? <Text style={{ fontSize: 12, color: c.t3 }}>Press and hold a bar to change its dates.</Text> : null}
    </View>
  );
}

// ── Chart ───────────────────────────────────────────────────────────────────────────────────────────────────────────
export function ChartView({ db, view, rows, a }: ViewProps) {
  const c = useNx();
  const dark = useColorScheme() === 'dark';
  const [w, setW] = useState(0);
  const { pid, cats } = chartSeries(db, view, rows);
  if (!pid) {
    return (
      <EmptyView
        text="A chart counts rows by a Select or Multi-select property. This database has none yet."
        action={a.editable ? 'Add a Select property' : undefined}
        onAction={() => a.addProperty('select', 'Category', (p) => a.setView({ chartX: p }))}
      />
    );
  }
  const type = view.props.chartType === 'donut' ? 'donut' : view.props.chartType === 'number' ? 'number' : 'bar';
  const colorOf = (cat: { color?: string; none?: boolean }) => (cat.none ? c.t3 : optionColor(cat.color, dark).dot);
  const max = Math.max(1, ...cats.map((x) => x.n));
  const total = cats.reduce((s, x) => s + x.n, 0);

  const segment = (label: string, value: string) => {
    const on = type === value;
    return (
      <Pressable
        key={value}
        disabled={!a.editable}
        onPress={() => a.setView({ chartType: value })}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        style={[styles.seg, on && { backgroundColor: c.card, borderColor: c.ln, borderWidth: hair }]}
      >
        <Text style={{ fontSize: 13, fontWeight: '500', color: on ? c.t1 : c.t2 }}>{label}</Text>
      </Pressable>
    );
  };

  let body: React.ReactNode = null;
  if (w && type === 'bar') {
    const LABEL = 108;
    const COUNT = 34;
    const bar = Math.max(24, w - LABEL - COUNT);
    body = (
      <Svg width={w} height={cats.length * 34 + 4}>
        {cats.map((cat, i) => {
          const y = i * 34;
          const bw = cat.n ? Math.max(4, (cat.n / max) * bar) : 0;
          const name = cat.name.length > 15 ? `${cat.name.slice(0, 14)}…` : cat.name;
          return (
            <G key={cat.name + i}>
              <SvgText x={0} y={y + 22} fontSize={13} fill={c.t2}>
                {name}
              </SvgText>
              <Line x1={LABEL} x2={LABEL} y1={y + 4} y2={y + 30} stroke={c.ln} strokeWidth={1} />
              {bw ? <Rect x={LABEL} y={y + 8} width={bw} height={18} rx={4} fill={colorOf(cat)} /> : null}
              <SvgText x={LABEL + bw + 6} y={y + 22} fontSize={13} fill={c.t1}>
                {String(cat.n)}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    );
  } else if (w && type === 'donut') {
    const size = Math.min(w, 220);
    const cx = size / 2;
    const R = size / 2 - 6;
    const r0 = R * 0.62;
    let ang = -Math.PI / 2;
    const arcs = cats
      .filter((x) => x.n > 0)
      .map((cat, i) => {
        const a1 = ang + (cat.n / Math.max(1, total)) * Math.PI * 2 - 1e-4;
        const big = a1 - ang > Math.PI ? 1 : 0;
        const p = (rad: number, t: number) => `${cx + rad * Math.cos(t)} ${cx + rad * Math.sin(t)}`;
        const d = `M${p(R, ang)}A${R} ${R} 0 ${big} 1 ${p(R, a1)}L${p(r0, a1)}A${r0} ${r0} 0 ${big} 0 ${p(r0, ang)}Z`;
        ang = a1 + 1e-4;
        return <Path key={cat.name + i} d={d} fill={colorOf(cat)} />;
      });
    body = (
      <View style={{ alignItems: 'center', gap: 12 }}>
        <View style={{ width: size, height: size }}>
          <Svg width={size} height={size}>
            {arcs}
            <SvgText x={cx} y={cx + 9} fontSize={26} fontWeight="600" fill={c.t1} textAnchor="middle">
              {String(total)}
            </SvgText>
          </Svg>
        </View>
        <View style={{ alignSelf: 'stretch', gap: 6 }}>
          {cats.map((cat, i) => (
            <View key={cat.name + i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colorOf(cat) }} />
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: c.t1 }}>
                {cat.name}
              </Text>
              <Text style={{ fontSize: 14, color: c.t2 }}>{cat.n}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  } else if (type === 'number') {
    body = <Text style={{ fontSize: 44, fontWeight: '600', color: c.t1 }}>{rows.length}</Text>;
  }

  return (
    <View style={{ gap: 12 }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={[styles.segWrap, { backgroundColor: c.sel }]}>
          {segment('Bar', 'bar')}
          {segment('Donut', 'donut')}
        </View>
        <View style={{ flex: 1 }} />
        <Pressable
          disabled={!a.editable}
          onPress={() => a.pickProperty('What to show', 'chartX', ['select', 'multi_select', 'status'], 'Category')}
          accessibilityRole="button"
          style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 4 }, pressed && { opacity: 0.6 }]}
        >
          <Text numberOfLines={1} style={{ fontSize: 14, color: c.t2, maxWidth: 160 }}>
            By {db.schema[pid]!.name}
          </Text>
          {a.editable ? <NxIcon name="chev_d" size={14} color={c.t3} /> : null}
        </Pressable>
      </View>
      {body}
    </View>
  );
}

// ── Feed ────────────────────────────────────────────────────────────────────────────────────────────────────────────
function ago(ms: number | undefined): string {
  if (!ms) return '';
  const m = Math.max(1, Math.floor((Date.now() - ms) / 60000));
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function FeedView({ db, view, rows, a }: ViewProps) {
  const c = useNx();
  const [limit, setLimit] = useState(() => Number(view.props.loadLimit) || 10);
  const shown = rows.slice(0, limit);
  const bodies = useQueries({ queries: shown.map((r) => ({ queryKey: ['db-row-lines', r.id], queryFn: () => rowPageLines(r.id), staleTime: 60_000 })) });
  return (
    <View style={{ gap: 10 }}>
      {shown.map((r, i) => {
        const lines = bodies[i]?.data;
        return (
          <PressScale key={r.id} onPress={() => a.openRow(r)} onLongPress={() => a.rowMenu(r)} label={`Open ${r.title || 'Untitled'}`} style={[styles.feedCard, { borderColor: c.ln, backgroundColor: c.card }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text numberOfLines={2} style={{ flex: 1, fontSize: 17, fontWeight: '600', color: r.title ? c.t1 : c.t3 }}>
                {r.title || 'Untitled'}
              </Text>
              <Text style={{ fontSize: 12, color: c.t3 }}>{ago(r.created)}</Text>
            </View>
            {bodies[i]?.isLoading ? (
              <View style={{ gap: 6 }}>
                <View style={{ height: 10, width: '86%', borderRadius: 4, backgroundColor: c.sel }} />
                <View style={{ height: 10, width: '62%', borderRadius: 4, backgroundColor: c.sel }} />
              </View>
            ) : lines && lines.length ? (
              <Text numberOfLines={4} style={{ fontSize: 15, lineHeight: 22, color: c.t2 }}>
                {lines.join('\n')}
              </Text>
            ) : (
              <Text style={{ fontSize: 14, color: c.t3 }}>Nothing written on this page yet.</Text>
            )}
            <PropChips db={db} view={view} row={r} max={3} />
          </PressScale>
        );
      })}
      {rows.length === 0 ? <Text style={{ fontSize: 14, color: c.t3 }}>No rows in this view yet.</Text> : null}
      {rows.length > limit ? (
        <Pressable onPress={() => setLimit((n) => n + 10)} accessibilityRole="button" style={{ paddingVertical: 8 }}>
          <Text style={{ fontSize: 15, color: c.acc }}>Show {Math.min(10, rows.length - limit)} more</Text>
        </Pressable>
      ) : null}
      {a.editable ? <NewRowButton label="New page" onPress={() => a.addRow()} /> : null}
    </View>
  );
}

// ── Map ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Not a map of tiles (no map library is installed): rows grouped by the place written in a text property. */
export function MapView({ db, view, rows, a }: ViewProps) {
  const c = useNx();
  const own = view.props.map_by;
  const placePid = typeof own === 'string' && db.schema[own]?.type === 'text' ? own : keysOfType(db.schema, ['text'])[0];
  if (!placePid) {
    return (
      <EmptyView
        text="A map groups rows by the place written in a text property. This database has none yet."
        action={a.editable ? 'Add a Place property' : undefined}
        onAction={() => a.addProperty('text', 'Place', (pid) => a.setView({ map_by: pid }))}
      />
    );
  }
  const groups = new Map<string, DbRow[]>();
  const none: DbRow[] = [];
  for (const r of rows) {
    const place = typeof r[placePid] === 'string' ? (r[placePid] as string).trim() : '';
    if (!place) none.push(r);
    else {
      const key = place.toLowerCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
  }
  const sorted = [...groups.values()].sort((x, y) => y.length - x.length || String(x[0]![placePid]).localeCompare(String(y[0]![placePid])));
  const openMaps = (place: string) => {
    const q = encodeURIComponent(place);
    void Linking.openURL(`maps://?q=${q}`).catch(() => Linking.openURL(`https://maps.apple.com/?q=${q}`).catch(() => undefined));
  };
  return (
    <View style={{ gap: 10 }}>
      <Pressable
        disabled={!a.editable}
        onPress={() => a.pickProperty('Show places from', 'map_by', ['text'], 'Place')}
        accessibilityRole="button"
        style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }, pressed && { opacity: 0.6 }]}
      >
        <NxIcon name="pin" size={14} color={c.t3} />
        <Text style={{ fontSize: 14, color: c.t2 }}>Places from {db.schema[placePid]!.name}</Text>
        {a.editable ? <NxIcon name="chev_d" size={14} color={c.t3} /> : null}
      </Pressable>
      {sorted.map((list) => {
        const place = String(list[0]![placePid]).trim();
        return (
          <View key={place.toLowerCase()} style={[styles.placeCard, { borderColor: c.ln, backgroundColor: c.card }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <NxIcon name="pin" size={18} color={c.acc} />
              <Text numberOfLines={2} style={{ flex: 1, fontSize: 16, fontWeight: '600', color: c.t1 }}>
                {place}
              </Text>
              <Text style={{ fontSize: 13, color: c.t3 }}>{list.length}</Text>
            </View>
            {list.map((r) => (
              <Pressable key={r.id} onPress={() => a.openRow(r)} onLongPress={() => a.rowMenu(r)} accessibilityRole="button" style={({ pressed }) => [styles.placeRow, pressed && { backgroundColor: c.soft }]}>
                <NxIcon name="notes" size={15} color={c.t3} />
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: r.title ? c.t1 : c.t3 }}>
                  {r.title || 'Untitled'}
                </Text>
              </Pressable>
            ))}
            <Pressable onPress={() => openMaps(place)} accessibilityRole="button" style={({ pressed }) => [styles.mapsBtn, { backgroundColor: c.sel }, pressed && { opacity: 0.7 }]}>
              <NxIcon name="open_out" size={15} color={c.t1} />
              <Text style={{ fontSize: 14, fontWeight: '500', color: c.t1 }}>Open in Maps</Text>
            </Pressable>
          </View>
        );
      })}
      {none.length ? (
        <View style={[styles.placeCard, { borderColor: c.ln }]}>
          <Text style={{ fontSize: 14, fontWeight: '500', color: c.t2 }}>No place ({none.length})</Text>
          {none.map((r) => (
            <View key={r.id} style={[styles.placeRow, { gap: 8 }]}>
              <Pressable onPress={() => a.openRow(r)} accessibilityRole="button" style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <NxIcon name="notes" size={15} color={c.t3} />
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: r.title ? c.t1 : c.t3 }}>
                  {r.title || 'Untitled'}
                </Text>
              </Pressable>
              {a.editable ? (
                <Pressable onPress={() => a.editCell(r, placePid)} hitSlop={6} accessibilityRole="button">
                  <Text style={{ fontSize: 14, color: c.acc }}>Add place</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
      {rows.length === 0 ? <Text style={{ fontSize: 14, color: c.t3 }}>No rows in this view yet.</Text> : null}
      {a.editable ? <NewRowButton label="New page" onPress={() => a.addRow()} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  th: { height: HEAD_H, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, borderBottomWidth: hair, borderRightWidth: hair },
  td: { height: ROW_H, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, borderBottomWidth: hair, borderRightWidth: hair, overflow: 'hidden' },
  check: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  boardCol: { width: 256, borderRadius: 12, padding: 8, gap: 8, alignSelf: 'flex-start' },
  boardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 30, paddingHorizontal: 2 },
  card: { borderRadius: 10, borderWidth: hair, padding: 10, gap: 8, shadowColor: '#2a1c00', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 4, borderBottomWidth: hair },
  gallery: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  galCard: { borderRadius: 12, borderWidth: hair, overflow: 'hidden' },
  galNew: { minHeight: 140, alignItems: 'center', justifyContent: 'center', gap: 6, borderStyle: 'dashed', borderWidth: 1 },
  cover: { width: '100%', height: 96 },
  calHead: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36 },
  navBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  todayBtn: { height: 28, paddingHorizontal: 10, borderRadius: 8, justifyContent: 'center' },
  calCell: { flex: 1, height: 64, borderRightWidth: hair, borderBottomWidth: hair, padding: 2, gap: 2, overflow: 'hidden' },
  calNum: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  calChip: { borderRadius: 3, paddingHorizontal: 3, paddingVertical: 1 },
  tlWeek: { position: 'absolute', top: 0, bottom: 0, borderLeftWidth: hair, paddingLeft: 4, paddingTop: 6 },
  tlNow: { position: 'absolute', top: TL_HEAD - 4, bottom: 0, width: 1.5 },
  tlBar: { height: 26, borderRadius: 6, borderWidth: 1.5 },
  seg: { height: 28, paddingHorizontal: 12, borderRadius: 7, justifyContent: 'center' },
  segWrap: { flexDirection: 'row', padding: 2, borderRadius: 9 },
  feedCard: { borderRadius: 12, borderWidth: hair, padding: 14, gap: 8 },
  placeCard: { borderRadius: 12, borderWidth: hair, padding: 12, gap: 6 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36, paddingHorizontal: 4, borderRadius: 8 },
  mapsBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', height: 32, paddingHorizontal: 12, borderRadius: 9999, marginTop: 4 },
});
