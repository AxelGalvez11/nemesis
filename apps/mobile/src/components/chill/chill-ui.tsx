// The furniture every Chill game shares: the one-line status message above the
// board, the "Play another" pill that appears once a puzzle is finished, and
// the small pill button the games use for their own actions.
//
// Kept in one file so eight games cannot drift into eight slightly different
// buttons — the same reason the web games all reach for one <Button>.

import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

/** How long a transient message stays up. Matches the web's 1800ms. */
const NOTICE_MS = 1800;

/**
 * A message that clears itself. Returns the current text and a `say` that
 * replaces it — a later message always wins, and only the message that set the
 * timer can clear it, so a fast second message is not cut short by the first
 * one's timeout.
 */
export function useNotice(): [string | null, (text: string) => void] {
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const say = useCallback((text: string) => {
    setNotice(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setNotice((now) => (now === text ? null : now));
    }, NOTICE_MS);
  }, []);

  return [notice, say];
}

/**
 * The status line and the finished-puzzle action, in the fixed-height slot
 * every board sits under. The height is fixed on purpose: a message appearing
 * must not shove the board down a row mid-game.
 */
export function GameBar({
  notice,
  endMessage,
  finished,
  onPlayAnother,
  testID,
}: {
  notice: string | null;
  endMessage: string;
  finished: boolean;
  onPlayAnother: () => void;
  testID?: string;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.bar}>
      <Text style={styles.notice} numberOfLines={2} accessibilityLiveRegion="polite" testID={testID}>
        {notice ?? endMessage}
      </Text>
      {finished ? <ChillPill label="Play another" onPress={onPlayAnother} testID="chill-play-another" /> : null}
    </View>
  );
}

/** The games' own small action — "Check", "Clear", "Play another". */
export function ChillPill({
  label,
  onPress,
  tone = "quiet",
  disabled = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  tone?: "quiet" | "loud";
  disabled?: boolean;
  testID?: string;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      testID={testID}
      style={({ pressed }) => [
        styles.pill,
        tone === "loud" && styles.pillLoud,
        disabled && styles.pillDisabled,
        pressed && !disabled && styles.pillPressed,
      ]}
    >
      <Text style={[styles.pillText, tone === "loud" && styles.pillTextLoud]}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    bar: { alignItems: "center", gap: space(2), minHeight: 54, justifyContent: "flex-start" },
    notice: { ...type.small, color: c.text2, textAlign: "center", minHeight: 22 },

    pill: {
      paddingHorizontal: space(4),
      paddingVertical: space(2),
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.line2,
      backgroundColor: c.surface,
    },
    pillLoud: { backgroundColor: c.accent, borderColor: c.accent },
    // Disabled reads through the muted fill, never by fading the label —
    // the app-wide rule (owner 2026-07-22: text at full strength everywhere).
    pillDisabled: { backgroundColor: c.surface2, borderColor: c.line },
    pillPressed: { opacity: 0.7 },
    pillText: { ...type.small, fontWeight: "600", color: c.text },
    pillTextLoud: { color: c.onAccent },
  });
