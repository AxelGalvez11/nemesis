import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// A markdown `![](url)` image that actually appears on screen.
//
// react-native-markdown-display's built-in image rule hands the URL to <Image>
// with no dimensions. That's fine on the web, where the browser resolves a
// remote image's intrinsic size and lays out around it — but React Native
// cannot: a remote <Image> with no width/height collapses to zero and the
// picture is simply invisible. There is also no `image` entry in
// theme/markdown.ts, so nothing was supplying one.
//
// So this measures first (Image.getSize) and only then draws, at the real
// aspect ratio, fitted to whatever width the container actually has and capped
// so one tall diagram can't take three screens. Flashcards are what forced the
// issue — a Captain Hook cloze answer IS an image (`{{c1:: ![](url) }}`), so a
// zero-height image would read as a card with a missing answer.

/** Ceiling on a single image's height, as a fraction of the window — a tall
 *  portrait diagram scales down to fit rather than pushing the prompt off. */
const MAX_HEIGHT_FRACTION = 0.42;
/** Reserved height while the size request is in flight, so the card doesn't
 *  jump from nothing to full size. */
const PLACEHOLDER_HEIGHT = 96;

export function MarkdownImage({ src, alt }: { src: string; alt?: string }) {
  const styles = useThemedStyles(createStyles);
  const { height: windowHeight } = useWindowDimensions();
  const [ratio, setRatio] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [boxWidth, setBoxWidth] = useState(0);

  useEffect(() => {
    let alive = true;
    setRatio(null);
    setFailed(false);
    if (!src) {
      setFailed(true);
      return;
    }
    Image.getSize(
      src,
      (w, h) => {
        if (alive && w > 0 && h > 0) setRatio(w / h);
        else if (alive) setFailed(true);
      },
      () => {
        // Offline, a dead URL, or a format the decoder rejects — say so
        // quietly rather than leaving an unexplained gap.
        if (alive) setFailed(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [src]);

  if (failed) {
    return (
      <View style={styles.failed} testID="markdown-image-failed">
        <Text style={styles.failedText}>{alt?.trim() || "Image unavailable"}</Text>
      </View>
    );
  }

  // Fit to the container, then clamp by height — a portrait image hits the
  // height ceiling first, so its width comes back down from the ratio.
  const maxHeight = Math.round(windowHeight * MAX_HEIGHT_FRACTION);
  let width = boxWidth;
  let height = ratio && boxWidth ? boxWidth / ratio : 0;
  if (height > maxHeight) {
    height = maxHeight;
    width = Math.round(maxHeight * (ratio ?? 1));
  }

  return (
    <View style={styles.wrap} onLayout={(e) => setBoxWidth(e.nativeEvent.layout.width)} testID="markdown-image">
      {ratio && boxWidth ? (
        <Image
          source={{ uri: src }}
          style={{ width, height, borderRadius: radius.sm }}
          resizeMode="contain"
          accessibilityLabel={alt?.trim() || undefined}
        />
      ) : (
        <View style={[styles.placeholder, { height: PLACEHOLDER_HEIGHT }]} />
      )}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    // Centered: diagrams and equation crops read better centered on a card than
    // ragged-left against prose.
    wrap: { width: "100%", alignItems: "center", marginVertical: space(2) },
    placeholder: { width: "100%", borderRadius: radius.sm, backgroundColor: c.surface2 },
    failed: { width: "100%", paddingVertical: space(2), alignItems: "center" },
    failedText: { ...type.small, color: c.text3, fontStyle: "italic" },
  });
