import { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchLibrary, loadCachedLibrary, type CloudLibraryNote } from "@/api/cloudLibrary";
import { DocumentError, pickAndReadDocument } from "@/api/documents";
import { ArrowUpIcon, CloseIcon, SearchIcon } from "./icons";
import { DotsIcon, FileTypeTile } from "./icons-composer";
import { longRelativeTime } from "@/lib/relative-time";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { control, radius, row, space, type } from "@/theme/tokens";

/** One thing AddFilesSheet handed back — either a Library note the learner ticked, or a freshly
 *  uploaded file. Either way it's already TEXT (the same one-shot-attachment shape every other
 *  picker in this app produces — Composer.tsx's own header on `attachment`/`chip`). */
export interface PickedFile {
  id: string;
  title: string;
}

// The reference's "Add files" sheet (IMG_6528) — a full-height page, not a bottom sheet: round
// ✕ top-left, "Add files" centred, round "…" top-right (or "Done" once something is picked);
// an "Upload files" row; a "Recent" list of the learner's Library; a search bar docked at the
// bottom. Modelled on StudySheet.tsx's own `page` mode (the SAME "no grabber, edge-to-edge,
// custom header" shape it exists for) rather than reusing that component directly — its
// `page` header is title+close only, and this one needs a THIRD control (the right-side
// "…"/"Done" slot), which StudySheet.tsx doesn't have a prop for and isn't in this pass's file
// list to add one to.
//
// 🔴 NOTES ONLY, NOT WORD/PDF/PPT TOO. The reference lists uploaded originals (Word, PDF,
// PowerPoint) alongside notes — those live in `library_sources`, and src/api only exposes
// WRITING that table (`fileLibrarySource`), never listing it; api/* is out of scope for this
// pass, so there is nothing to query. `fetchLibrary` (api/cloudLibrary.ts) is the one listing
// API that exists, and it returns Library NOTES. FileTypeTile still draws "word"/"pdf" tiles
// (see that file) for the day a listing exists; this sheet just never asks for them today.
//
// ATTACHMENT CARRY-THROUGH IS THE NEXT SLICE. Picking rows and tapping Done hands the result
// back to `onDone`; LearnHome.tsx stages it as a small chip above the composer and goes no
// further — there is no canvas turn yet for a front-door attachment to ride into (same
// deferral ComposerPlusMenu.tsx's own header documents for photos).
export function AddFilesSheet({
  visible,
  onClose,
  onDone,
  uid,
}: {
  visible: boolean;
  onClose: () => void;
  onDone: (files: readonly PickedFile[]) => void;
  uid: string | null;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const [notes, setNotes] = useState<CloudLibraryNote[] | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!visible || !uid) return;
    let alive = true;
    setQuery("");
    setSelected(new Set());
    void loadCachedLibrary(uid).then((cached) => {
      if (alive) setNotes(cached.notes);
    });
    void fetchLibrary(uid)
      .then((fresh) => {
        if (alive) setNotes(fresh.notes);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [visible, uid]);

  const needle = query.trim().toLowerCase();
  const rows = useMemo(() => {
    const all = notes ?? [];
    return needle ? all.filter((n) => n.title.toLowerCase().includes(needle)) : all;
  }, [notes, needle]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const finishWithSelection = () => {
    const picked = (notes ?? []).filter((n) => selected.has(n.id)).map((n) => ({ id: n.id, title: n.title }));
    onDone(picked);
    onClose();
  };

  const uploadFile = async () => {
    if (!uid || uploading) return;
    setUploading(true);
    try {
      const doc = await pickAndReadDocument(uid);
      // A cancel isn't a failure — just stay on the sheet.
      if (doc) {
        onDone([{ id: `upload:${Date.now()}`, title: doc.title }]);
        onClose();
      }
    } catch (cause) {
      Alert.alert("Couldn't add that file", cause instanceof DocumentError ? cause.message : "Something went wrong. Try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      {/* A page sheet already sits below the status bar; adding the safe-area inset on top of that
          left a 70pt blank band above the header (seen on the simulator). The reference's header
          row starts a few points under the sheet's edge (IMG_6528). */}
      <View style={[styles.page, { paddingTop: space(3) }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.headerBtn} hitSlop={8} accessibilityLabel="Close">
            <CloseIcon size={16} color={c.text} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Add files
          </Text>
          {selected.size > 0 ? (
            <Pressable onPress={finishWithSelection} style={styles.doneBtn} accessibilityLabel={`Done, ${selected.size} selected`}>
              <Text style={styles.doneLabel}>Done</Text>
            </Pressable>
          ) : (
            // Decorative today — the reference's "…" opens a sort/filter menu this pass has no
            // spec for. Kept visible (not wired) rather than dropped, so the header's three-slot
            // balance matches the reference exactly.
            <View style={styles.headerBtn}>
              <DotsIcon size={18} color={c.text} />
            </View>
          )}
        </View>

        <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
          <Pressable
            onPress={() => void uploadFile()}
            disabled={uploading}
            style={({ pressed }) => [styles.uploadRow, pressed && styles.rowPressed]}
            testID="add-files-upload"
          >
            <ArrowUpIcon size={20} color={c.text} strokeWidth={2} />
            <Text style={styles.uploadLabel}>{uploading ? "Uploading…" : "Upload files"}</Text>
          </Pressable>

          <Text style={styles.sectionLabel}>Recent</Text>

          {notes === null ? (
            <Text style={styles.muted}>Loading your library…</Text>
          ) : rows.length === 0 ? (
            <Text style={styles.muted}>{notes.length === 0 ? "Your library is empty." : "No notes match that search."}</Text>
          ) : (
            rows.map((note) => {
              const isSelected = selected.has(note.id);
              return (
                <Pressable
                  key={note.id}
                  onPress={() => toggle(note.id)}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                  testID={`add-files-note-${note.id}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                >
                  <View style={[styles.selectCircle, isSelected && styles.selectCircleOn]}>
                    {isSelected ? <View style={styles.selectDot} /> : null}
                  </View>
                  <FileTypeTile kind="note" size={40} />
                  <View style={styles.rowTextCol}>
                    <Text style={styles.rowTitle} numberOfLines={1} ellipsizeMode="middle">
                      {note.title || "Untitled"}
                    </Text>
                    <Text style={styles.rowSubtitle}>Modified {longRelativeTime(note.updatedAt)}</Text>
                  </View>
                </Pressable>
              );
            })
          )}
          <View style={{ height: space(20) }} />
        </ScrollView>

        <View style={[styles.searchBar, { paddingBottom: insets.bottom + space(2) }]}>
          <View style={styles.searchField}>
            <SearchIcon size={15} color={c.text3} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search library"
              placeholderTextColor={c.textHint}
              autoCorrect={false}
              testID="add-files-search"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: space(4),
      paddingBottom: space(3),
    },
    headerBtn: {
      width: control.lg,
      height: control.lg,
      borderRadius: control.lg / 2,
      backgroundColor: c.surface2,
      alignItems: "center",
      justifyContent: "center",
    },
    doneBtn: { height: control.lg, paddingHorizontal: space(3), alignItems: "center", justifyContent: "center" },
    doneLabel: { ...type.label, color: c.blue, fontWeight: "600" },
    headerTitle: { ...type.title, color: c.text },
    body: { flex: 1, paddingHorizontal: space(4) },
    uploadRow: { flexDirection: "row", alignItems: "center", gap: space(3), minHeight: row.list, paddingVertical: space(2) },
    uploadLabel: { ...type.label, color: c.text },
    sectionLabel: { ...type.small, color: c.text, fontWeight: "700", marginTop: space(4), marginBottom: space(1) },
    muted: { ...type.small, color: c.text3, paddingVertical: space(3) },
    row: { flexDirection: "row", alignItems: "center", gap: space(3), paddingVertical: space(2.5), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
    rowPressed: { backgroundColor: c.surface },
    selectCircle: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1.7,
      borderColor: c.line2,
      alignItems: "center",
      justifyContent: "center",
    },
    selectCircleOn: { borderColor: c.blue, backgroundColor: c.blue },
    selectDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.onAccent },
    rowTextCol: { flex: 1, minWidth: 0, gap: 2 },
    rowTitle: { ...type.label, color: c.text },
    rowSubtitle: { ...type.micro, color: c.text3 },
    searchBar: { paddingHorizontal: space(4), paddingTop: space(2), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
    searchField: {
      flexDirection: "row",
      alignItems: "center",
      gap: space(2),
      paddingHorizontal: space(3.5),
      height: 40,
      backgroundColor: c.surface,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.line,
    },
    searchInput: { flex: 1, color: c.text, fontSize: type.small.fontSize, padding: 0 },
  });
