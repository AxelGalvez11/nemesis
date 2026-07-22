import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { fetchLibrary, loadCachedLibrary, type CloudLibraryNote } from "@/api/cloudLibrary";
import { SearchIcon } from "@/components/icons";
import { Skeleton } from "@/components/Skeleton";
import { SlideUpSheet } from "@/components/StudySheet";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

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

  useEffect(() => {
    if (!visible || !userId) return;
    let alive = true;
    setQuery("");
    void loadCachedLibrary(userId).then((cached) => {
      if (alive) setNotes(cached.notes);
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
        ) : (
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
        )}
        <View style={{ height: space(6) }} />
      </ScrollView>
    </SlideUpSheet>
  );
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
    rowTextCol: { gap: 2 },
    rowTitle: { ...type.body, color: c.text },
    rowSubtitle: { ...type.micro, color: c.text3 },
  });
