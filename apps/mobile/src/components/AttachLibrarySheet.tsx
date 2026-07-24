import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { fetchLibrary, loadCachedLibrary, type CloudLibraryNote } from "@/api/cloudLibrary";
import { ChevronIcon, FolderIcon, SearchIcon } from "@/components/icons";
import { Skeleton } from "@/components/Skeleton";
import { SlideUpSheet } from "@/components/StudySheet";
import { buildLibraryRows } from "@/lib/library-sync";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// FOLDERS AND NOTES, not a flat list of every note in the account (owner
// 2026-07-24: "attach from library needs to show folders and notes"). It listed
// notes only, which meant a student with a semester of material had to scroll
// past everything they own or already know the note's name to search for it —
// the folders they filed it under were the one piece of structure the picker
// threw away. Rows come from lib/library-sync.ts's buildLibraryRows, the SAME
// tree builder the Library tab draws, so the two agree on nesting, on
// folders-before-notes, and on A–Z ordering.
//
// Folders start COLLAPSED, matching the Library tab. Searching switches back to
// a flat list of matches: once you have typed a query, where a note lives
// matters less than seeing every note that matches, and a tree with one hit
// four levels down would hide it behind two taps.
//
// Composer "+" → "Attach from Library" picker (chat.tsx). Same shape as
// app/notebook.tsx's own LibraryPickerSheet (cached-then-fresh cloud fetch,
// search-as-you-type) — kept as a SEPARATE component rather than a shared
// import because notebook.tsx's version tracks "already a source" via
// existingPaths and inserts a notebook_sources row on pick, neither of which
// applies here: chat only ever attaches ONE note at a time as a one-turn
// context block (lib/chat-thread.ts's buildAttachmentContext), never persists
// it anywhere. Picking a note here just hands it back to the caller.
export function AttachLibrarySheet({
  visible,
  onClose,
  onPick,
  userId,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (note: CloudLibraryNote) => void;
  userId: string | null;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const [notes, setNotes] = useState<CloudLibraryNote[] | null>(null);
  const [query, setQuery] = useState("");
  // Full folder paths ("PHCY 1205/Unit 1"), never leaf names — two parents can
  // each hold a "Unit 1" and collapsing one must not shut the other.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    if (!visible || !userId) return;
    let alive = true;
    setQuery("");
    void loadCachedLibrary(userId).then((cached) => {
      if (!alive) return;
      setNotes(cached.notes);
      setCollapsed(collapsedFolderPaths(cached.notes));
    });
    void fetchLibrary(userId)
      .then((fresh) => {
        if (alive) setNotes(fresh.notes);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [visible, userId]);

  const needle = query.trim().toLowerCase();
  const notesList = notes ?? [];
  const filtered = needle
    ? notesList.filter((note) => note.title.toLowerCase().includes(needle) || note.path.toLowerCase().includes(needle))
    : notesList;

  // One note per path, so a tree row can be turned back into the note it names.
  const byPath = useMemo(() => new Map(notesList.map((note) => [note.path, note])), [notesList]);
  const treeRows = useMemo(
    () => (needle ? [] : buildLibraryRows(notesList.map((n) => ({ path: n.path, title: n.title })), collapsed)),
    [notesList, collapsed, needle],
  );

  const toggleFolder = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  return (
    <SlideUpSheet visible={visible} onClose={onClose} title="Attach from Library" testID="attach-library-sheet">
      <View style={styles.searchField}>
        <SearchIcon size={15} color={c.text3} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search your notes"
          placeholderTextColor={c.text3}
          autoCorrect={false}
          testID="attach-library-search"
        />
      </View>
      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {notes === null ? (
          <View testID="attach-library-skeleton">
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={styles.row}>
                <View style={styles.rowTextCol}>
                  <Skeleton width="55%" height={16} />
                  <Skeleton width="35%" height={12} />
                </View>
              </View>
            ))}
          </View>
        ) : filtered.length === 0 ? (
          <Text style={styles.mutedText}>{notesList.length === 0 ? "Your library is empty." : "No notes match that search."}</Text>
        ) : needle ? (
          // Searching: a flat list of every match, with its folder underneath —
          // see the top-of-file note on why the tree steps aside here.
          filtered.map((note) => (
            <Pressable
              key={note.id}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => onPick(note)}
              testID={`attach-library-note-${note.id}`}
            >
              <View style={styles.rowTextCol}>
                <Text style={styles.rowTitle} numberOfLines={1}>{note.title}</Text>
                <Text style={styles.rowSubtitle} numberOfLines={1}>{note.path}</Text>
              </View>
            </Pressable>
          ))
        ) : (
          treeRows.map((row) => {
            if (row.type === "folder") {
              const shut = collapsed.has(row.path);
              return (
                <Pressable
                  key={`folder:${row.path}`}
                  style={({ pressed }) => [
                    styles.folderRow,
                    { marginLeft: row.depth * INDENT_STEP },
                    pressed && styles.rowPressed,
                  ]}
                  onPress={() => toggleFolder(row.path)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: !shut }}
                  testID={`attach-library-folder-${row.path}`}
                >
                  {/* Chevron right when shut, down when open — the Library tab's
                      own language, so the two trees read identically. */}
                  <View style={shut ? null : styles.chevronOpen}>
                    <ChevronIcon size={13} color={c.text2} strokeWidth={2.2} />
                  </View>
                  <FolderIcon size={15} color={c.text2} strokeWidth={1.9} />
                  <Text style={styles.folderName} numberOfLines={1}>{row.name}</Text>
                </Pressable>
              );
            }
            const note = byPath.get(row.path);
            if (!note) return null;
            return (
              <Pressable
                key={note.id}
                style={({ pressed }) => [
                  styles.row,
                  { marginLeft: row.depth * INDENT_STEP },
                  pressed && styles.rowPressed,
                ]}
                onPress={() => onPick(note)}
                testID={`attach-library-note-${note.id}`}
              >
                {/* No path subline inside the tree — the folder above it IS the
                    path, and repeating it makes every row two lines tall. */}
                <Text style={styles.rowTitle} numberOfLines={1}>{row.title}</Text>
              </Pressable>
            );
          })
        )}
        <View style={{ height: space(6) }} />
      </ScrollView>
    </SlideUpSheet>
  );
}

/** One indent step per tree level, so a folder and the notes inside it share a
 *  left edge — same value the Library tab and the Study tree use. */
const INDENT_STEP = 14;

/** Every folder path in a note set, as the initial COLLAPSED set. Folders start
 *  shut here exactly as they do on the Library tab: opening the picker onto a
 *  fully expanded semester would be the flat list this replaces. */
function collapsedFolderPaths(notes: readonly { path: string }[]): ReadonlySet<string> {
  const out = new Set<string>();
  for (const note of notes) {
    const segments = note.path.split("/").filter(Boolean);
    segments.pop();
    let soFar = "";
    for (const segment of segments) {
      soFar = soFar === "" ? segment : `${soFar}/${segment}`;
      out.add(soFar);
    }
  }
  return out;
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    searchField: { flexDirection: "row", alignItems: "center", gap: space(2), paddingHorizontal: space(3), height: 40, backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.line, marginBottom: space(3) },
    searchInput: { flex: 1, color: c.text, fontSize: type.small.fontSize, padding: 0 },
    // Height is owned by SlideUpSheet's body (collapsed cap + drag-up-to-
    // expand, owner 2026-07-21); flexShrink lets the list compress to that
    // animated cap instead of overflowing it.
    list: { flexShrink: 1 },
    mutedText: { ...type.small, color: c.text3, paddingVertical: space(2) },
    row: { borderRadius: radius.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, paddingVertical: space(3), paddingHorizontal: space(3.5), marginBottom: space(2) },
    rowPressed: { backgroundColor: c.surface2 },
    // Folder rows are chrome, not cards: no fill or border, so the notes inside
    // them stay the things you tap. Mirrors the Library tab's own folder row.
    folderRow: { flexDirection: "row", alignItems: "center", gap: space(2), paddingVertical: space(2.5), paddingHorizontal: space(2), borderRadius: radius.sm, marginBottom: space(1) },
    folderName: { ...type.body, fontWeight: "600", color: c.text2, flex: 1, minWidth: 0 },
    chevronOpen: { transform: [{ rotate: "90deg" }] },
    rowTextCol: { gap: 2 },
    rowTitle: { ...type.body, color: c.text },
    rowSubtitle: { ...type.micro, color: c.text3 },
  });
