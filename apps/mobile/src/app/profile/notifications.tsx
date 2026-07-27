import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";
import { setStudyReminder } from "@/lib/push";

// Notifications are deliberately small and real: the student can schedule a
// private on-device daily study reminder. We do not expose product-update
// controls until a delivery preference is actually wired behind them.

interface NotificationPrefs {
  studyReminders: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = { studyReminders: false };

const storeKeyFor = (uid: string) => `nemesis_notification_prefs_v1_${uid}`;

function parsePrefs(raw: string | null): NotificationPrefs {
  try {
    const parsed = raw ? (JSON.parse(raw) as Partial<NotificationPrefs>) : null;
    return {
      studyReminders: typeof parsed?.studyReminders === "boolean" ? parsed.studyReminders : DEFAULT_PREFS.studyReminders,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);
  const { session } = useAuth();
  const uid = session?.user.id ?? null;

  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    void SecureStore.getItemAsync(storeKeyFor(uid))
      .then((raw) => {
        if (alive) setPrefs(parsePrefs(raw));
      })
      .catch(() => {
        if (alive) setPrefs(DEFAULT_PREFS);
      });
    return () => {
      alive = false;
    };
  }, [uid]);

  const update = (next: Partial<NotificationPrefs>) => {
    setPrefs((current) => {
      const updated = { ...current, ...next };
      if (uid) void SecureStore.setItemAsync(storeKeyFor(uid), JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  };

  const changeStudyReminder = async (enabled: boolean) => {
    if (!uid) return;
    setError(null);
    const result = await setStudyReminder(uid, enabled);
    update({ studyReminders: result.enabled });
    setError(result.error);
  };

  return (
    <View style={styles.root} testID="notifications-screen">
      <View style={[styles.header, { paddingTop: insets.top + space(2) }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back} testID="notifications-back">
          <Text style={styles.backText}>‹ Settings</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space(6) }]}>
        <Text style={styles.title}>Notifications</Text>
        <Text style={styles.subtitle}>
          Choose what deserves your attention. Study reminders are scheduled privately on this device.
        </Text>

        {!uid ? (
          <Text style={styles.guest} testID="notifications-guest">You're not signed in.</Text>
        ) : (
          <>
            {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
            <View style={styles.card}>
              <ToggleRow
                styles={styles}
                label="Daily study reminder"
                description="A quiet reminder at 7:00 PM to review due cards and scheduled work."
                value={prefs.studyReminders}
                onChange={(studyReminders) => void changeStudyReminder(studyReminders)}
                last
                testID="toggle-study-reminders"
              />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function ToggleRow({
  styles,
  label,
  description,
  value,
  onChange,
  last,
  testID,
}: {
  styles: Styles;
  label: string;
  description: string;
  value: boolean;
  onChange: (next: boolean) => void;
  last?: boolean;
  testID: string;
}) {
  return (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowDescription}>{description}</Text>
      </View>
      <Toggle value={value} onChange={onChange} label={label} testID={testID} />
    </View>
  );
}

function Toggle({
  value,
  onChange,
  label,
  testID,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  label: string;
  testID: string;
}) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      hitSlop={8}
      onPress={() => onChange(!value)}
      style={{
        alignItems: value ? "flex-end" : "flex-start",
        backgroundColor: value ? c.accent : c.surface2,
        borderColor: value ? c.accent : c.line2,
        borderRadius: radius.pill,
        borderWidth: 1,
        height: 27,
        justifyContent: "center",
        padding: 2,
        width: 46,
      }}
    >
      <View style={{ backgroundColor: "#ffffff", borderRadius: 999, height: 21, width: 21 }} />
    </Pressable>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: { paddingHorizontal: space(3), paddingBottom: space(1) },
    back: { alignSelf: "flex-start", paddingVertical: space(1) },
    backText: { fontSize: type.small.fontSize + 1, color: c.accent, fontWeight: "500" },
    body: { paddingHorizontal: space(5), flexGrow: 1 },
    title: { ...type.h1, color: c.text, marginBottom: space(1), marginTop: space(1) },
    subtitle: { fontSize: type.micro.fontSize, lineHeight: 19, color: c.text3, marginBottom: space(4) },
    guest: { fontSize: type.small.fontSize, color: c.text2, marginTop: space(4) },
    error: {
      ...type.small,
      color: c.danger,
      backgroundColor: c.surface2,
      borderRadius: radius.md,
      padding: space(3),
      marginBottom: space(3),
    },

    card: { backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.line, overflow: "hidden" },
    row: { flexDirection: "row", alignItems: "center", gap: space(3), paddingHorizontal: space(3.5), paddingVertical: space(3.25), minHeight: 60 },
    rowDivider: { borderBottomWidth: 1, borderBottomColor: c.line },
    rowText: { flex: 1, gap: space(0.5) },
    rowLabel: { fontSize: type.small.fontSize + 1, color: c.text },
    rowDescription: { fontSize: type.micro.fontSize, lineHeight: 18, color: c.text3 },
  });

type Styles = ReturnType<typeof createStyles>;
