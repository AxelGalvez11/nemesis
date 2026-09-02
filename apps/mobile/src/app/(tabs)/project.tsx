import { useEffect, useMemo, useState, type ComponentType } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/auth/AuthProvider";
import { useShell } from "@/components/AppDrawer";
import { Composer, COMPOSER_COMPACT_HEIGHT } from "@/components/Composer";
import { useCanvasesAndFolders } from "@/components/useCanvasesAndFolders";
import { useKeyboardVisible, useShellPadding } from "@/components/shell-chrome";
import { GlassSurface } from "@/components/GlassSurface";
import { EmptyBlock } from "@/components/mission-ui";
import { MiniMenu, type MenuAnchor, type MenuRow } from "@/components/MiniMenu";
import { SlideUpSheet } from "@/components/StudySheet";
import { TextPromptSheet } from "@/components/RowActionSheets";
import { ChevronIcon, PinIcon, PlusIcon, TrashIcon, type IconProps } from "@/components/icons";
import {
  CameraIcon,
  ImagesIcon,
  MoreDotsIcon,
  PaperclipIcon,
  PencilIcon,
  ProjectFolderIcon,
  ScanTextIcon,
  SlidersIcon,
} from "@/components/icons-sidebar";
import { deleteFolder, renameFolder, setFolderInstructions, setFolderPinned, startCanvas } from "@/api/canvases";
import { buildProjects, canvasLabel, findProject, type CanvasSummary } from "@/lib/canvases";
import { firstParam } from "@/lib/canvas-screen";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { control, radius, row, space, type } from "@/theme/tokens";

// A project's own page (docs: nemesis-ios-catchup) — IMG_6543 (Chats), IMG_6544 (its "…"
// menu), IMG_6545 (Sources, empty), IMG_6546 (the Add-sources sheet). Reached from the
// Projects page and from the drawer's pinned project rows, both of which now push here
// (`/project?id=<folderId>`) instead of expanding a project in place — see AppDrawer.tsx
// and projects.tsx for the callers this retires.
//
// TopBar has no left-slot override (only setHeaderTitle/setHeaderCenter/setHeaderRight —
// see TopBar.tsx, which this pass does not touch), so the shell's own hamburger keeps
// occupying the true top-left corner. The reference's round "‹ back" button is composed
// into `headerCenter` instead, immediately left of the [glyph + name] title — a second,
// smaller control beside the hamburger rather than replacing it. Report this rather than
// silently accept it: a future pass that adds a real header-left slot to TopBar should
// collapse the two.

/** Sources tab: no upload pipeline yet (task scope: wire the sheet's rows to a stub, not
 *  pickers). Shown under each tapped row until the sheet closes. */
const COMING_SOON = "Coming in the next update";

export default function ProjectScreen() {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { contentTop, contentBottom } = useShellPadding();
  const keyboardUp = useKeyboardVisible();
  const { setHeaderCenter, setHeaderLeft, setHeaderRight } = useShell();
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;

  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const projectId = firstParam(params.id);

  // Same shared hook the drawer and the Projects page read from, so a rename/pin/delete
  // made from any of the three shows up here without a manual refetch.
  const { canvases, folders, setFolders } = useCanvasesAndFolders(uid, true);
  const project = useMemo(() => (projectId ? findProject(buildProjects(folders, canvases), projectId) : null), [folders, canvases, projectId]);

  const [tab, setTab] = useState<"chats" | "sources">("chats");
  const [input, setInput] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAt, setMenuAt] = useState<MenuAnchor | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [addSourcesOpen, setAddSourcesOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // No id at all — nothing this screen can show (a bad/typed-by-hand link). Bounce to the
  // list rather than render broken, same rule canvas.tsx uses for a missing canvas id.
  useEffect(() => {
    if (!projectId) router.replace("/projects" as never);
  }, [projectId]);

  useEffect(() => {
    if (!project) return;
    const tint = project.color ?? c.blue;
    setHeaderLeft(
      <GlassSurface style={styles.moreGlass} fallbackColor={c.glassPanel} shadow>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/projects" as never))}
          style={styles.moreGlassInner}
          accessibilityRole="button"
          accessibilityLabel="Back to Projects"
          testID="project-back"
        >
          <View style={styles.backChevron}>
            <ChevronIcon size={19} color={c.text} strokeWidth={2.1} />
          </View>
        </Pressable>
      </GlassSurface>,
    );
    setHeaderCenter(
      <View style={styles.headerTitleGroup}>
        <ProjectFolderIcon size={18} color={tint} strokeWidth={1.9} />
        <Text style={styles.headerTitleText} numberOfLines={1}>
          {project.name}
        </Text>
      </View>,
    );
    setHeaderRight(
      <GlassSurface style={styles.moreGlass} fallbackColor={c.glassPanel} shadow>
        <Pressable
          onPress={(e) => {
            setMenuAt({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
            setMenuOpen(true);
          }}
          style={styles.moreGlassInner}
          accessibilityRole="button"
          accessibilityLabel="Project actions"
          testID="project-more"
        >
          <MoreDotsIcon size={19} color={c.text} />
        </Pressable>
      </GlassSurface>,
    );
    return () => {
      setHeaderLeft(null);
      setHeaderCenter(null);
      setHeaderRight(null);
    };
  }, [project, setHeaderLeft, setHeaderCenter, setHeaderRight, styles, c]);

  function closeMenu() {
    setMenuOpen(false);
    setMenuAt(null);
  }

  function togglePin() {
    if (!project || !uid) return;
    closeMenu();
    const next = !project.pinnedAt;
    setFolders((rows) => rows.map((row) => (row.id === project.id ? { ...row, pinnedAt: next ? new Date().toISOString() : null } : row)));
    void setFolderPinned(uid, project.id, next);
  }

  function confirmDeleteProject() {
    if (!project) return;
    closeMenu();
    Alert.alert(`Delete "${project.name}"?`, "Its canvases go back to Canvases. Projects inside it are deleted too.", [
      { style: "cancel", text: "Cancel" },
      {
        onPress: () => {
          if (uid) void deleteFolder(uid, project.id);
          router.replace("/projects" as never);
        },
        style: "destructive",
        text: "Delete",
      },
    ]);
  }

  async function handleRenameConfirm(value: string) {
    setRenameOpen(false);
    if (!project || !uid) return;
    const clean = value.trim();
    if (!clean) return;
    setFolders((rows) => rows.map((row) => (row.id === project.id ? { ...row, name: clean } : row)));
    void renameFolder(uid, project.id, clean);
  }

  async function handleInstructionsConfirm(value: string) {
    setInstructionsOpen(false);
    if (!project || !uid) return;
    const clean = value.trim();
    setFolders((rows) => rows.map((row) => (row.id === project.id ? { ...row, instructions: clean || null } : row)));
    void setFolderInstructions(uid, project.id, clean);
  }

  const rowActions: MenuRow[] = project
    ? [
        { icon: PinIcon, key: "pin", label: project.pinnedAt ? "Unpin" : "Pin", onPress: togglePin },
        {
          icon: PencilIcon,
          key: "edit",
          label: "Edit project",
          onPress: () => {
            closeMenu();
            setRenameOpen(true);
          },
        },
        {
          icon: SlidersIcon,
          key: "instructions",
          label: "Edit instructions",
          onPress: () => {
            closeMenu();
            setInstructionsOpen(true);
          },
        },
        { destructive: true, icon: TrashIcon, key: "delete", label: "Delete project", onPress: confirmDeleteProject },
      ]
    : [];

  function handleSend() {
    const said = input.trim();
    if (!said || !project) return;
    setInput("");
    const canvas = startCanvas();
    // canvas.tsx does not read `folder` yet — filing happens once it does (see this
    // pass's task brief). Passed now so the link is already correct when that lands.
    router.push({ params: { ask: said, c: canvas.id, folder: project.id }, pathname: "/canvas" } as never);
  }

  function notYet() {
    setNotice(COMING_SOON);
  }

  const composerBottomPad = keyboardUp ? space(3) : contentBottom - space(1);

  if (!project) {
    // Either `folders` hasn't loaded yet (about to render for real) or the id is stale
    // (the project was deleted elsewhere) — EmptyBlock rather than a blank screen either
    // way, since there is nothing here to tell the two apart without a loading flag
    // useCanvasesAndFolders doesn't expose.
    return (
      <View style={[styles.flex, { paddingTop: contentTop }]} testID="project-screen">
        <EmptyBlock title="Loading…" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0}>
      <View style={styles.flex} testID="project-screen">
        <View style={[styles.chips, { marginTop: contentTop + space(2) }]}>
          <Chip label="Chats" active={tab === "chats"} onPress={() => setTab("chats")} testID="project-tab-chats" />
          <Chip label="Sources" active={tab === "sources"} onPress={() => setTab("sources")} testID="project-tab-sources" />
        </View>

        {tab === "chats" ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: composerBottomPad + COMPOSER_COMPACT_HEIGHT + space(4), paddingTop: space(1) }}
            keyboardShouldPersistTaps="handled"
          >
            {project.canvases.length === 0 ? (
              <EmptyBlock title="No chats yet" body="Ask something below to start the first one." />
            ) : (
              project.canvases.map((canvas) => <ChatRow key={canvas.id} canvas={canvas} />)
            )}
          </ScrollView>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: contentBottom + space(4), paddingTop: space(1) }}>
            <Pressable
              style={({ pressed }) => [styles.addSourcesRow, pressed && styles.rowPressed]}
              onPress={() => setAddSourcesOpen(true)}
              accessibilityRole="button"
              testID="project-add-sources"
            >
              <View style={styles.addSourcesTile}>
                <PlusIcon size={18} color={c.text2} strokeWidth={1.9} />
              </View>
              <Text style={styles.addSourcesLabel}>Add sources</Text>
            </Pressable>
            <EmptyBlock title="No sources yet" body="Photos, files, and text you add here become part of this project's context." />
          </ScrollView>
        )}

        {tab === "chats" ? (
          <View style={[styles.composerRow, { paddingBottom: composerBottomPad }]}>
            <Composer value={input} onChangeText={setInput} onSend={handleSend} placeholder="Ask Nemesis" testID="project-composer" compact />
          </View>
        ) : null}
      </View>

      <MiniMenu visible={menuOpen} anchor={menuAt} actions={rowActions} onClose={closeMenu} testID="project-actions-menu" />
      <TextPromptSheet
        visible={renameOpen}
        title="Edit project"
        placeholder="Project name"
        initialValue={project.name}
        onConfirm={(value) => void handleRenameConfirm(value)}
        onClose={() => setRenameOpen(false)}
        testID="project-rename-sheet"
      />
      <TextPromptSheet
        visible={instructionsOpen}
        title="Edit instructions"
        placeholder="How should Nemesis approach this project?"
        initialValue={project.instructions ?? ""}
        onConfirm={(value) => void handleInstructionsConfirm(value)}
        onClose={() => setInstructionsOpen(false)}
        testID="project-instructions-sheet"
      />

      {/* Add-sources (IMG_6546): every row is a stub for now (task scope — uploads land in
          the next slice); each just posts the same inline notice rather than pretending to
          open a picker. */}
      <SlideUpSheet
        visible={addSourcesOpen}
        onClose={() => {
          setAddSourcesOpen(false);
          setNotice(null);
        }}
        title="Add sources"
        headerDivider
        testID="add-sources-sheet"
      >
        <View style={styles.addSourcesBody}>
          <SourceRow Icon={CameraIcon} label="Take photo" onPress={notYet} testID="add-sources-photo" />
          <SourceRow Icon={ImagesIcon} label="Add photos" onPress={notYet} testID="add-sources-photos" />
          <SourceRow Icon={PaperclipIcon} label="Add files" onPress={notYet} testID="add-sources-files" />
          <SourceRow Icon={ProjectFolderIcon} label="Add from library" onPress={notYet} testID="add-sources-library" />
          <SourceRow Icon={ScanTextIcon} label="Add text" onPress={notYet} testID="add-sources-text" />
          {notice ? (
            <Text style={styles.notice} testID="add-sources-notice">
              {notice}
            </Text>
          ) : null}
        </View>
      </SlideUpSheet>
    </KeyboardAvoidingView>
  );
}

/** A chat row (IMG_6543): title + one-line preview, on `row.twoLine` (66pt). Local to this
 *  screen rather than folded into ProjectRows.tsx's single-line CanvasRow — a second text
 *  line is a different shape, not a variant of the drawer's row. */
function ChatRow({ canvas }: { canvas: CanvasSummary }) {
  const styles = useThemedStyles(createStyles);
  const preview = canvas.preview?.trim() || "No messages yet";
  return (
    <Pressable
      style={({ pressed }) => [styles.chatRow, pressed && styles.rowPressed]}
      onPress={() => router.push(`/canvas?c=${canvas.id}` as never)}
      testID={`project-chat-${canvas.id}`}
    >
      <Text style={styles.chatTitle} numberOfLines={1}>
        {canvasLabel(canvas)}
      </Text>
      <Text style={styles.chatPreview} numberOfLines={1}>
        {preview}
      </Text>
    </Pressable>
  );
}

function SourceRow({
  Icon,
  label,
  onPress,
  testID,
}: {
  Icon: ComponentType<IconProps>;
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  return (
    <Pressable style={({ pressed }) => [styles.sourceRow, pressed && styles.rowPressed]} onPress={onPress} testID={testID}>
      <Icon size={21} color={c.text} strokeWidth={1.7} />
      <Text style={styles.sourceLabel}>{label}</Text>
    </Pressable>
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

    // Header (composed into TopBar's headerCenter — see the file's own doc comment for
    // why the "back" control lives here rather than in a true left slot).
    headerRow: { flexDirection: "row", alignItems: "center", gap: space(1) },
    backBtn: { width: control.md, height: control.md, alignItems: "center", justifyContent: "center" },
    // ChevronIcon points right by default; mirrored for "back". Wrapping View, not a prop
    // on the icon itself — IconProps carries no `style` field and icons.tsx is off-limits
    // for this pass.
    backChevron: { transform: [{ scaleX: -1 }] },
    headerTitleGroup: { flexDirection: "row", alignItems: "center", gap: space(1.5), flexShrink: 1 },
    headerTitleText: { ...type.title, color: c.text },

    moreGlass: { width: control.lg, height: control.lg, borderRadius: control.lg / 2, borderWidth: 1, borderColor: c.line },
    moreGlassInner: { flex: 1, alignItems: "center", justifyContent: "center" },

    // Same shape as the Projects page's chips — transparent at rest, a c.surface2 pill
    // when selected.
    chips: { flexDirection: "row", gap: space(2), marginBottom: space(2), paddingHorizontal: space(5) },
    chip: { borderRadius: radius.pill, paddingHorizontal: space(3.5), paddingVertical: space(1.5), backgroundColor: "transparent" },
    chipPressed: { backgroundColor: c.surface },
    chipActive: { backgroundColor: c.surface2 },
    chipLabel: { ...type.small, color: c.text2, fontWeight: "600" },
    chipLabelActive: { color: c.text },

    rowPressed: { backgroundColor: c.surface },

    chatRow: { justifyContent: "center", height: row.twoLine, paddingHorizontal: space(5), gap: 2 },
    chatTitle: { ...type.label, color: c.text, fontWeight: "600" },
    chatPreview: { ...type.small, color: c.text2 },

    addSourcesRow: { flexDirection: "row", alignItems: "center", gap: space(3), height: row.list, paddingHorizontal: space(5) },
    addSourcesTile: {
      width: 34, height: 34, borderRadius: radius.md, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center",
    },
    addSourcesLabel: { ...type.label, color: c.text },

    composerRow: { paddingHorizontal: space(3), paddingTop: space(2) },

    addSourcesBody: { paddingBottom: space(4) },
    sourceRow: { flexDirection: "row", alignItems: "center", gap: space(3.5), height: row.menu + 6, paddingHorizontal: space(5) },
    sourceLabel: { ...type.label, color: c.text },
    notice: { ...type.small, color: c.text3, paddingHorizontal: space(5), paddingTop: space(2) },
  });
