import { useState } from "react";
import { InputAccessoryView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { GlassSurface } from "./GlassSurface";
import {
  addColumn,
  addRow,
  parseTable,
  removeColumn,
  removeRow,
  serializeTable,
  setCell,
  type MarkdownTable,
} from "@/lib/markdown-table";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Editing a table as a GRID (owner 2026-07-23: "in editing mode the tables
// should not show markdown at all").
//
// The note editor's live-preview rule — every block renders, the block you tap
// shows its raw source — is right for prose and wrong for a table, because in a
// table the pipes and dashes ARE the thing being rendered. Tapping one replaced
// a tidy grid with `| Column | Column |` and asked the student to keep the
// dashes lined up by hand on a phone keyboard. This draws the same cells you
// were already looking at, each one a field you can type in, and writes the
// markdown back out behind the scenes. It matches what the web editor does.
//
// The table is held as LOCAL state, seeded once from the block's markdown,
// rather than re-derived from the parent on every keystroke. That is load
// bearing: markdown table cells are trimmed when they're read back, so a
// re-derived value would swallow the space at the end of "hello " and you could
// never type a second word.

/** Wide enough for a couple of words before the text wraps; the grid scrolls
 *  sideways rather than squeezing columns down to nothing. */
const CELL_WIDTH = 132;
const CELL_MIN_HEIGHT = 40;

export function NoteTableEditor({
  body,
  onChange,
  onInteract,
  accessoryViewID,
  testID,
}: {
  /** The block's markdown, read ONCE — see the note above. */
  body: string;
  /** Fires with the whole block re-serialized, on every keystroke. */
  onChange: (body: string) => void;
  /** Called before any edit so the editor knows the student is still in this
   *  block — otherwise moving between cells reads as leaving it, and the grid
   *  folds back into rendered markdown mid-sentence. */
  onInteract: () => void;
  /** iOS accessory-view id for the cells, so the grid's own +/- controls ride
   *  ABOVE THE KEYBOARD as well as sitting under the table (owner 2026-07-24:
   *  "editing toolbar should always be present when keyboard it up"). With a
   *  cell focused, the inline controls are usually behind the keyboard.
   *
   *  It is deliberately the grid's OWN toolbar and not the note editor's
   *  formatting pill: those buttons write markdown into the block's raw source,
   *  which for a table means dropping `**` in among the pipes the grid exists
   *  to hide. */
  accessoryViewID?: string;
  testID?: string;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  // The caller only mounts this for a block that parses, so the fallback is
  // purely defensive — a one-cell table is still something you can type in.
  const [table, setTable] = useState<MarkdownTable>(
    () => parseTable(body) ?? { align: ["none"], header: [""], rows: [[""]] },
  );

  const commit = (next: MarkdownTable) => {
    onInteract();
    setTable(next);
    onChange(serializeTable(next));
  };

  const columns = table.header.length;

  // One definition, rendered twice (inline and in the keyboard accessory) so
  // the two can never drift apart.
  const sizeControls = (
    <>
      <GridButton label="+ Row" onPress={() => commit(addRow(table))} testID="note-table-add-row" />
      <GridButton label="+ Column" onPress={() => commit(addColumn(table))} testID="note-table-add-column" />
      <GridButton
        label="− Row"
        disabled={table.rows.length === 0}
        onPress={() => commit(removeRow(table, table.rows.length - 1))}
        testID="note-table-remove-row"
      />
      <GridButton
        label="− Column"
        disabled={columns <= 1}
        onPress={() => commit(removeColumn(table, columns - 1))}
        testID="note-table-remove-column"
      />
    </>
  );

  return (
    <View style={styles.wrap} testID={testID ?? "note-table-editor"}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        contentContainerStyle={styles.gridInner}
      >
        <View style={styles.grid}>
          <View style={styles.row}>
            {table.header.map((cell, column) => (
              <TextInput
                key={`h${column}`}
                style={[styles.cell, styles.headerCell]}
                value={cell}
                onChangeText={(value) => commit(setCell(table, -1, column, value))}
                onFocus={onInteract}
                inputAccessoryViewID={Platform.OS === "ios" ? accessoryViewID : undefined}
                placeholder="Column"
                placeholderTextColor={c.text3}
                multiline
                scrollEnabled={false}
                testID={`note-table-header-${column}`}
              />
            ))}
          </View>
          {table.rows.map((cells, row) => (
            <View key={`r${row}`} style={styles.row}>
              {Array.from({ length: columns }, (_, column) => (
                <TextInput
                  key={`c${column}`}
                  style={styles.cell}
                  value={cells[column] ?? ""}
                  onChangeText={(value) => commit(setCell(table, row, column, value))}
                  onFocus={onInteract}
                  inputAccessoryViewID={Platform.OS === "ios" ? accessoryViewID : undefined}
                  multiline
                  scrollEnabled={false}
                  testID={`note-table-cell-${row}-${column}`}
                />
              ))}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Grid size. `−` takes the last row/column: a phone has no room for a
          delete control on every row, and adding one back is a single tap.
          Kept inline as well as in the keyboard accessory below — this is the
          version you use with the keyboard down, and Android's only one. */}
      <View style={styles.controls}>{sizeControls}</View>

      {/* The same controls above the keyboard, for when a cell has the caret
          and the inline row is behind it. */}
      {Platform.OS === "ios" && accessoryViewID ? (
        <InputAccessoryView nativeID={accessoryViewID} backgroundColor="transparent">
          <View style={styles.accessoryRail} pointerEvents="box-none">
            <GlassSurface style={styles.accessoryPill} fallbackColor={c.glassMenu} opaque shadow>
              <View style={styles.accessoryRow}>{sizeControls}</View>
            </GlassSurface>
          </View>
        </InputAccessoryView>
      ) : null}
    </View>
  );
}

function GridButton({
  label,
  onPress,
  disabled,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID: string;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled ?? false }}
      style={({ pressed }) => [styles.gridBtn, pressed && styles.gridBtnPressed, disabled && styles.gridBtnDisabled]}
      testID={testID}
    >
      <Text style={styles.gridBtnLabel}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { marginVertical: space(1) },
    // The keyboard accessory: the same floating glass pill the note toolbar
    // uses, so the two bars are visibly the same kind of thing.
    accessoryRail: { alignItems: "center", paddingBottom: space(2), paddingHorizontal: space(3) },
    accessoryPill: { borderRadius: radius.pill, borderWidth: 1, borderColor: c.line, overflow: "hidden", maxWidth: "100%" },
    accessoryRow: { flexDirection: "row", alignItems: "center", gap: space(1), paddingHorizontal: space(2), paddingVertical: space(1) },
    gridInner: { paddingRight: space(4) },
    grid: { borderWidth: 1, borderColor: c.line, borderRadius: radius.sm, overflow: "hidden" },
    row: { flexDirection: "row" },
    cell: {
      ...type.small,
      color: c.text,
      width: CELL_WIDTH,
      minHeight: CELL_MIN_HEIGHT,
      paddingHorizontal: space(2),
      paddingVertical: space(2),
      // Hairlines between cells only — the grid's own border draws the outside,
      // so a full border per cell would double up along every seam.
      borderLeftWidth: 1,
      borderTopWidth: 1,
      borderColor: c.line,
      textAlignVertical: "top",
    },
    headerCell: { fontWeight: "700", backgroundColor: c.surface },

    controls: { flexDirection: "row", flexWrap: "wrap", gap: space(2), marginTop: space(2) },
    gridBtn: {
      paddingVertical: space(1.25),
      paddingHorizontal: space(2.5),
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.surface,
    },
    gridBtnPressed: { backgroundColor: c.surface2 },
    gridBtnDisabled: { opacity: 0.4 },
    gridBtnLabel: { ...type.micro, color: c.text2, fontWeight: "600" },
  });
