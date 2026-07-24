import { useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { signOcclusionImage } from "@/api/cloudStudy";
import { occlusionMaskState, type OcclusionPayload } from "@/lib/study-occlusion";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles, useTheme } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Reviewing an image cloze card on the phone.
//
// This replaces a placeholder that said "Open on web for image cards" — the
// phone could grade these but never showed you the picture, which meant the
// only honest thing to do was recall from memory (owner 2026-07-24 asked for
// image cloze, and a card you cannot see is not the feature).
//
// The picture lives in a PRIVATE bucket, so its stored value is an object path
// and has to be signed before it can be displayed. Signing is per-card and
// short-lived on purpose: the review screen re-signs whenever a card comes up,
// so a link that leaks is useless within the hour.
//
// Which boxes are covered is not decided here — occlusionMaskState in
// lib/study-occlusion.ts owns that, shared verbatim with the web app, so
// hide-all and hide-one behave identically on both.

export function OcclusionCardView({ payload, revealed }: { payload: OcclusionPayload; revealed: boolean }) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const win = useWindowDimensions();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setUrl(null);
    setFailed(false);
    void signOcclusionImage(payload.image)
      .then((signed) => {
        if (!alive) return;
        if (signed) setUrl(signed);
        else setFailed(true);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [payload.image]);

  // Fit the picture to the card, then scale every box by the same factor —
  // the boxes are stored in the picture's own pixels so they land correctly on
  // any screen size.
  const maxW = win.width - space(10);
  const maxH = win.height * 0.46;
  const scale = Math.min(maxW / payload.width, maxH / payload.height);
  const width = payload.width * scale;
  const height = payload.height * scale;

  if (failed) {
    return (
      <View style={styles.wrap} testID="review-occlusion-failed">
        <Text style={styles.note}>Couldn't load that picture. Check your connection and try again.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap} testID="review-occlusion">
      <View style={[styles.canvas, { height, width }]}>
        {url ? (
          <Image source={{ uri: url }} style={{ height, width }} resizeMode="contain" />
        ) : (
          <View style={[styles.loading, { height, width }]}>
            <ActivityIndicator color={c.text2} />
          </View>
        )}
        {url
          ? payload.shapes.map((shape) => {
              const state = occlusionMaskState(shape.id, payload, revealed);
              if (state === "clear" || state === "target-revealed") return null;
              return (
                <View
                  key={shape.id}
                  style={[
                    styles.mask,
                    // The one being asked about reads as the question, so it is
                    // tinted rather than the same flat block as its neighbours.
                    state === "target-covered" && styles.maskTarget,
                    { height: shape.h * scale, left: shape.x * scale, top: shape.y * scale, width: shape.w * scale },
                  ]}
                  testID={state === "target-covered" ? "review-occlusion-target" : undefined}
                />
              );
            })
          : null}
        {/* The answer outline: once revealed, ring where the box WAS so the eye
            lands on the right part of the diagram instead of hunting for it. */}
        {url && revealed ? (
          <View
            pointerEvents="none"
            style={[
              styles.revealRing,
              {
                height: shapeOf(payload).h * scale,
                left: shapeOf(payload).x * scale,
                top: shapeOf(payload).y * scale,
                width: shapeOf(payload).w * scale,
              },
            ]}
            testID="review-occlusion-revealed"
          />
        ) : null}
      </View>
    </View>
  );
}

/** The box this card is actually about. parseOcclusionPayload guarantees it
 *  exists — a payload whose target is missing is rejected outright — so the
 *  fallback here is only to keep the type honest. */
function shapeOf(payload: OcclusionPayload) {
  return payload.shapes.find((shape) => shape.id === payload.targetId) ?? { h: 0, w: 0, x: 0, y: 0 };
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { alignItems: "center", gap: space(2) },
    canvas: { borderRadius: radius.md, overflow: "hidden", backgroundColor: c.surface2 },
    loading: { alignItems: "center", justifyContent: "center" },
    // Opaque: a see-through mask shows the answer through it, which defeats
    // the card.
    mask: { position: "absolute", backgroundColor: c.text, borderRadius: 2 },
    maskTarget: { backgroundColor: c.accent },
    revealRing: { position: "absolute", borderWidth: 2, borderColor: c.accent, borderRadius: 2 },
    note: { ...type.small, color: c.textHint, textAlign: "center" },
  });
