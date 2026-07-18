import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/auth/AuthProvider";
import { useShell } from "@/components/AppDrawer";
import { Composer } from "@/components/Composer";
import { useKeyboardVisible, useShellPadding } from "@/components/shell-chrome";
import { EmptyBlock, StatusPill, Surface } from "@/components/mission-ui";
import { createMission, isDesktopOnline, listMissions, statusLabel, type Mission } from "@/api/missions";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { space, type } from "@/theme/tokens";

// Sessions home — the app's "/" route. Composer at the bottom starts a session
// (dispatched to the agent; the desktop runs it today); the list above shows every
// session the student has started, newest first, with a live-ish status
// (desktop-online polling, not full realtime — the detail screen is where events
// stream live). User-facing wording is "session" (cloud-first rename, owner call
// 2026-07-17); code identifiers keep the original "mission" names to match the
// wire format and tables. Colors come from the theme context (see theme/palette.ts).

const DESKTOP_POLL_MS = 60_000;

function relativeTime(iso: string): string {
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

export default function MissionsHome() {
  const { session } = useAuth();
  const { resetNonce } = useShell();
  const { contentTop, contentBottom } = useShellPadding();
  const keyboardUp = useKeyboardVisible();
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [desktopOnline, setDesktopOnline] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  const refresh = useCallback(async () => {
    try {
      const rows = await listMissions();
      setMissions(rows);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    void refresh().finally(() => setLoading(false));
  }, [session, refresh]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const poll = async () => {
      const online = await isDesktopOnline();
      if (!cancelled) setDesktopOnline(online);
    };
    void poll();
    const timer = setInterval(() => void poll(), DESKTOP_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [session]);

  // "New session" (drawer) lands back here (already home) and focuses the composer.
  useEffect(() => {
    if (resetNonce === 0) return;
    inputRef.current?.focus();
  }, [resetNonce]);

  if (!session) {
    return (
      <View style={[styles.guestWrap, { paddingTop: contentTop, paddingBottom: contentBottom }]} testID="missions-guest">
        <EmptyBlock title="Browsing as guest" body="Sign in to start a session." />
      </View>
    );
  }

  const submit = async () => {
    const trimmed = prompt.trim();
    if (trimmed.length < 3 || sending) return;
    setSending(true);
    setError(null);
    try {
      const created = await createMission(trimmed);
      setMissions((prev) => [created, ...prev]);
      setPrompt("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      // With behavior="padding", the offset must equal this view's distance from
      // the WINDOW top. Since the glass redesign the TopBar is an OVERLAY — this
      // screen starts at the window top, so the offset is 0 (the bar's height now
      // lives in the scroll content's paddingTop instead; see shell-chrome.ts).
      keyboardVerticalOffset={0}
    >
      {loading ? (
        <View style={styles.centered} testID="missions-loading">
          <ActivityIndicator color={c.text} />
        </View>
      ) : (
        <FlatList
          testID="missions-list"
          data={missions}
          keyExtractor={(m) => m.id}
          contentContainerStyle={[missions.length ? styles.list : styles.listEmpty, { paddingTop: contentTop + space(2) }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await refresh();
                setRefreshing(false);
              }}
              tintColor={c.text2}
            />
          }
          ListEmptyComponent={
            <EmptyBlock
              title="No sessions yet"
              body="Tell Nemesis what to work on below — it keeps working even while you're away."
            />
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push(`/mission/${item.id}`)} testID={`mission-row-${item.id}`}>
              <Surface style={styles.row}>
                <View style={styles.rowTop}>
                  <Text style={styles.rowTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <StatusPill status={item.status} label={statusLabel(item, desktopOnline)} />
                </View>
                <Text style={styles.rowTime}>{relativeTime(item.updated_at || item.created_at)}</Text>
              </Surface>
            </Pressable>
          )}
        />
      )}

      {error ? <Text style={styles.err}>{error}</Text> : null}
      {!desktopOnline ? (
        <Text style={styles.offlineNote} testID="desktop-offline-note">
          Nemesis on your Mac is offline — this session will start when it opens.
        </Text>
      ) : null}

      <View style={[styles.composerWrap, { paddingBottom: keyboardUp ? space(3) : contentBottom - space(1) }]}>
        <Composer
          value={prompt}
          onChangeText={setPrompt}
          onSend={() => void submit()}
          onPlus={() => setPrompt("")}
          sending={sending}
          placeholder="What should Nemesis work on?"
          inputRef={inputRef}
          testID="mission-composer-input"
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    centered: { flex: 1, alignItems: "center", justifyContent: "center" },
    guestWrap: { flex: 1, backgroundColor: c.bg },

    list: { padding: space(4), gap: space(3) },
    listEmpty: { flex: 1, padding: space(4) },
    row: { gap: space(1.5) },
    rowTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: space(3) },
    rowTitle: { flex: 1, ...type.bodyStrong, color: c.text },
    rowTime: { ...type.micro, color: c.text2 },

    err: { ...type.small, color: c.accent, paddingHorizontal: space(4), paddingBottom: space(1) },
    offlineNote: { ...type.micro, color: c.text2, paddingHorizontal: space(4), paddingBottom: space(1.5) },

    composerWrap: {
      paddingHorizontal: space(3.5),
      paddingTop: space(2.5),
    },
  });
