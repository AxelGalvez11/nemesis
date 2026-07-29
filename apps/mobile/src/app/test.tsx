import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getStudyArtifact, type StudyArtifact } from "@/api/studyArtifacts";
import { TestRunner } from "@/components/StudyArtifactsPanel";
import { CloseIcon } from "@/components/icons";
import { SkeletonDeckList } from "@/components/Skeleton";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { control, space, type } from "@/theme/tokens";

export default function TestScreen() {
  const params = useLocalSearchParams<{ testId?: string }>();
  const testId = Array.isArray(params.testId) ? params.testId[0] : params.testId;
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [artifact, setArtifact] = useState<StudyArtifact | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!testId) {
      setArtifact(null);
      return;
    }
    void getStudyArtifact(testId)
      .then((next) => {
        if (alive) setArtifact(next?.kind === "test" ? next : null);
      })
      .catch((cause) => {
        if (!alive) return;
        setArtifact(null);
        setError(cause instanceof Error ? cause.message : "Couldn't load that test.");
      });
    return () => {
      alive = false;
    };
  }, [testId]);

  const close = () => (router.canGoBack() ? router.back() : router.replace("/study?section=tests"));

  return (
    <View style={styles.root} testID="test-screen">
      <Stack.Screen options={{ gestureEnabled: false, headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + space(1) }]}>
        <View style={styles.heading}>
          <Text numberOfLines={1} style={styles.title}>{artifact?.title ?? "Practice test"}</Text>
          {artifact?.groupName ? <Text numberOfLines={1} style={styles.group}>{artifact.groupName}</Text> : null}
        </View>
        <Pressable
          accessibilityLabel="Close test"
          onPress={close}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
        >
          <CloseIcon color={c.text} size={18} />
        </Pressable>
      </View>
      <View style={[styles.body, { paddingBottom: insets.bottom }]}>
        {artifact === undefined ? (
          <SkeletonDeckList testID="test-loading" />
        ) : artifact ? (
          <TestRunner
            artifact={artifact}
            onError={setError}
            onFinished={(attempts) => setArtifact((current) => current ? { ...current, attempts } : current)}
          />
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Test unavailable</Text>
            <Text style={styles.emptyBody}>{error ?? "This test may have been removed."}</Text>
          </View>
        )}
      </View>
      {artifact && error ? <Text style={[styles.notice, { bottom: insets.bottom + space(2) }]}>{error}</Text> : null}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      minHeight: 62,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: space(4),
      paddingBottom: space(2),
      gap: space(3),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.line,
    },
    heading: { flex: 1, gap: 2 },
    title: { ...type.bodyStrong, color: c.text },
    group: { ...type.micro, color: c.textHint },
    close: {
      width: control.lg,
      height: control.lg,
      borderRadius: control.lg / 2,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.surface2,
    },
    pressed: { opacity: 0.65 },
    body: { flex: 1 },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(8) },
    emptyTitle: { ...type.h2, color: c.text },
    emptyBody: { ...type.small, color: c.textHint, textAlign: "center", marginTop: space(2) },
    notice: {
      position: "absolute",
      alignSelf: "center",
      ...type.micro,
      color: c.text,
      backgroundColor: c.surface2,
      borderRadius: 999,
      overflow: "hidden",
      paddingHorizontal: space(3),
      paddingVertical: space(2),
    },
  });
