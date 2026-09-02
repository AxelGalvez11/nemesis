import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "@/auth/AuthProvider";
import { useShell } from "@/components/AppDrawer";
import { useShellPadding } from "@/components/shell-chrome";
import { GlassSurface } from "@/components/GlassSurface";
import { EmptyBlock, MissionButton } from "@/components/mission-ui";
import { ChevronIcon, FolderIcon, SearchIcon, type IconProps } from "@/components/icons";
import { DeckFileIcon, DocFileIcon, DotsIcon, NoteFileIcon, PdfFileIcon } from "@/components/icons-settings";
import { fetchLibrary, loadCachedLibrary, type CloudLibraryNote, type CloudLibrarySnapshot } from "@/api/cloudLibrary";
import { fetchCloudStudy, loadCachedStudy, type CloudStudyDeck } from "@/api/cloudStudy";
import { fileKindOf, folderNoteCounts, type FileKind } from "@/lib/library-row-meta";
import { libraryModifiedLabel } from "@/lib/library-row-format";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { control, radius, row, space, type } from "@/theme/tokens";

// Library — rebuilt against IMG_6539 (~/Downloads/chatgptios, ChatGPT-parity
// pass, 2026-09-01). This is a FULL REPLACEMENT of the previous 1,600-line
// screen (folder drag/drop, multi-select, manual reordering, rename/move
// sheets — none of which the reference shows, and git history holds the old
// implementation in full if any of it needs porting back). What survives:
// the same cloud reads (api/cloudLibrary.ts, api/cloudStudy.ts), the offline
// cache-then-refresh pattern, and note/deck navigation.
//
// Chips are "All · Documents · Notes · Decks" — the TASK BRIEF's own set, not
// the raw screenshot's "All / Images / Documents": Nemesis's library holds
// notes and study decks, not a camera roll. "Documents" will read EMPTY on a
// typical account: api/librarySources.ts (uploaded originals) has no read/list
// export — its own header calls it write-only, filing a row so the extract
// route can resolve a storage path, nothing more — so the only honest signal
// for "this note is actually an attached pdf/doc" is fileKindOf's extension
// sniff on the note's own path (lib/library-row-meta.ts), which is empty for
// ordinary markdown notes. Said plainly rather than faked with sample data.

type Chip = "all" | "documents" | "notes" | "decks";
const CHIPS: { key: Chip; label: string }[] = [
  { key: "all", label: "All" },
  { key: "documents", label: "Documents" },
  { key: "notes", label: "Notes" },
  { key: "decks", label: "Decks" },
];

type ItemKind = FileKind | "deck";

interface LibraryItem {
  key: string;
  kind: "folder" | ItemKind;
  name: string;
  sublabel: string;
  updatedAt: string;
  /** Folder rows only — the path this row filters the list to. */
  folderPath?: string;
  noteId?: string;
  deckId?: string;
}

/** Builds the flat row list for one screen state: root (activeFolder null) shows every
 *  top-level folder plus every root-level note/deck; inside a folder, every note whose path
 *  sits under it (any depth — this screen doesn't nest sub-folder rows, see the file header).
 *  Folders sort first, then everything else by recency — the task brief's own order. Pure
 *  aside from Date.now() staying out of it (the caller already has fresh `updatedAt` strings
 *  to sort on), so it's cheap to recompute on every render rather than memoized by hand. */
function buildLibraryItems(
  snapshot: CloudLibrarySnapshot,
  decks: CloudStudyDeck[],
  activeFolder: string | null,
  chip: Chip,
): LibraryItem[] {
  const now = Date.now();
  const items: LibraryItem[] = [];

  if (activeFolder === null) {
    // Folders only ever show under "all" — a type filter (Documents/Notes/
    // Decks) is about what's INSIDE a folder, not the folder itself.
    if (chip === "all") {
      const counts = folderNoteCounts(snapshot.notes.map((n) => n.path), snapshot.folders);
      for (const [path, count] of counts) {
        if (path.includes("/")) continue; // top-level only, see the file header
        const inFolder = snapshot.notes.filter((n) => n.path.startsWith(`${path}/`));
        const latest = inFolder.reduce((max, n) => (n.updatedAt > max ? n.updatedAt : max), "");
        items.push({
          key: `folder:${path}`,
          kind: "folder",
          name: path,
          sublabel: latest ? libraryModifiedLabel(latest, now) : `${count} item${count === 1 ? "" : "s"}`,
          updatedAt: latest,
          folderPath: path,
        });
      }
    }
  }

  const noteScope = activeFolder === null
    ? snapshot.notes.filter((n) => !n.path.includes("/"))
    : snapshot.notes.filter((n) => n.path === activeFolder || n.path.startsWith(`${activeFolder}/`));
  if (chip === "all" || chip === "documents" || chip === "notes") {
    for (const note of noteScope) {
      const kind = fileKindOf(note.path);
      if (chip === "documents" && kind === "note") continue;
      if (chip === "notes" && kind !== "note") continue;
      items.push({
        key: `note:${note.id}`,
        kind,
        name: note.title,
        sublabel: libraryModifiedLabel(note.updatedAt, now),
        updatedAt: note.updatedAt,
        noteId: note.id,
      });
    }
  }

  // Decks have no folder placement on the phone today (CloudStudyDeck carries no
  // path this screen's folders understand) — they only ever appear at root.
  if (activeFolder === null && (chip === "all" || chip === "decks")) {
    for (const deck of decks) {
      items.push({
        key: `deck:${deck.id}`,
        kind: "deck",
        name: deck.name,
        sublabel: deck.description ? deck.description : libraryModifiedLabel(deck.updatedAt, now),
        updatedAt: deck.updatedAt,
        deckId: deck.id,
      });
    }
  }

  const folders = items.filter((it) => it.kind === "folder");
  const rest = items.filter((it) => it.kind !== "folder").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return [...folders, ...rest];
}

export default function LibraryScreen() {
  const { colors: c, resolvedMode } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { contentTop, contentBottom } = useShellPadding();
  const { setHeaderTitle, setHeaderCenter, setHeaderRight } = useShell();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [dataReady, setDataReady] = useState(false);
  const [snapshot, setSnapshot] = useState<CloudLibrarySnapshot>({ folders: [], notes: [] });
  const [decks, setDecks] = useState<CloudStudyDeck[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [chip, setChip] = useState<Chip>("all");
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [actionsOpen, setActionsOpen] = useState(false);

  const folderTitle = activeFolder ? activeFolder.split("/").pop() ?? activeFolder : null;

  // Coordinator finding 2026-09-01 (simulator measurement against IMG_6539):
  // the reference's "Library" sits INSIDE the shared top bar (ink at y
  // 62-78pt), not as a page heading drawn below it — so this uses the
  // shell's own header slot instead of an in-page <Text>. Root gets the
  // plain title; inside a folder, a CONTROL (setHeaderCenter) replaces it
  // with the back-chevron + folder name, since the plain-label slot can only
  // ever render text, not a Pressable.
  useEffect(() => {
    if (folderTitle) {
      setHeaderTitle(null);
      setHeaderCenter(
        <Pressable onPress={() => setActiveFolder(null)} hitSlop={8} style={styles.backRow} testID="library-folder-back">
          <View style={styles.backChevron}>
            <ChevronIcon size={16} color={c.text} strokeWidth={2.2} />
          </View>
          <Text style={styles.title} numberOfLines={1}>{folderTitle}</Text>
        </Pressable>,
      );
    } else {
      setHeaderCenter(null);
      setHeaderTitle("Library");
    }
    return () => {
      setHeaderTitle(null);
      setHeaderCenter(null);
    };
  }, [folderTitle, c, styles, setHeaderTitle, setHeaderCenter]);

  useEffect(() => {
    setHeaderRight(
      <GlassSurface style={styles.kebabBtn} fallbackColor={c.glassPanel} tint={actionsOpen ? c.accentFaint : undefined} shadow>
        <Pressable
          style={styles.kebabInner}
          onPress={() => setActionsOpen((v) => !v)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Library actions"
          testID="library-actions-btn"
        >
          <DotsIcon size={20} color={actionsOpen ? c.accent : c.text2} />
        </Pressable>
      </GlassSurface>,
    );
    return () => setHeaderRight(null);
  }, [actionsOpen, c, styles, setHeaderRight]);

  const refresh = useCallback(async (uid: string) => {
    try {
      const [fresh, study] = await Promise.all([fetchLibrary(uid), fetchCloudStudy(uid)]);
      setSnapshot(fresh);
      setDecks(study.decks);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      if (!userId) {
        setDataReady(true);
        return () => {
          alive = false;
        };
      }
      void (async () => {
        const [cachedLibrary, cachedStudy] = await Promise.all([loadCachedLibrary(userId), loadCachedStudy(userId)]);
        if (!alive) return;
        setSnapshot(cachedLibrary);
        setDecks(cachedStudy.decks);
        setDataReady(true);
        void refresh(userId);
      })();
      return () => {
        alive = false;
      };
    }, [userId, refresh]),
  );

  if (!dataReady) {
    return (
      <View style={[styles.flex, styles.centerFill, { paddingTop: contentTop }]} testID="library-loading">
        <ActivityIndicator color={c.text2} />
      </View>
    );
  }

  if (!userId) {
    return (
      <View style={[styles.authWrap, { paddingTop: contentTop, paddingBottom: contentBottom }]} testID="library-signin">
        <EmptyBlock title="Sign in to see your library" body="Your notes live in your account. Sign in to read them here — anywhere, even offline once they've loaded." />
        <MissionButton label="Sign in" variant="primary" testID="library-goto-signin" onPress={() => router.push("/sign-in")} />
      </View>
    );
  }

  const allItems = buildLibraryItems(snapshot, decks, activeFolder, chip);
  const trimmed = query.trim().toLowerCase();
  const rows = trimmed ? allItems.filter((it) => it.name.toLowerCase().includes(trimmed)) : allItems;

  const openItem = (item: LibraryItem) => {
    if (item.kind === "folder" && item.folderPath) {
      setActiveFolder(item.folderPath);
      setChip("all");
      return;
    }
    if (item.noteId) router.push({ pathname: "/document", params: { note: item.noteId } });
    else if (item.deckId) router.push({ pathname: "/review", params: { deckId: item.deckId } });
  };

  return (
    <View style={styles.flex} testID="library-screen">
      <View style={[styles.topArea, { paddingTop: contentTop }]}>
        {/* The title now lives in the shared TopBar's own slot (see the
            effect above) — the reference's "Library" sits INSIDE that bar,
            not as a page heading here. This block is just the chips, placed
            so their row starts ~24pt below the bar (coordinator measurement
            against IMG_6539: reference chip centre ≈139pt = contentTop+~24). */}
        <View style={styles.chipsRow} testID="library-chips">
          {CHIPS.map((entry) => {
            const active = chip === entry.key;
            return (
              <Pressable
                key={entry.key}
                onPress={() => setChip(entry.key)}
                style={[styles.chip, active && styles.chipActive]}
                testID={`library-chip-${entry.key}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{entry.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {error ? (
          <Text style={styles.warnText} testID="library-error">Couldn't reach your library: {error}</Text>
        ) : null}
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.key}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.listBody, { paddingBottom: contentBottom + 72 }]}
        renderItem={({ item }) => <LibraryRow item={item} styles={styles} resolvedMode={resolvedMode} onPress={() => openItem(item)} />}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <EmptyBlock
              title={trimmed ? "No matches" : "Nothing here yet"}
              body={trimmed ? `Nothing in your library matches "${query.trim()}".` : "Notes, decks and folders from your account show up here."}
            />
          </View>
        }
      />

      {/* Docked search bar (task brief: floats over the bottom, the list
          reserves its height via contentBottom above — same reasoning the old
          screen's own header comment gave for its floating controls band). */}
      <View style={[styles.searchDock, { paddingBottom: contentBottom }]}>
        <View style={styles.searchField}>
          <SearchIcon size={16} color={c.text3} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search library"
            placeholderTextColor={c.textHint}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            testID="library-search-input"
          />
        </View>
      </View>
    </View>
  );
}

// Measured off IMG_6539's sub-line (#5D5D5D) — distinct from the theme's own
// text2 (#8F8F8F), so a local constant rather than a new palette token, same
// reasoning as settings.tsx's CARD_RADIUS. Dark mode has no reference crop to
// measure against, so it falls back to the theme's own text2.
const LIBRARY_SUBLINE_LIGHT = "#5D5D5D";

function LibraryRow({
  item,
  styles,
  resolvedMode,
  onPress,
}: {
  item: LibraryItem;
  styles: Styles;
  resolvedMode: "light" | "dark";
  onPress: () => void;
}) {
  const { colors: c } = useTheme();
  const subColor = resolvedMode === "light" ? LIBRARY_SUBLINE_LIGHT : c.text2;
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
      testID={`library-row-${item.key}`}
      accessibilityRole="button"
      accessibilityLabel={item.name}
    >
      <View style={styles.tile}>
        <RowGlyph kind={item.kind} color={c.text2} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
        {item.sublabel ? <Text style={[styles.rowSub, { color: subColor }]} numberOfLines={1}>{item.sublabel}</Text> : null}
      </View>
    </Pressable>
  );
}

function RowGlyph({ kind, color }: { kind: LibraryItem["kind"]; color: string }) {
  const props: IconProps = { color, size: 22, strokeWidth: 1.7 };
  if (kind === "folder") return <FolderIcon {...props} />;
  if (kind === "pdf") return <PdfFileIcon {...props} />;
  if (kind === "doc") return <DocFileIcon {...props} />;
  if (kind === "deck") return <DeckFileIcon {...props} />;
  return <NoteFileIcon {...props} />;
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    centerFill: { alignItems: "center", justifyContent: "center" },
    authWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(6), gap: space(4), backgroundColor: c.bg },

    kebabBtn: { width: control.lg, height: control.lg, borderRadius: control.lg / 2, overflow: "hidden" },
    kebabInner: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },

    topArea: { paddingBottom: space(2) },
    // title/backRow/backChevron are also used by the header-center control
    // (see the effect above), not just this file's own JSX.
    title: { ...type.title, color: c.text },
    backRow: { flexDirection: "row", alignItems: "center", gap: space(1) },
    backChevron: { transform: [{ rotate: "180deg" }] },

    // Chips: selected = surface2 pill (task brief's own "#F3F3F3" measured
    // fill, which is exactly what surface2 already models — see palette.ts).
    // marginTop 24 (space(6)), not the title row's old space(3): coordinator
    // measurement against IMG_6539 puts the chips' own top edge ~24pt below
    // the bar now that the title moved into it.
    chipsRow: { flexDirection: "row", gap: space(2), paddingHorizontal: space(4), marginTop: space(6) },
    chip: { paddingHorizontal: space(3.5), paddingVertical: space(1.75), borderRadius: radius.pill },
    chipActive: { backgroundColor: c.surface2 },
    chipText: { ...type.small, color: c.text2 },
    chipTextActive: { color: c.text, fontWeight: "600" },

    warnText: { ...type.micro, color: c.danger, paddingHorizontal: space(4), marginTop: space(2) },

    listBody: { paddingTop: space(2) },
    emptyWrap: { paddingTop: space(10) },

    // Coordinator measurement against IMG_6539: our tile/text sat ~4-8pt too
    // far right (text x≈77.5 vs reference's 73.3). Raw, measured values —
    // not the 4pt grid — same reasoning as CARD_RADIUS in settings.tsx:
    // paddingHorizontal 20 puts the 48pt tile's left edge at the reference's
    // own ≈20pt, and a 5pt tile→text gap (was space(3)=12) lands the name at
    // 20+48+5=73, matching 73.3.
    row: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 20, minHeight: row.twoLine },
    rowPressed: { backgroundColor: c.surface2 },
    tile: {
      width: 48,
      height: 48,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.raised,
      alignItems: "center",
      justifyContent: "center",
    },
    rowText: { flex: 1 },
    rowName: { ...type.label, color: c.text },
    // Measured off IMG_6539's sub-line, distinct from the theme's own text2 —
    // a local color rather than a new palette token, same reasoning as
    // settings.tsx's CARD_RADIUS constant. Dark mode falls back to text2
    // (there's no dark-mode reference crop to measure against).
    rowSub: { ...type.micro },

    searchDock: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space(4), paddingTop: space(2) },
    searchField: {
      flexDirection: "row",
      alignItems: "center",
      gap: space(2),
      backgroundColor: c.surface2,
      borderRadius: radius.pill,
      paddingHorizontal: space(4),
      height: 44,
    },
    searchInput: { flex: 1, ...type.label, color: c.text, paddingVertical: 0 },
  });

type Styles = ReturnType<typeof createStyles>;
