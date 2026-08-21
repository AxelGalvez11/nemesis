// The one way the phone says "here is where this answer came from": a SINGLE pill, and the popup
// it opens.
//
// 🔴 ONE PILL, NOT A ROW OF THEM (owner 2026-08-20). Every surface that has sources now ends with
// one control — three overlapping site icons, the word "Sources", and the count — and the list
// itself lives in the popup behind it. What it replaced on the Learn canvas was a wrapping grid of
// one pill per source, and on a broad question that was eleven of them filling half a phone
// screen with the words "Japantimes", "Memeburn", "Axios", "Gurufocus", "Thenewstack"… The web
// made the same move first and for the same reason: its chat surface collapsed to a single
// "Sources" button (`assistant-message.tsx`'s `AssistantFooter`) with the list in a side rail, and
// its canvas comment records that a wrapping row of domain names is not readable — several of the
// pills read the same and none of them says what the source actually is. The phone has no side
// rail, so the list goes in a bottom sheet, which is the phone's version of the same idea.
//
// 🔴 THE ROW IS THE PAYLOAD, THE PILL IS ONLY THE DOOR. A row carries the site's own icon, the
// page's title and its host — the three things a reader needs to judge a source before spending a
// tap on it — and the whole row opens the page. The pill deliberately carries none of that beyond
// "there are twelve of these": a control that tries to summarise eleven publications in one line
// is the wrapping grid again, in less space.
//
// 🔴 THE SHEET IS `SlideUpSheet`, NOT A NEW COMPONENT. It is the house sheet — grabber, drag to
// expand, tap-outside to close, glass — and every other popup on the phone is one. See
// `StudySheet.tsx`.
//
// 🔴 FAVICONS COME FROM `canvas-sources.ts` AND NOWHERE ELSE (owner 2026-08-20). This file used to
// build `https://<host>/favicon.ico` itself and remember the failure in a `useState` per row,
// which is a second, weaker answer to a question the app had already answered once: most sites
// declare their icon in markup rather than serving that path, so the popup drew letters for sites
// whose real icon was visible in the prose above it. That resolver is gone. `sourcePills` is also
// what drops anything that is not an openable http(s) address, so no row here can be a dead end.

import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { SlideUpSheet } from "./StudySheet";
import {
  faviconSource,
  noteFaviconFailed,
  siteInitial,
  sourcePills,
  useFaviconFailed,
  type SourcePill,
} from "@/components/canvas/canvas-sources";
import type { ChatSource } from "@/lib/chat-thread";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

/**
 * The Chat tab's pill. Takes the raw sources off a message and resolves them here, so a caller
 * never has to know about `SourcePill`.
 */
export function SourcesPill({ sources, onPress }: { sources: ChatSource[]; onPress: () => void }) {
  return <SourcesPillButton pills={sourcePills(sources)} onPress={onPress} testID="chat-sources-pill" />;
}

/** The Chat tab's popup. Same conversion, same reason. */
export function SourcesSheet({
  visible,
  onClose,
  sources,
}: {
  visible: boolean;
  onClose: () => void;
  sources: ChatSource[];
}) {
  return (
    <SourcesPillSheet
      visible={visible}
      onClose={onClose}
      pills={sourcePills(sources)}
      descriptions={descriptionsByUrl(sources)}
      testID="chat-sources-sheet"
    />
  );
}

/**
 * 🔴 THE DENSE PILL IS DRAWN SMALL AND TAPPED BIG (owner 2026-08-21).
 *
 * `pillDense` measures about 27pt tall: 4.5pt of padding top and bottom, a hairline border on each
 * edge, around a 14pt favicon that its 1.5pt ring grows to 17. Apple's minimum tappable target is
 * 44x44, so the old `hitSlop={4}` reached 35 and the pill was a genuinely hard tap — under a
 * paragraph of prose, with a ScrollView underneath ready to read a near-miss as a drag.
 *
 * TRIED AND REJECTED: growing the pill to 44, and bumping the icon or the padding to meet it
 * halfway. Its numbers are not arbitrary — 6.75/11.25/12pt are the canvas type scale, recorded in
 * `canvas-metrics.ts`, and the whole point of this variant is that it sits in that scale beside the
 * answer's own text. A 44pt control there would be the tallest thing on the canvas. hitSlop is the
 * exact tool for this: the touch target grows, nothing moves.
 *
 * 9pt each way takes 27 to 45. Vertical only — the pill is already several times 44 wide, and slop
 * that reached sideways would just overlap whatever sits beside it.
 *
 * The roomy variant keeps `hitSlop={4}` over its 34pt minHeight (42 total). It is deliberately left
 * alone here: it belongs to the Chat tab, a RETIRED surface (`lib/retired-surfaces.ts`), and this
 * pass was scoped to the pill a student can actually still reach.
 */
const DENSE_HIT_SLOP = { top: 9, bottom: 9, left: 4, right: 4 } as const;

/**
 * The pill itself, over already-resolved sources.
 *
 * `dense` is the Canvas's size — the same 14pt icon and 12pt label as everything else under an
 * answer there, so the pill sits in that surface's type scale rather than the Chat bubble's. It is
 * the same control either way; only the numbers differ — and, per `DENSE_HIT_SLOP` above, the
 * touch target the smaller of them needs to stay reachable.
 */
export function SourcesPillButton({
  pills,
  onPress,
  dense = false,
  testID,
}: {
  pills: readonly SourcePill[];
  onPress: () => void;
  dense?: boolean;
  testID?: string;
}) {
  const styles = useThemedStyles(createStyles);
  // 🔴 SILENCE, NOT AN EMPTY CONTROL. A "Sources" pill with nothing behind it is worse than no
  // pill: it invites a tap that opens an empty sheet.
  if (pills.length === 0) return null;
  const size = dense ? 14 : 22;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Sources, ${pills.length}`}
      accessibilityHint="Opens the list of sources for this answer"
      onPress={onPress}
      hitSlop={dense ? DENSE_HIT_SLOP : 4}
      style={({ pressed }) => [
        styles.pill,
        dense ? styles.pillDense : styles.pillRoomy,
        pressed && styles.pillPressed,
      ]}
      testID={testID}
    >
      <View style={styles.faviconStack}>
        {pills.slice(0, 3).map((pill, index) => (
          <View
            key={pill.key}
            style={[styles.stackIcon, { borderRadius: size }, index > 0 && (dense ? styles.stackOverlapDense : styles.stackOverlap)]}
          >
            <SourceMark host={pill.host} size={size} />
          </View>
        ))}
      </View>
      <Text style={dense ? styles.pillTextDense : styles.pillText}>Sources</Text>
      <Text style={dense ? styles.pillCountDense : styles.pillCount}>{pills.length}</Text>
    </Pressable>
  );
}

/**
 * The popup, over already-resolved sources.
 *
 * 🔴 `portal` IS NOT OPTIONAL FOR A SHEET DECLARED INSIDE THE ANSWER. `SlideUpSheet` is an inline
 * absolutely-positioned layer by default, and "absolute" resolves against the nearest positioned
 * ancestor — so a sheet declared inside the canvas's ScrollView would be measured against the
 * scrolled content and would slide up somewhere in the middle of the answer, then scroll away with
 * it. `portal` puts it in a native Modal measured against the window. The Chat tab mounts its
 * sheet at screen level and needs none of that, which is why this is a prop and not a constant.
 */
export function SourcesPillSheet({
  visible,
  onClose,
  pills,
  descriptions,
  portal = false,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  pills: readonly SourcePill[];
  /** Optional one-line summary per URL, when the surface has one. */
  descriptions?: Map<string, string>;
  portal?: boolean;
  testID?: string;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <SlideUpSheet
      compactTitle
      headerDivider
      hideClose
      onClose={onClose}
      portal={portal}
      title="Sources"
      visible={visible}
      testID={testID}
    >
      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {pills.map((pill, index) => {
          const description = descriptions?.get(pill.url)?.trim();
          return (
            <Pressable
              key={pill.key}
              accessibilityRole="link"
              accessibilityLabel={`${pill.label}. ${pill.title}`}
              onPress={() => void Linking.openURL(pill.url).catch(() => {})}
              style={({ pressed }) => [
                styles.row,
                index > 0 && styles.rowDivider,
                pressed && styles.rowPressed,
              ]}
              testID={testID ? `${testID}-row-${index}` : undefined}
            >
              <SourceMark host={pill.host} size={24} />
              <View style={styles.rowCopy}>
                <Text style={styles.rowSite} numberOfLines={1}>{displayHost(pill.host)}</Text>
                <Text style={styles.rowTitle} numberOfLines={2}>{pill.title}</Text>
                {description ? (
                  <Text style={styles.rowDescription} numberOfLines={2}>{description}</Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
        <View style={{ height: space(4) }} />
      </ScrollView>
    </SlideUpSheet>
  );
}

/**
 * One site's mark: its own icon, or its initial when the icon is known not to exist.
 *
 * Both the verdict and the `<Image source>` come from `canvas-sources.ts`, which probes each host
 * once per session and remembers the answer for every other mark on screen. `onError` stays wired
 * as the second net — see that file's header for why there are two.
 */
function SourceMark({ host, size }: { host: string; size: number }) {
  const styles = useThemedStyles(createStyles);
  const iconMissing = useFaviconFailed(host);
  if (iconMissing) {
    return (
      <View style={[styles.markFallback, { borderRadius: size / 2, height: size, width: size }]}>
        <Text style={[styles.markLetter, { fontSize: Math.round(size * 0.5) }]}>{siteInitial(host)}</Text>
      </View>
    );
  }
  return (
    <Image
      accessibilityIgnoresInvertColors
      onError={() => noteFaviconFailed(host)}
      source={faviconSource(host)}
      style={[styles.mark, { borderRadius: size / 2, height: size, width: size }]}
    />
  );
}

/** `www.` is delivery, not identity — the row names the publication's address, not its CDN. */
function displayHost(host: string): string {
  return host.replace(/^www\./i, "");
}

/**
 * The per-URL blurb, when the surface carried one. Kept out of `SourcePill` on purpose: a pill is
 * a thing you press, and the blurb is only ever read inside the popup.
 */
function descriptionsByUrl(sources: readonly ChatSource[] | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const source of sources ?? []) {
    if (source.url && source.description) map.set(source.url.trim(), source.description);
  }
  return map;
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    pill: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      borderRadius: radius.pill,
      backgroundColor: c.surface,
    },
    pillRoomy: {
      marginTop: space(1.5),
      marginHorizontal: space(0.5),
      minHeight: 34,
      gap: space(2),
      paddingVertical: space(0.75),
      paddingHorizontal: space(2),
    },
    // The canvas's own numbers — see `canvas/canvas-metrics.ts` for why they are 6.75/11.25.
    pillDense: {
      gap: 6.75,
      paddingVertical: 4.5,
      paddingLeft: 6.75,
      paddingRight: 11.25,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.line,
      backgroundColor: c.raised,
    },
    pillPressed: { opacity: 0.65 },
    pillText: { ...type.small, color: c.textHint, fontWeight: "600" },
    pillCount: { ...type.small, color: c.textHint },
    // 12pt/14 — an exemption from the text scale for the reason `canvas-metrics.ts` gives: at
    // `type.micro` the pill stops being 23pt tall and the icons no longer centre against the text.
    pillTextDense: { fontSize: 12, lineHeight: 14, fontWeight: "500", color: c.text2 },
    pillCountDense: { fontSize: 12, lineHeight: 14, color: c.text2, opacity: 0.7 },
    faviconStack: { flexDirection: "row", alignItems: "center" },
    stackIcon: { borderWidth: 1.5, borderColor: c.bg, overflow: "hidden" },
    stackOverlap: { marginLeft: -7 },
    stackOverlapDense: { marginLeft: -5 },
    mark: { backgroundColor: c.surface2 },
    markFallback: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.text,
    },
    // A glyph sized to fit its disc, not prose — one of `theme/tokens.ts`'s stated exemptions.
    markLetter: { color: c.bg, fontWeight: "700" },
    list: { flexShrink: 1 },
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: space(3),
      paddingVertical: space(3),
    },
    rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
    rowPressed: { backgroundColor: c.surface },
    rowCopy: { flex: 1, gap: 2 },
    rowSite: { ...type.small, color: c.text },
    rowTitle: { ...type.body, color: c.text, fontWeight: "600" },
    rowDescription: { ...type.small, color: c.text2 },
  });
