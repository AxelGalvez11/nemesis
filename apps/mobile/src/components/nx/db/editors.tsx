/**
 * The sheets a database opens: editing one cell (text, number, link, select, multi-select, date), picking from a list
 * (row menu, view menu, property pickers), adding a view (the owner's 3x3 grid), adding a property, renaming.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { newId } from '@/api/spaceWrite';
import type { DbRow, SchemaProp, SelectOption, ViewType } from '@/api/database';
import { useNx } from '@/theme/nx';
import { NxIcon, type NxIconName } from '../NxIcon';
import { NxButton } from '../primitives';
import { MONTHS, NEW_PROP_TYPES, OPT_COLORS, isoDate, monthDays, optionOf, parseIso, PROP_ICON, VIEW_TYPES } from './logic';
import { DbSheet, OptionPill, SectionLabel, SheetRow } from './shared';

/** Keeps the last non-null value, so a sheet still has its content while it slides away. */
export function useLast<T>(value: T | null): T | null {
  const ref = useRef<T | null>(value);
  if (value) ref.current = value;
  return ref.current;
}

// ── Cell editor ─────────────────────────────────────────────────────────────────────────────────────────────────────
export type CellTarget = { row: DbRow; pid: string; prop: SchemaProp };

export function CellEditorSheet({
  target,
  onClose,
  onSave,
  onSaveProp,
  onOpenRow,
}: {
  target: CellTarget | null;
  onClose: () => void;
  onSave: (row: DbRow, values: Record<string, unknown>) => void;
  onSaveProp: (pid: string, prop: SchemaProp) => void;
  onOpenRow: (row: DbRow) => void;
}) {
  const shown = useLast(target);
  const t = shown?.prop.type;
  const title = shown ? shown.prop.name || 'Property' : '';
  return (
    <DbSheet visible={!!target} title={title} onClose={onClose}>
      {shown ? (
        t === 'select' || t === 'status' || t === 'multi_select' ? (
          <SelectBody key={shown.row.id + shown.pid} target={shown} onSave={onSave} onSaveProp={onSaveProp} onClose={onClose} />
        ) : t === 'date' ? (
          <DateBody key={shown.row.id + shown.pid} target={shown} onSave={onSave} onClose={onClose} />
        ) : (
          <TextBody key={shown.row.id + shown.pid} target={shown} onSave={onSave} onClose={onClose} onOpenRow={onOpenRow} />
        )
      ) : null}
    </DbSheet>
  );
}

function TextBody({ target, onSave, onClose, onOpenRow }: { target: CellTarget; onSave: CellEditorProps['onSave']; onClose: () => void; onOpenRow: (row: DbRow) => void }) {
  const c = useNx();
  const { row, pid, prop } = target;
  const isTitle = prop.type === 'title';
  const initial = isTitle ? row.title : row[pid] === undefined || row[pid] === null ? '' : String(row[pid]);
  const [text, setText] = useState(initial);
  const [bad, setBad] = useState(false);
  const save = () => {
    if (isTitle) onSave(row, { title: text.trim() });
    else if (prop.type === 'number') {
      const trimmed = text.trim();
      if (trimmed && !Number.isFinite(Number(trimmed))) {
        setBad(true);
        return;
      }
      onSave(row, { [pid]: trimmed ? Number(trimmed) : null });
    } else onSave(row, { [pid]: text.trim() ? text.trim() : null });
    onClose();
  };
  const link = prop.type === 'url' && /^https?:\/\//i.test(text.trim()) ? text.trim() : null;
  return (
    <>
      <TextInput
        value={text}
        onChangeText={(v) => {
          setText(v);
          setBad(false);
        }}
        autoFocus
        multiline={prop.type === 'text'}
        placeholder={isTitle ? 'Untitled' : 'Empty'}
        placeholderTextColor={c.t3}
        keyboardType={prop.type === 'number' ? 'decimal-pad' : prop.type === 'url' ? 'url' : prop.type === 'email' ? 'email-address' : prop.type === 'phone_number' ? 'phone-pad' : 'default'}
        autoCapitalize={prop.type === 'url' || prop.type === 'email' ? 'none' : 'sentences'}
        returnKeyType="done"
        onSubmitEditing={save}
        style={[styles.input, { backgroundColor: c.sunk, color: c.t1 }, prop.type === 'text' && { minHeight: 88, paddingTop: 12, textAlignVertical: 'top' }]}
      />
      {bad ? <Text style={{ fontSize: 14, color: c.danger }}>Type a number, like 12 or 3.5.</Text> : null}
      <NxButton label="Save" onPress={save} />
      {isTitle ? (
        <SheetRow
          icon="open_out"
          label="Open page"
          onPress={() => {
            onClose();
            setTimeout(() => onOpenRow(row), 300);
          }}
        />
      ) : null}
      {link ? <SheetRow icon="globe" label="Open link" onPress={() => void Linking.openURL(link).catch(() => undefined)} /> : null}
    </>
  );
}

type CellEditorProps = { onSave: (row: DbRow, values: Record<string, unknown>) => void };

function SelectBody({ target, onSave, onSaveProp, onClose }: { target: CellTarget; onSave: CellEditorProps['onSave']; onSaveProp: (pid: string, prop: SchemaProp) => void; onClose: () => void }) {
  const c = useNx();
  const { row, pid, prop } = target;
  const multi = prop.type === 'multi_select';
  const start = row[pid];
  const [cur, setCur] = useState<string[]>(Array.isArray(start) ? start.filter((x): x is string => typeof x === 'string') : typeof start === 'string' && start ? [start] : []);
  const [options, setOptions] = useState<SelectOption[]>(prop.options ?? []);
  const [q, setQ] = useState('');
  const query = q.trim();
  const list = options.filter((o) => !query || o.value.toLowerCase().includes(query.toLowerCase()));
  const exact = options.find((o) => o.value.toLowerCase() === query.toLowerCase());

  const choose = (value: string) => {
    if (multi) {
      const next = cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value];
      setCur(next);
      onSave(row, { [pid]: next.length ? next : null });
    } else {
      const next = cur[0] === value ? null : value;
      setCur(next ? [next] : []);
      onSave(row, { [pid]: next });
      onClose();
    }
  };
  const create = () => {
    if (!query) return;
    if (exact) {
      setQ('');
      choose(exact.value);
      return;
    }
    const opt: SelectOption = { id: newId(), value: query, color: OPT_COLORS[options.length % OPT_COLORS.length] };
    const nextOptions = [...options, opt];
    setOptions(nextOptions);
    onSaveProp(pid, { ...prop, options: nextOptions });
    setQ('');
    choose(opt.value);
  };

  return (
    <>
      {cur.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {cur.map((v) => (
            <Pressable key={v} onPress={() => choose(v)} accessibilityRole="button" accessibilityLabel={`Remove ${v}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <OptionPill option={optionOf({ ...prop, options }, v) ?? { value: v, color: 'default' }} />
              <NxIcon name="x" size={14} color={c.t3} />
            </Pressable>
          ))}
        </View>
      ) : null}
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search or create an option"
        placeholderTextColor={c.t3}
        returnKeyType="done"
        onSubmitEditing={create}
        style={[styles.input, { backgroundColor: c.sunk, color: c.t1 }]}
      />
      <SectionLabel>{options.length ? 'Select an option or create one' : 'Type a name above to create the first option'}</SectionLabel>
      <View>
        {list.map((o) => (
          <SheetRow key={o.value} label="" lead={<View style={{ flex: 1 }}><OptionPill option={o} /></View>} selected={cur.includes(o.value)} onPress={() => choose(o.value)} />
        ))}
        {query && !exact ? (
          <SheetRow
            label=""
            lead={
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 15, color: c.t2 }}>Create</Text>
                <OptionPill option={{ value: query, color: OPT_COLORS[options.length % OPT_COLORS.length] }} />
              </View>
            }
            onPress={create}
          />
        ) : null}
      </View>
      {multi ? <NxButton label="Done" onPress={onClose} /> : null}
    </>
  );
}

function DateBody({ target, onSave, onClose }: { target: CellTarget; onSave: CellEditorProps['onSave']; onClose: () => void }) {
  const { row, pid } = target;
  const value = typeof row[pid] === 'string' ? (row[pid] as string) : undefined;
  const pick = (iso: string | null) => {
    onSave(row, { [pid]: iso });
    onClose();
  };
  return (
    <>
      <MonthGrid value={value} onPick={pick} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <NxButton label="Today" onPress={() => pick(isoDate(new Date()))} />
        </View>
        {value ? (
          <View style={{ flex: 1 }}>
            <NxButton label="Clear" onPress={() => pick(null)} />
          </View>
        ) : null}
      </View>
    </>
  );
}

/** A month of days to tap, with previous and next month (no native date picker is installed). */
export function MonthGrid({ value, onPick }: { value?: string; onPick: (iso: string) => void }) {
  const c = useNx();
  const base = value ? parseIso(value) : new Date();
  const [month, setMonth] = useState({ y: base.getFullYear(), m: base.getMonth() });
  const today = isoDate(new Date());
  const days = monthDays(month.y, month.m);
  const step = (n: number) => setMonth(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 }));
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.monthHead}>
        <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: c.t1 }}>
          {MONTHS[month.m]} {month.y}
        </Text>
        <Pressable onPress={() => step(-1)} hitSlop={8} style={styles.navBtn} accessibilityRole="button" accessibilityLabel="Previous month">
          <NxIcon name="chev_l" size={18} color={c.t2} />
        </Pressable>
        <Pressable onPress={() => step(1)} hitSlop={8} style={styles.navBtn} accessibilityRole="button" accessibilityLabel="Next month">
          <NxIcon name="chev_r" size={18} color={c.t2} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 12, color: c.t3 }}>
            {d}
          </Text>
        ))}
      </View>
      {[0, 1, 2, 3, 4, 5].map((w) => (
        <View key={w} style={{ flexDirection: 'row' }}>
          {days.slice(w * 7, w * 7 + 7).map((d) => {
            const iso = isoDate(d);
            const sel = iso === value;
            const out = d.getMonth() !== month.m;
            return (
              <Pressable key={iso} onPress={() => onPick(iso)} style={styles.dayCell} accessibilityRole="button" accessibilityLabel={iso} accessibilityState={{ selected: sel }}>
                <View style={[styles.dayDot, sel ? { backgroundColor: c.acc } : iso === today ? { borderWidth: 1, borderColor: c.acc } : null]}>
                  <Text style={{ fontSize: 15, color: sel ? '#fff' : out ? c.t3 : c.t1, fontWeight: iso === today ? '600' : '400' }}>{d.getDate()}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ── Picker ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export type PickerItem = { key: string; label: string; icon?: NxIconName; detail?: string; selected?: boolean; danger?: boolean };
export type PickerSpec = { title: string; items: PickerItem[]; onPick: (key: string) => void };

/** A list of choices. The sheet closes first, then the choice runs, so a choice may open another sheet. */
export function PickerSheet({ spec, onClose }: { spec: PickerSpec | null; onClose: () => void }) {
  const shown = useLast(spec);
  return (
    <DbSheet visible={!!spec} title={shown?.title ?? ''} onClose={onClose}>
      <View>
        {(shown?.items ?? []).map((it) => (
          <SheetRow
            key={it.key}
            icon={it.icon}
            label={it.label}
            detail={it.detail}
            selected={it.selected}
            danger={it.danger}
            onPress={() => {
              const run = shown!.onPick;
              onClose();
              setTimeout(() => run(it.key), 320);
            }}
          />
        ))}
      </View>
    </DbSheet>
  );
}

// ── Add a view ──────────────────────────────────────────────────────────────────────────────────────────────────────
export function AddViewSheet({ visible, onClose, onCreate }: { visible: boolean; onClose: () => void; onCreate: (type: ViewType, name: string) => void }) {
  const c = useNx();
  const { width } = useWindowDimensions();
  const [type, setType] = useState<ViewType>('table');
  const [name, setName] = useState('');
  useEffect(() => {
    if (visible) {
      setType('table');
      setName('');
    }
  }, [visible]);
  const label = VIEW_TYPES.find((v) => v.type === type)?.label ?? 'Table';
  const tileW = Math.floor((width - 32 - 20) / 3);
  return (
    <DbSheet visible={visible} title="Add a view" onClose={onClose}>
      <View style={styles.viewGrid}>
        {VIEW_TYPES.map((v) => {
          const on = v.type === type;
          return (
            <Pressable
              key={v.type}
              onPress={() => setType(v.type)}
              accessibilityRole="button"
              accessibilityLabel={v.label}
              accessibilityState={{ selected: on }}
              style={({ pressed }) => [
                styles.viewTile,
                { width: tileW, backgroundColor: c.card, borderColor: on ? c.acc : c.ln, borderWidth: on ? 2 : 1 },
                pressed && { opacity: 0.75 },
              ]}
            >
              <NxIcon name={v.icon} size={24} color={on ? c.acc : c.t1} />
              <Text style={{ fontSize: 14, fontWeight: '500', color: on ? c.acc : c.t1 }}>{v.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={label}
        placeholderTextColor={c.t3}
        returnKeyType="done"
        onSubmitEditing={() => onCreate(type, name.trim() || label)}
        style={[styles.input, { backgroundColor: c.sunk, color: c.t1 }]}
        accessibilityLabel="View name"
      />
      <NxButton label="Create" onPress={() => onCreate(type, name.trim() || label)} />
    </DbSheet>
  );
}

// ── Add a property ──────────────────────────────────────────────────────────────────────────────────────────────────
export type NewPropSpec = { type: string; name: string; options?: SelectOption[]; then?: (pid: string) => void };

export function AddPropertySheet({ spec, onClose, onAdd }: { spec: NewPropSpec | null; onClose: () => void; onAdd: (spec: NewPropSpec) => void }) {
  const c = useNx();
  const shown = useLast(spec);
  const [type, setType] = useState('text');
  const [name, setName] = useState('');
  useEffect(() => {
    if (spec) {
      setType(spec.type);
      setName(spec.name);
    }
  }, [spec]);
  const label = NEW_PROP_TYPES.find((p) => p.type === type)?.label ?? 'Text';
  const add = () => {
    if (!shown) return;
    onAdd({ ...shown, type, name: name.trim() || label, options: type === shown.type ? shown.options : undefined });
  };
  return (
    <DbSheet visible={!!spec} title="Add a property" onClose={onClose}>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={label}
        placeholderTextColor={c.t3}
        returnKeyType="done"
        onSubmitEditing={add}
        style={[styles.input, { backgroundColor: c.sunk, color: c.t1 }]}
        accessibilityLabel="Property name"
      />
      <SectionLabel>Type</SectionLabel>
      <View>
        {NEW_PROP_TYPES.map((p) => (
          <SheetRow key={p.type} icon={PROP_ICON[p.type] ?? 'aa'} label={p.label} selected={p.type === type} onPress={() => setType(p.type)} />
        ))}
      </View>
      <NxButton label="Add property" onPress={add} />
    </DbSheet>
  );
}

// ── Rename ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export type PromptSpec = { title: string; initial: string; placeholder: string; action: string; onSubmit: (text: string) => void };

export function PromptSheet({ spec, onClose }: { spec: PromptSpec | null; onClose: () => void }) {
  const c = useNx();
  const shown = useLast(spec);
  const [text, setText] = useState('');
  useEffect(() => {
    if (spec) setText(spec.initial);
  }, [spec]);
  const submit = () => {
    if (!shown) return;
    shown.onSubmit(text.trim());
    onClose();
  };
  return (
    <DbSheet visible={!!spec} title={shown?.title ?? ''} onClose={onClose}>
      <TextInput
        value={text}
        onChangeText={setText}
        autoFocus
        placeholder={shown?.placeholder}
        placeholderTextColor={c.t3}
        returnKeyType="done"
        onSubmitEditing={submit}
        style={[styles.input, { backgroundColor: c.sunk, color: c.t1 }]}
      />
      <NxButton label={shown?.action ?? 'Save'} onPress={submit} />
    </DbSheet>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 48, borderRadius: 10, paddingHorizontal: 14, fontSize: 16 },
  monthHead: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36 },
  navBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  dayCell: { flex: 1, height: 42, alignItems: 'center', justifyContent: 'center' },
  dayDot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  viewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  viewTile: { height: 84, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 8 },
});
