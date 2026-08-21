import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { fetchNote, loadCachedLibrary, findCachedNote } from "@/api/cloudLibrary";
import { CloseIcon } from "@/components/icons";
import { parseSlideDeck, type SlidePreview } from "@/lib/slide-deck";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { control, space, type } from "@/theme/tokens";

export default function SlidesScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [title, setTitle] = useState("Slides");
  const [content, setContent] = useState("");
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<SlidePreview>>(null);

  useEffect(() => {
    let alive = true;
    if (!uid || !id) return;
    void loadCachedLibrary(uid).then((cached) => {
      if (!alive) return;
      const note = findCachedNote(cached, { id });
      if (note) {
        setTitle(note.title);
        setContent(note.content);
      }
    });
    void fetchNote(uid, { id })
      .then((note) => {
        if (!alive || !note) return;
        setTitle(note.title);
        setContent(note.content);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [uid, id]);

  const slides = useMemo(() => parseSlideDeck(content), [content]);
  const close = () => (router.canGoBack() ? router.back() : router.replace("/library?classic=1"));

  return (
    <View style={styles.root} testID="slides-preview">
      <View style={[styles.header, { paddingTop: insets.top + space(1) }]}>
        <Text style={styles.deckTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.counter}>{slides.length ? `${index + 1} of ${slides.length}` : ""}</Text>
        <Pressable onPress={close} style={({ pressed }) => [styles.close, pressed && styles.pressed]} accessibilityLabel="Close slides">
          <CloseIcon size={17} color={c.text} />
        </Pressable>
      </View>
      {slides.length ? (
        <FlatList
          ref={listRef}
          data={slides}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(_, i) => String(i)}
          getItemLayout={(_, i) => ({ index: i, length: width, offset: width * i })}
          onMomentumScrollEnd={(event) => setIndex(Math.round(event.nativeEvent.contentOffset.x / width))}
          renderItem={({ item, index: slideIndex }) => (
            <View style={[styles.page, { width, paddingBottom: insets.bottom + space(6) }]}>
              <View style={styles.slide}>
                <Text style={styles.slideNumber}>{String(slideIndex + 1).padStart(2, "0")}</Text>
                <Text style={styles.slideTitle}>{item.title}</Text>
                <View style={styles.bullets}>
                  {item.bullets.map((bullet, bulletIndex) => (
                    <View key={`${bulletIndex}-${bullet}`} style={styles.bulletRow}>
                      <View style={styles.dot} />
                      <Text style={styles.bullet}>{bullet}</Text>
                    </View>
                  ))}
                </View>
                {item.speakerNotes ? <Text style={styles.notes}>{item.speakerNotes}</Text> : null}
              </View>
            </View>
          )}
        />
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No slide preview</Text>
          <Text style={styles.emptyBody}>This Library note does not contain a structured Nemesis slide deck.</Text>
        </View>
      )}
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
      gap: space(2),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.line,
    },
    deckTitle: { ...type.bodyStrong, color: c.text, flex: 1 },
    counter: { ...type.micro, color: c.text3, fontVariant: ["tabular-nums"] },
    close: {
      width: control.sm,
      height: control.sm,
      borderRadius: control.sm / 2,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.surface2,
    },
    pressed: { opacity: 0.65 },
    page: { flex: 1, paddingHorizontal: space(4), paddingTop: space(4) },
    slide: {
      flex: 1,
      backgroundColor: c.raised,
      borderRadius: 22,
      paddingHorizontal: space(6),
      paddingVertical: space(6),
    },
    slideNumber: { ...type.micro, color: c.text3, letterSpacing: 1.2, marginBottom: space(3) },
    slideTitle: { fontSize: 30, lineHeight: 36, fontWeight: "700", color: c.text, letterSpacing: -0.6 },
    bullets: { marginTop: space(6), gap: space(3) },
    bulletRow: { flexDirection: "row", gap: space(3), alignItems: "flex-start" },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.text2, marginTop: 8 },
    bullet: { flex: 1, fontSize: 18, lineHeight: 26, color: c.text },
    notes: {
      ...type.small,
      color: c.text2,
      lineHeight: 21,
      marginTop: "auto",
      paddingTop: space(4),
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.line,
    },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(8) },
    emptyTitle: { ...type.h2, color: c.text },
    emptyBody: { ...type.small, color: c.text2, textAlign: "center", marginTop: space(2), lineHeight: 20 },
  });
