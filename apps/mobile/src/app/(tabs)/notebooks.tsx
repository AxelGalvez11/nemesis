import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "@/auth/AuthProvider";
import { useShell } from "@/components/AppDrawer";
import { useShellPadding } from "@/components/shell-chrome";
import { GlassSurface } from "@/components/GlassSurface";
import { SlideUpSheet } from "@/components/StudySheet";
import { EmptyBlock, MissionButton } from "@/components/mission-ui";
import { NotebookIcon, PlusIcon } from "@/components/icons";
import { createNotebook, deleteNotebookById, listNotebooks, renameNotebookById, type Notebook } from "@/api/notebooks";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Notebooks list (phone port of apps/web/components/workspace/notebooks/notebooks-landing.tsx):
// a notebook keeps a set of sources, a standing instruction, and its own chats together — the
// same shape as web's "Projects". This screen only lists + creates + renames + deletes; the
// grounded chat, sources, and outputs live on the detail screen (app/notebook.tsx). Same
// load-on-focus + pull-to-refresh idiom as (tabs)/study.tsx.

type LoadStatus = "idle" | "loading" | "loaded" | "error";

function relativeTime(iso: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function NotebooksScreen() {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { contentTop, contentBottom } = useShellPadding();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const { setHeaderTitle, setHeaderRight } = useShell();

  const [status, setStatus] = useState<LoadStatus>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Create sheet (title prompt) + per-row actions sheet (Rename / Delete) + the rename
  // prompt it can open. Only one of the three is ever visible at a time.
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [actionsFor, setActionsFor] = useState<Notebook | null>(null);
  const [renameTarget, setRenameTarget] = useState<Notebook | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setHeaderTitle("Notebooks");
    return () => setHeaderTitle(null);
  }, [setHeaderTitle]);

  const load = useCallback(async () => {
    setStatus((prev) => (prev === "loaded" ? prev : "loading"));
    setLoadError(null);
    try {
      setNotebooks(await listNotebooks());
      setStatus("loaded");
    } catch (cause) {
      setStatus("error");
      setLoadError(cause instanceof Error ? cause.message : "Couldn't load your notebooks.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (userId) void load();
    }, [load, userId]),
  );

  const openNotebook = useCallback((id: string) => {
    router.push({ params: { id }, pathname: "/notebook" });
  }, []);

  const handleCreate = useCallback(
    async (name: string) => {
      setCreating(true);
      try {
        const created = await createNotebook(name || "Untitled notebook");
        if (!created) {
          Alert.alert("Couldn't create notebook", "Check your connection and that you're signed in.");
          return;
        }
        setNotebooks((prev) => [created, ...prev]);
        setCreateOpen(false);
        openNotebook(created.id);
      } finally {
        setCreating(false);
      }
    },
    [openNotebook],
  );

  const handleRename = useCallback(async (name: string) => {
    if (!renameTarget) return;
    const id = renameTarget.id;
    setSaving(true);
    try {
      await renameNotebookById(id, name || "Untitled notebook");
      setNotebooks((prev) => prev.map((n) => (n.id === id ? { ...n, name: name || "Untitled notebook" } : n)));
      setRenameTarget(null);
    } catch {
      Alert.alert("Couldn't rename", "Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }, [renameTarget]);

  const confirmDelete = useCallback((notebook: Notebook) => {
    setActionsFor(null);
    Alert.alert(
      "Delete notebook?",
      `Are you sure you want to delete "${notebook.name}"? Its sources and chats are removed. This can't be undone.`,
      [
        { style: "cancel", text: "Cancel" },
        {
          onPress: () => {
            void deleteNotebookById(notebook.id)
              .then(() => setNotebooks((prev) => prev.filter((n) => n.id !== notebook.id)))
              .catch(() => Alert.alert("Couldn't delete", "Check your connection and try again."));
          },
          style: "destructive",
          text: "Delete",
        },
      ],
    );
  }, []);

  // "+" lives in the shared TopBar right slot (same slot chat.tsx's "…" uses).
  useEffect(() => {
    setHeaderRight(
      <GlassSurface style={styles.headerBtn} fallbackColor={c.glassPanel} shadow>
        <Pressable
          style={styles.headerBtnInner}
          onPress={() => setCreateOpen(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="New notebook"
          testID="notebooks-new"
        >
          <PlusIcon size={19} color={c.text} />
        </Pressable>
      </GlassSurface>,
    );
    return () => setHeaderRight(null);
  }, [c, styles, setHeaderRight]);

  if (!userId) {
    return (
      <View style={[styles.centerWrap, { paddingTop: contentTop, paddingBottom: contentBottom }]} testID="notebooks-signin">
        <EmptyBlock title="Sign in for notebooks" body="Notebooks live in your account — sign in to gather sources and chat about them here." />
        <MissionButton label="Sign in" variant="primary" testID="notebooks-goto-signin" onPress={() => router.push("/sign-in")} />
      </View>
    );
  }

  if (status === "idle" || status === "loading") return <View style={styles.flex} testID="notebooks-loading" />;

  if (status === "error") {
    return (
      <View style={[styles.centerWrap, { paddingTop: contentTop, paddingBottom: contentBottom }]} testID="notebooks-error">
        <EmptyBlock title="Notebooks couldn't load" body={loadError ?? "Something went wrong."} />
        <MissionButton label="Try again" variant="primary" testID="notebooks-retry" onPress={() => void load()} />
      </View>
    );
  }

  return (
    <View style={styles.flex} testID="notebooks-screen">
      <ScrollView
        style={styles.flex}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.listBody, { paddingTop: contentTop + space(2), paddingBottom: contentBottom + space(4) }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={c.text2}
            onRefresh={() => {
              setRefreshing(true);
              void load().finally(() => setRefreshing(false));
            }}
          />
        }
      >
        {notebooks.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyBlock
              title="No notebooks yet"
              body="A notebook keeps a set of sources, a standing instruction, and its own chat together."
            />
            <View style={styles.emptyCreateBtn}>
              <MissionButton label="New notebook" variant="primary" testID="notebooks-empty-create" onPress={() => setCreateOpen(true)} />
            </View>
          </View>
        ) : (
          notebooks.map((n) => {
            const modified = relativeTime(n.updatedAt);
            return (
              <View key={n.id} style={styles.rowWrap}>
                <Pressable
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                  onPress={() => openNotebook(n.id)}
                  testID={`notebook-${n.id}`}
                  accessibilityRole="button"
                >
                  <View style={styles.iconTile}>
                    <NotebookIcon size={18} color={c.text2} />
                  </View>
                  <Text style={styles.rowTitle} numberOfLines={1}>{n.name}</Text>
                  {modified ? <Text style={styles.rowMeta}>{modified}</Text> : null}
                </Pressable>
                <Pressable
                  style={styles.kebab}
                  onPress={() => setActionsFor(n)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`${n.name} actions`}
                  testID={`notebook-actions-${n.id}`}
                >
                  <DotsIcon size={18} color={c.text2} />
                </Pressable>
              </View>
            );
          })
        )}
      </ScrollView>

      <SlideUpSheet visible={actionsFor !== null} onClose={() => setActionsFor(null)} title={actionsFor?.name ?? "Notebook"} testID="notebook-actions-sheet">
        <Pressable
          style={({ pressed }) => [styles.sheetRow, pressed && styles.sheetRowPressed]}
          onPress={() => {
            const target = actionsFor;
            setActionsFor(null);
            if (target) setRenameTarget(target);
          }}
          testID="notebook-action-rename"
        >
          <Text style={styles.sheetRowLabel}>Rename</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.sheetRow, styles.sheetDivider, pressed && styles.sheetRowPressed]}
          onPress={() => actionsFor && confirmDelete(actionsFor)}
          testID="notebook-action-delete"
        >
          <Text style={[styles.sheetRowLabel, styles.sheetRowDanger]}>Delete</Text>
        </Pressable>
      </SlideUpSheet>

      <TitlePromptSheet
        visible={createOpen}
        title="New notebook"
        placeholder="Notebook title"
        initialValue=""
        confirmLabel="Create"
        busy={creating}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />

      <TitlePromptSheet
        visible={renameTarget !== null}
        title="Rename notebook"
        placeholder="Notebook title"
        initialValue={renameTarget?.name ?? ""}
        confirmLabel="Save"
        busy={saving}
        onClose={() => setRenameTarget(null)}
        onSubmit={handleRename}
      />
    </View>
  );
}

/** A SlideUpSheet with one TextInput + Cancel/Confirm — shared shape for "New notebook" and
 *  "Rename notebook" (the only two places this app needs a title prompt). Re-seeds its value
 *  from `initialValue` every time it opens, so a stale prior sheet's typing never leaks into
 *  the next one. */
function TitlePromptSheet({
  visible,
  title,
  placeholder,
  initialValue,
  confirmLabel,
  busy,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  placeholder: string;
  initialValue: string;
  confirmLabel: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (value: string) => void;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  // The sheet is always mounted (SlideUpSheet keeps children rendered for its
  // close animation), so `autoFocus` would fire at SCREEN mount and pop the
  // keyboard the moment the page opens. Focus explicitly when the sheet
  // actually opens, after the slide-in has mostly landed (same pattern as
  // NoteListSheet).
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 260);
    return () => clearTimeout(timer);
  }, [visible]);

  return (
    <SlideUpSheet visible={visible} onClose={onClose} title={title} testID="notebook-title-sheet">
      <TextInput
        ref={inputRef}
        style={styles.promptInput}
        value={value}
        onChangeText={setValue}
        placeholder={placeholder}
        placeholderTextColor={c.text3}
        maxLength={200}
        returnKeyType="done"
        onSubmitEditing={() => value.trim() && onSubmit(value.trim())}
        testID="notebook-title-input"
      />
      <View style={styles.promptRow}>
        <View style={styles.promptBtn}>
          <MissionButton label="Cancel" variant="secondary" onPress={onClose} testID="notebook-title-cancel" />
        </View>
        <View style={styles.promptBtn}>
          <MissionButton
            label={confirmLabel}
            variant="primary"
            busy={busy}
            disabled={!value.trim()}
            onPress={() => onSubmit(value.trim())}
            testID="notebook-title-confirm"
          />
        </View>
      </View>
    </SlideUpSheet>
  );
}

function DotsIcon({ size = 20, color }: { size?: number; color: string }) {
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color, fontSize: size * 0.7, fontWeight: "700", marginTop: -size * 0.35 }}>···</Text>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    centerWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(6), gap: space(4), backgroundColor: c.bg },

    listBody: { paddingHorizontal: space(4), gap: space(2.5), flexGrow: 1 },
    emptyWrap: { paddingTop: space(10), gap: space(4), alignItems: "center" },
    emptyCreateBtn: { alignSelf: "center" },

    rowWrap: { position: "relative" },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: space(3),
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      paddingVertical: space(3.5),
      paddingHorizontal: space(3.5),
      paddingRight: space(9),
    },
    rowPressed: { backgroundColor: c.surface2 },
    iconTile: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: c.glass, alignItems: "center", justifyContent: "center" },
    rowTitle: { ...type.bodyStrong, color: c.text, flex: 1, minWidth: 0 },
    rowMeta: { ...type.micro, color: c.text3, fontVariant: ["tabular-nums"] },
    kebab: { position: "absolute", right: space(2.5), top: 0, bottom: 0, width: 36, alignItems: "center", justifyContent: "center" },

    // Rename/Delete actions sheet.
    sheetRow: { paddingVertical: space(3.5), paddingHorizontal: space(1) },
    sheetRowPressed: { backgroundColor: c.surface },
    sheetDivider: { borderTopWidth: 1, borderTopColor: c.line },
    sheetRowLabel: { ...type.body, color: c.text },
    sheetRowDanger: { color: c.danger },

    // Title-prompt sheet (New / Rename).
    promptInput: {
      ...type.body,
      color: c.text,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radius.md,
      paddingHorizontal: space(3.5),
      paddingVertical: space(2.5),
      marginBottom: space(4),
    },
    promptRow: { flexDirection: "row", gap: space(2.5) },
    promptBtn: { flex: 1 },

    headerBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: c.line },
    headerBtnInner: { flex: 1, alignItems: "center", justifyContent: "center" },
  });
