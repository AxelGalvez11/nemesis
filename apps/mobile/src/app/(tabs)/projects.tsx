import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { useShell } from "@/components/AppDrawer";
import { useShellPadding, useKeyboardHeight } from "@/components/shell-chrome";
import { useCanvasesAndFolders } from "@/components/useCanvasesAndFolders";
import { GlassSurface } from "@/components/GlassSurface";
import { EmptyBlock } from "@/components/mission-ui";
import { MiniMenu, type MenuAnchor, type MenuRow } from "@/components/MiniMenu";
import { PinnedMark, ProjectRow } from "@/components/ProjectRows";
import { TextPromptSheet } from "@/components/RowActionSheets";
import { useRowDrag } from "@/components/useRowDrag";
import { CloseIcon, PinIcon, PlusIcon, SearchIcon, TrashIcon } from "@/components/icons";
import { PencilIcon } from "@/components/icons-sidebar";
import { createFolder, deleteFolder, renameFolder, setFolderPinned } from "@/api/canvases";
import { buildProjects, visibleProjects, type ProjectFilter, type ProjectNode } from "@/lib/canvases";
import { longRelativeTime } from "@/lib/relative-time";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { control, radius, space, type } from "@/theme/tokens";

// The Projects page — the web's `/projects` (docs/design/ios-web-parity-2026-09.md slice
// 3), ported to the ChatGPT-iOS shape: a filter chip row, a list of projects (icon tile +
// name + relative time + a pin glyph when pinned), and a search field DOCKED at the
// bottom rather than the drawer's inline one — that's the web page's own layout, not a
// drawer convention repeated here. Tapping a row opens the project's own page (IMG_6538 →
// IMG_6543, "Tapping a row opens /project?id="), which now exists (see
// app/(tabs)/project.tsx) — the previous expand-in-place behaviour is retired along with
// it. Long-press still opens the same Pin / Rename / Delete menu the drawer's project
// rows do.

/** Space the docked search bar (plus its own breathing room) reserves at the list's foot,
 *  so the last row never sits under it. */
const DOCK_RESERVE = 76;

/** The project being renamed. Creating a project is the separate `newPromptOpen` flag
 *  below (the "+" button has nothing to rename) — `handlePromptConfirm` treats "no
 *  target" as "create" rather than needing a mode field to tell the two apart. */
type PromptState = { id: string; initial: string };

export default function ProjectsScreen() {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const { contentTop, contentBottom } = useShellPadding();
  const { setHeaderTitle, setHeaderRight } = useShell();
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;

  // Data + its three refresh paths live in one hook shared with the drawer — see
  // useCanvasesAndFolders.ts. `active: true` — this screen's own mount is the signal.
  const { canvases, folders, setFolders } = useCanvasesAndFolders(uid, true);
  const [filter, setFilter] = useState<ProjectFilter>("all");
  const [query, setQuery] = useState("");
  const [newPromptOpen, setNewPromptOpen] = useState(false);

  const [actionTarget, setActionTarget] = useState<ProjectNode | null>(null);
  const [actionAt, setActionAt] = useState<MenuAnchor | null>(null);
  const [prompt, setPrompt] = useState<PromptState | null>(null);

  const projectsByIdRef = useRef(new Map<string, ProjectNode>());

  // Drive the TopBar's title + its own "+" action. The button's onPress closes only
  // over the stable setState setter, not over `folders`/`uid` — so this effect never
  // needs to rerun as data loads, and the button never goes stale.
  useEffect(() => {
    setHeaderTitle("Projects");
    setHeaderRight(
      <GlassSurface style={styles.plusGlass} fallbackColor={c.glassPanel} shadow>
        <Pressable
          accessibilityLabel="New project"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => setNewPromptOpen(true)}
          style={styles.plusGlassInner}
          testID="projects-new"
        >
          <PlusIcon color={c.text} size={19} strokeWidth={1.9} />
        </Pressable>
      </GlassSurface>,
    );
    return () => {
      setHeaderTitle(null);
      setHeaderRight(null);
    };
  }, [setHeaderTitle, setHeaderRight, styles, c]);

  function closeMenu() {
    setActionTarget(null);
    setActionAt(null);
  }

  function togglePin(project: ProjectNode) {
    closeMenu();
    const next = !project.pinnedAt;
    setFolders((rows) => rows.map((row) => (row.id === project.id ? { ...row, pinnedAt: next ? new Date().toISOString() : null } : row)));
    if (uid) void setFolderPinned(uid, project.id, next);
  }

  function beginRename(project: ProjectNode) {
    closeMenu();
    setPrompt({ id: project.id, initial: project.name });
  }

  function confirmDelete(project: ProjectNode) {
    closeMenu();
    Alert.alert(`Delete "${project.name}"?`, "Its canvases go back to Canvases. Projects inside it are deleted too.", [
      { style: "cancel", text: "Cancel" },
      {
        onPress: () => {
          setFolders((rows) => rows.filter((row) => row.id !== project.id));
          if (uid) void deleteFolder(uid, project.id);
        },
        style: "destructive",
        text: "Delete",
      },
    ]);
  }

  async function handlePromptConfirm(value: string) {
    const p = prompt;
    setPrompt(null);
    setNewPromptOpen(false);
    const clean = value.trim();
    if (!uid || !clean) return;
    if (p) {
      setFolders((rows) => rows.map((row) => (row.id === p.id ? { ...row, name: clean } : row)));
      void renameFolder(uid, p.id, clean);
      return;
    }
    const folder = await createFolder(uid, clean);
    if (folder) setFolders((rows) => [...rows, folder]);
  }

  // Same lift-then-menu gesture the drawer's project tiles use — see AppDrawer for why
  // the row's own onLongPress can't come along for the ride.
  const rowDrag = useRowDrag({
    onDrop: () => {},
    onHold: (key, x, y) => {
      const project = projectsByIdRef.current.get(key);
      if (project) {
        setActionAt({ x, y });
        setActionTarget(project);
      }
    },
  });

  const allProjects = useMemo(() => buildProjects(folders, canvases), [folders, canvases]);
  const shown = useMemo(() => visibleProjects(allProjects, filter, query), [allProjects, filter, query]);
  projectsByIdRef.current = new Map(shown.map((project) => [project.id, project]));

  const trimmed = query.trim();
  const emptyTitle = trimmed ? "No matches" : filter === "pinned" ? "No pinned projects" : "No projects yet";

  const rowActions: MenuRow[] = actionTarget
    ? [
        { icon: PinIcon, key: "pin", label: actionTarget.pinnedAt ? "Unpin" : "Pin", onPress: () => togglePin(actionTarget) },
        { icon: PencilIcon, key: "rename", label: "Rename", onPress: () => beginRename(actionTarget) },
        { destructive: true, icon: TrashIcon, key: "delete", label: "Delete", onPress: () => confirmDelete(actionTarget) },
      ]
    : [];

  if (!uid) {
    return (
      <View style={[styles.flex, { paddingTop: contentTop }]} testID="projects-screen">
        <EmptyBlock title="Sign in to see your projects" body="Projects live in your account — sign in to file canvases into them here." />
      </View>
    );
  }

  return (
    <View style={styles.flex} testID="projects-screen">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.body, { paddingTop: contentTop + space(2), paddingBottom: contentBottom + DOCK_RESERVE }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.chips}>
          <Chip label="All" active={filter === "all"} onPress={() => setFilter("all")} testID="projects-chip-all" />
          <Chip label="Pinned" active={filter === "pinned"} onPress={() => setFilter("pinned")} testID="projects-chip-pinned" />
        </View>

        {shown.length === 0 ? (
          <EmptyBlock title={emptyTitle} />
        ) : (
          shown.map((project) => (
            <ProjectRow
              key={project.id}
              name={project.name}
              color={project.color}
              lifted={rowDrag.activeKey === project.id}
              gesture={rowDrag.gestureFor(project.id, { canDropOn: () => false, draggable: false, lift: true })}
              onPress={() => router.push(`/project?id=${project.id}` as never)}
              trailing={
                <View style={styles.trailing}>
                  <Text style={styles.time}>{longRelativeTime(project.modifiedAt)}</Text>
                  {project.pinnedAt ? <PinnedMark /> : null}
                </View>
              }
              testID={`projects-row-${project.id}`}
            />
          ))
        )}
      </ScrollView>

      {/* Search, docked at the FOOT of the page (owner spec item 8) rather than the
          drawer's inline field under the brand row — the web page puts its own search
          down here. Rides above the keyboard when it's up, above the home indicator
          otherwise. */}
      <View style={[styles.dock, { bottom: (keyboardHeight || insets.bottom) + space(2) }]} pointerEvents="box-none">
        <GlassSurface style={styles.dockGlass} fallbackColor={c.glassPanel} opaque shadow>
          <SearchIcon color={c.text3} size={16} />
          <TextInput
            autoCorrect={false}
            onChangeText={setQuery}
            placeholder="Search projects"
            placeholderTextColor={c.textHint}
            style={styles.dockInput}
            testID="projects-search-input"
            value={query}
          />
          {query ? (
            <Pressable accessibilityLabel="Clear search" hitSlop={8} onPress={() => setQuery("")}>
              <CloseIcon color={c.text3} size={14} />
            </Pressable>
          ) : null}
        </GlassSurface>
      </View>

      <MiniMenu
        visible={actionTarget !== null}
        anchor={actionAt}
        actions={rowActions}
        title={actionTarget?.name}
        onClose={closeMenu}
        testID="projects-row-actions"
      />
      <TextPromptSheet
        visible={prompt !== null || newPromptOpen}
        title={prompt ? "Rename project" : "New project"}
        placeholder="Project name"
        initialValue={prompt?.initial ?? ""}
        onConfirm={(value) => void handlePromptConfirm(value)}
        onClose={() => {
          setPrompt(null);
          setNewPromptOpen(false);
        }}
        testID="projects-text-prompt"
      />
    </View>
  );
}

function Chip({ label, active, onPress, testID }: { label: string; active: boolean; onPress: () => void; testID?: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && !active && styles.chipPressed]}
      testID={testID}
    >
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    body: { flexGrow: 1, paddingHorizontal: space(2) },

    chips: { flexDirection: "row", gap: space(2), marginBottom: space(3), paddingHorizontal: space(2) },
    // Transparent at rest — IMG_6538's unselected chips ("Created by you", "Shared with
    // you") carry no pill at all, only grey text; the selected chip gets a c.surface2 pill
    // with plain c.text, never the accent fill this used to apply.
    chip: { borderRadius: radius.pill, paddingHorizontal: space(3.5), paddingVertical: space(1.5), backgroundColor: "transparent" },
    chipPressed: { backgroundColor: c.surface },
    chipActive: { backgroundColor: c.surface2 },
    chipLabel: { ...type.small, color: c.text2, fontWeight: "600" },
    chipLabelActive: { color: c.text },

    trailing: { flexDirection: "row", alignItems: "center", gap: space(1.5) },
    time: { color: c.text3, fontSize: type.micro.fontSize, fontVariant: ["tabular-nums"] },

    plusGlass: { width: control.lg, height: control.lg, borderRadius: control.lg / 2, borderWidth: 1, borderColor: c.line },
    plusGlassInner: { flex: 1, alignItems: "center", justifyContent: "center" },

    dock: { position: "absolute", left: space(3), right: space(3) },
    dockGlass: {
      flexDirection: "row", alignItems: "center", gap: space(2),
      height: 46, paddingHorizontal: space(3.5), borderRadius: radius.pill,
      borderWidth: 1, borderColor: c.line,
    },
    dockInput: { flex: 1, color: c.text, fontSize: type.small.fontSize, padding: 0 },
  });
