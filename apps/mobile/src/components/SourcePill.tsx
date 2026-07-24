import { Image, StyleSheet, Text } from "react-native";
import type { ChatSource } from "@/lib/chat-thread";
import { faviconUrl, hostnameOf, sourceLabel } from "@/lib/favicon";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";

// The ChatGPT-style INLINE source pill: a favicon + short source name sitting in
// the answer prose, tapped to open the tap-card sheet. The web twin is
// apps/web/components/workspace/sessions/source-pill.tsx (hover card there; touch
// has no hover, so the phone opens a sheet instead — chat.tsx owns that state).
//
// Why a <Text> and not a <View> chip: MessageBody paints this from a
// react-native-markdown-display `link` render rule, whose result is nested inside
// the paragraph's textgroup <Text>. React Native only lets a <Text> (or an
// <Image>) flow inline there — a <View> would break the line box. So the pill IS
// a <Text> with a background, exactly like the existing #tag / ==highlight== inline
// pills (theme/markdown.ts). iOS does not honor borderRadius or padding on inline
// text backgrounds, so this reads as a tinted text run rather than a hard capsule
// — the same compromise those neighbouring pills already live with.
//
// The favicon is an <Image> nested in that <Text>. React Native needs an explicit
// width/height on a remote image or it collapses to zero (the MarkdownImage
// landmine), so the size is fixed here. If the image renders blank or the host is
// unknown, the chip is still fully legible as "Wikipedia +1" — the label carries
// the meaning, the icon is decoration.

/** Fixed favicon box — a remote <Image> with no explicit size collapses to zero
 *  in RN, and inline text can't measure intrinsic image size the way the browser
 *  does. Small enough to sit on the answer's line without lifting it. */
const FAVICON_SIZE = 13;

export function SourcePill({ sources, onPress }: { sources: ChatSource[]; onPress: () => void }) {
  const styles = useThemedStyles(createStyles);
  const first = sources[0];
  if (!first) return null;

  const host = hostnameOf(first.url);
  const label = sourceLabel(first.url) ?? host ?? (first.title.trim() || "Source");
  const extra = sources.length - 1;
  const a11yLabel = extra > 0
    ? `${label} and ${extra} more source${extra > 1 ? "s" : ""}`
    : `Source: ${label}`;

  // No leading/trailing spaces: the prose already carries the space before the
  // marker, and punctuation follows right after ("won [pill]."). iOS ignores
  // padding on inline text, so we accept the tint hugging its content, exactly
  // like the neighbouring #tag / ==highlight== pills. The one internal space
  // separates the favicon from the label.
  return (
    <Text
      style={styles.pill}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      testID="chat-cite-pill"
    >
      {host ? (
        <Image source={{ uri: faviconUrl(host, 32) }} style={styles.favicon} accessibilityIgnoresInvertColors />
      ) : null}
      <Text style={styles.label}>{host ? " " : ""}{label}</Text>
      {extra > 0 ? <Text style={styles.extra}> +{extra}</Text> : null}
    </Text>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    // A soft neutral chip rather than the accent-tinted #tag — a citation is a
    // neutral reference, not an authored highlight. surface2 (not surface) is the
    // most lift the pure-black/white theme allows for a fill; on true black it's a
    // whisper, so the favicon is what actually marks the chip out. The theme's
    // usual card edge is a hairline border, which inline text can't draw — hence
    // leaning on the icon instead.
    pill: {
      backgroundColor: c.surface2,
      color: c.text2,
      borderRadius: 4,
      fontSize: 14,
      fontWeight: "500",
    },
    favicon: { width: FAVICON_SIZE, height: FAVICON_SIZE, borderRadius: FAVICON_SIZE / 2 },
    label: { color: c.text2, fontSize: 14, fontWeight: "500" },
    extra: { color: c.text3, fontSize: 14, fontWeight: "500" },
  });
