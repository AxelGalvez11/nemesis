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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { useShell } from "@/components/AppDrawer";
import { EmptyBlock, MissionButton, StatusPill, Surface } from "@/components/mission-ui";
import { createMission, isDesktopOnline, listMissions, statusLabel, type Mission } from "@/api/missions";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Missions home (§Task 8) — the app's "/" route, replacing the old PharmaOrb chat
// screen. Composer at the bottom dispatches a mission to the desktop agent; the list
// above shows every mission the student has sent, newest first, with a live-ish
// status (desktop-online polling, not full realtime — the detail screen is where
// events stream live). Colors come from the theme context (see theme/palette.ts).

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
  const insets = useSafeAreaInsets();
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

  // "New mission" (drawer) lands back here (already home) and focuses the composer.
  useEffect(() => {
    if (resetNonce === 0) return;
    inputRef.current?.focus();
  }, [resetNonce]);

  if (!session) {
    return (
      <View style={styles.guestWrap} testID="missions-guest">
        <EmptyBlock title="Browsing as guest" body="Sign in to dispatch a mission to your Mac." />
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
      // the WINDOW top — here, the (tabs) shell's TopBar above the <Slot/>:
      // safe-area inset + bar chrome (~58pt). The old hardcoded 8 under-padded by
      // the bar's height, burying the composer + Send behind the keyboard (owner
      // report: "the chat didn't work" — Send was never visible while typing).
      keyboardVerticalOffset={insets.top + 58}
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
          contentContainerStyle={missions.length ? styles.list : styles.listEmpty}
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
              title="No missions yet"
              body="Tell Nemesis what to work on below — it runs on your Mac, even while you're away from it."
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
          Your Mac is offline — this will start when Nemesis opens there.
        </Text>
      ) : null}

      <View style={styles.composerWrap}>
        <TextInput
          ref={inputRef}
          testID="mission-composer-input"
          style={styles.input}
          placeholder="What should Nemesis work on?"
          placeholderTextColor={c.text2}
          value={prompt}
          onChangeText={setPrompt}
          multiline
          editable={!sending}
        />
        <MissionButton
          testID="mission-composer-send"
          label={sending ? "Sending…" : "Send"}
          variant="primary"
          busy={sending}
          disabled={prompt.trim().length < 3}
          onPress={() => void submit()}
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
      flexDirection: "row",
      alignItems: "flex-end",
      gap: space(2.5),
      paddingHorizontal: space(3.5),
      paddingTop: space(2.5),
      paddingBottom: space(6),
      backgroundColor: c.bg,
    },
    input: {
      flex: 1,
      maxHeight: 120,
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.glass,
      borderRadius: radius.md,
      paddingHorizontal: space(3.5),
      paddingVertical: space(2.75),
      color: c.text,
      fontSize: 15.5,
    },
  });
