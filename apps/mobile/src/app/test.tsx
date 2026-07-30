import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getStudyArtifact, type StudyArtifact } from "@/api/studyArtifacts";
import { TestRunner } from "@/components/StudyArtifactsPanel";
import { CloseIcon } from "@/components/icons";
import { SkeletonDeckList } from "@/components/Skeleton";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { control, space, type } from "@/theme/tokens";

const HEADER_VISIBLE_MS = 5000;

export default function TestScreen() {
  const params = useLocalSearchParams<{ testId?: string }>();
  const testId = Array.isArray(params.testId) ? params.testId[0] : params.testId;
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [artifact, setArtifact] = useState<StudyArtifact | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [headerShown, setHeaderShown] = useState(false);
  const headerFade = useRef(new Animated.Value(0)).current;

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
  const headerVisible = headerShown || !artifact;

  useEffect(() => {
    if (!headerShown) return;
    const timer = setTimeout(() => setHeaderShown(false), HEADER_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [headerShown]);

  useEffect(() => {
    Animated.timing(headerFade, {
      toValue: headerVisible ? 1 : 0,
      duration: headerVisible ? 160 : 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [headerFade, headerVisible]);

  return (
    <View style={styles.root} testID="test-screen">
      <Stack.Screen options={{ gestureEnabled: false, headerShown: false }} />
      <Animated.View
        pointerEvents={headerVisible ? "auto" : "none"}
        style={[
          styles.header,
          {
            opacity: headerFade,
            paddingTop: insets.top + space(1),
            transform: [
              {
                translateY: headerFade.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-12, 0],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.heading}>
          <Text numberOfLines={1} style={styles.title}>{artifact?.title ?? "Practice test"}</Text>
        </View>
        <Pressable
          accessibilityLabel="Close test"
          onPress={close}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
        >
          <CloseIcon color={c.text} size={18} />
        </Pressable>
      </Animated.View>
      <View style={[styles.body, { paddingBottom: insets.bottom, paddingTop: insets.top + space(2) }]}>
        {artifact === undefined ? (
          <SkeletonDeckList testID="test-loading" />
        ) : artifact ? (
          <TestRunner
            artifact={artifact}
            onPullDown={() => setHeaderShown(true)}
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
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      zIndex: 10,
      minHeight: 62,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: space(4),
      paddingBottom: space(2),
      gap: space(3),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.line,
      backgroundColor: c.bg,
    },
    heading: { flex: 1 },
    title: { ...type.bodyStrong, color: c.text },
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
