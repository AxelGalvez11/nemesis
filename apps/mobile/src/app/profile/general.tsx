import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { placeholderColor, useCommon } from "@/theme/common";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";
import {
  DEFAULT_GENERAL_PREFS,
  GENERAL_LANGUAGES,
  GENERAL_TONES,
  generalPrefsStoreKey,
  parseGeneralPrefs,
  type GeneralPrefs,
} from "@/lib/general-prefs";

// General — phone half of the cloud-first settings port (build spec §11). Same
// four fields as web's Settings > General (apps/web/components/SettingsSurface.tsx):
// language, tone, nickname, occupation. Stored on-device only, per signed-in
// account. Chat reads the same key before every turn, so these preferences are
// now real behavior rather than decorative settings.

export default function GeneralScreen() {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);
  const common = useCommon();
  const { colors: c } = useTheme();
  const { session } = useAuth();
  const uid = session?.user.id ?? null;

  const [prefs, setPrefs] = useState<GeneralPrefs>(DEFAULT_GENERAL_PREFS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    if (!uid) return;
    let alive = true;
    void SecureStore.getItemAsync(generalPrefsStoreKey(uid))
      .then((raw) => {
        if (alive) setPrefs(parseGeneralPrefs(raw));
      })
      .catch(() => {
        if (alive) setPrefs(DEFAULT_GENERAL_PREFS);
      })
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [uid]);

  // Debounced write-through: avoids a SecureStore call on every keystroke while
  // still saving promptly. Skipped until the initial load resolves so a fresh
  // screen open never overwrites what's already stored with the in-memory
  // defaults.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!uid || !loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void SecureStore.setItemAsync(generalPrefsStoreKey(uid), JSON.stringify(prefs)).catch(() => {});
    }, 300);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [prefs, uid, loaded]);

  const update = (next: Partial<GeneralPrefs>) => setPrefs((current) => ({ ...current, ...next }));

  return (
    <View style={styles.root} testID="general-screen">
      <View style={[styles.header, { paddingTop: insets.top + space(2) }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back} testID="general-back">
          <Text style={styles.backText}>‹ Settings</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space(6) }]}>
        <Text style={styles.title}>General</Text>
        <Text style={styles.subtitle}>
          Shape how Nemesis writes and addresses you. Changes apply to your next chat message on this device.
        </Text>

        {!uid ? (
          <Text style={styles.guest} testID="general-guest">You're not signed in.</Text>
        ) : (
          <>
            <Text style={styles.label}>Language</Text>
            <OptionCard styles={styles} options={GENERAL_LANGUAGES} value={prefs.language} onChange={(language) => update({ language })} testIDPrefix="language" />

            <Text style={styles.label}>Tone</Text>
            <OptionCard styles={styles} options={GENERAL_TONES} value={prefs.tone} onChange={(tone) => update({ tone })} testIDPrefix="tone" />

            <Text style={styles.label}>Nickname</Text>
            <TextInput
              testID="general-nickname"
              style={common.input}
              placeholder="What should Nemesis call you?"
              placeholderTextColor={placeholderColor(c)}
              maxLength={40}
              value={prefs.nickname}
              onChangeText={(nickname) => update({ nickname })}
            />

            <Text style={styles.label}>Occupation</Text>
            <TextInput
              testID="general-occupation"
              style={common.input}
              placeholder="Student, researcher…"
              placeholderTextColor={placeholderColor(c)}
              maxLength={60}
              value={prefs.occupation}
              onChangeText={(occupation) => update({ occupation })}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

function OptionCard({
  styles,
  options,
  value,
  onChange,
  testIDPrefix,
}: {
  styles: Styles;
  options: string[];
  value: string;
  onChange: (option: string) => void;
  testIDPrefix: string;
}) {
  return (
    <View style={styles.card}>
      {options.map((option, index) => (
        <Pressable
          key={option}
          testID={`${testIDPrefix}-${option}`}
          onPress={() => onChange(option)}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === option }}
          accessibilityLabel={option}
          style={[styles.optionRow, index < options.length - 1 && styles.optionDivider]}
        >
          <Text style={styles.optionLabel}>{option}</Text>
          {value === option ? <Text style={styles.optionCheck}>✓</Text> : null}
        </Pressable>
      ))}
    </View>
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

    label: { fontSize: type.micro.fontSize, fontWeight: "600", color: c.text3, marginTop: space(4), marginBottom: space(2) },

    card: { backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.line, overflow: "hidden" },
    optionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space(3.5), paddingVertical: space(3.25), minHeight: 50 },
    optionDivider: { borderBottomWidth: 1, borderBottomColor: c.line },
    optionLabel: { fontSize: type.small.fontSize + 1, color: c.text },
    optionCheck: { fontSize: type.small.fontSize + 1, color: c.accent, fontWeight: "700" },
  });

type Styles = ReturnType<typeof createStyles>;
