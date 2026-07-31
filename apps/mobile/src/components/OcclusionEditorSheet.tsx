import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { SlideUpSheet } from "./StudySheet";
import { MissionButton } from "./mission-ui";
import { suggestOcclusionMasks } from "@/api/occlusionSuggest";
import { PhotoCaptureSheet } from "./PhotoCaptureSheet";
import { CloseIcon } from "./icons";
import { createOcclusionCards } from "@/api/cloudStudy";
import { generateUuidV4 } from "@/lib/chat-threads";
import {
  clampOcclusionShape,
  normalizeOcclusionRect,
  occlusionCardFront,
  type OcclusionMode,
  type OcclusionShape,
} from "@nemesis/shared";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { control, radius, space, type } from "@/theme/tokens";

// Image cloze on the phone (owner 2026-07-24: "add image cloze option").
//
// You photograph a diagram, drag boxes over the parts you want to be asked
// about, and each box becomes its own card. Anki calls this image occlusion.
// The web app has had it since the study batch; this is the phone half, reading
// and writing the SAME study_cards.payload, so a set made here opens there and
// the other way round. All the geometry lives in lib/study-occlusion.ts, ported
// verbatim from web for exactly that reason.
//
// CAMERA ONLY, deliberately. Picking an existing picture would mean
// expo-image-picker, which is a NATIVE module: adding one changes the runtime
// fingerprint, which orphans the over-the-air update and strands this feature
// behind an App Store release. expo-camera is already in the build. Photographing
// the slide is also what a student in a lecture actually does.
//
// Coordinates: every shape is stored in the picture's OWN pixels, never screen
// points, so a card drawn on a phone lines up on a laptop. `scale` below is the
// one place the two spaces meet.

export function OcclusionEditorSheet({
  visible,
  onClose,
  userId,
  deckId,
  deckLabel,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  userId: string;
  /** Which deck the cards land in. Null disables Save with a clear reason. */
  deckId: string | null;
  deckLabel: string | null;
  /** Fired after a successful create so the caller can re-fetch. */
  onCreated: (count: number) => void;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const win = useWindowDimensions();

  const [cameraOpen, setCameraOpen] = useState(false);
  const [uri, setUri] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [shapes, setShapes] = useState<OcclusionShape[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<OcclusionMode>("hide-all");
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The box being dragged out right now, in picture pixels. State (not a shared
  // value) because it is one rectangle on an otherwise still screen — the graph's
  // 200-node problem does not apply here, and the simpler code is worth more.
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  useEffect(() => {
    if (visible) return;
    // Wiped on close, not on open: holding the picture until the sheet is
    // actually dismissed means an accidental swipe-down doesn't lose the boxes
    // before the animation has even finished.
    setCameraOpen(false);
    setUri(null);
    setNatural(null);
    setShapes([]);
    setSelectedId(null);
    setMode("hide-all");
    setSaving(false);
    setError(null);
    setDraft(null);
  }, [visible]);

  const onCaptured = useCallback((next: string) => {
    setCameraOpen(false);
    setUri(next);
    setShapes([]);
    setSelectedId(null);
    // The picture's real pixel size is the coordinate space every box is stored
    // in, so nothing can be drawn until it is known.
    Image.getSize(
      next,
      (width, height) => setNatural({ height, width }),
      () => setError("Couldn't read that picture. Try taking it again."),
    );
  }, []);

  // How the picture is laid out on screen, and the factor between screen points
  // and picture pixels. Capped in height so a portrait shot still leaves the
  // controls visible without scrolling.
  const layout = useMemo(() => {
    if (!natural) return null;
    const maxW = win.width - space(8);
    const maxH = win.height * 0.5;
    const scale = Math.min(maxW / natural.width, maxH / natural.height);
    return { height: natural.height * scale, scale, width: natural.width * scale };
  }, [natural, win.width, win.height]);

  // Kept in a ref as well so the gesture callbacks (which are memoised once)
  // never read a stale layout after a rotation.
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const startRef = useRef({ x: 0, y: 0 });

  const drawGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(4)
        .onStart((event) => {
          const box = layoutRef.current;
          if (!box) return;
          startRef.current = { x: event.x / box.scale, y: event.y / box.scale };
        })
        .onUpdate((event) => {
          const box = layoutRef.current;
          if (!box || !natural) return;
          const rect = normalizeOcclusionRect(
            startRef.current,
            { x: event.x / box.scale, y: event.y / box.scale },
            natural.width,
            natural.height,
          );
          setDraft(rect);
        })
        .onEnd(() => {
          const box = layoutRef.current;
          if (!box || !natural) return;
          setDraft((pending) => {
            if (pending) {
              const shape: OcclusionShape = { id: generateUuidV4(), label: "", ...pending };
              setShapes((prev) => [...prev, clampOcclusionShape(shape, natural.width, natural.height)]);
              setSelectedId(shape.id);
            }
            return null;
          });
        })
        // runOnJS because every handler above calls setState. The alternative
        // (shared values + a worklet) buys nothing here: one rectangle follows
        // one finger, and there is no per-frame list to keep off the JS thread.
        .runOnJS(true),
    [natural],
  );

  const selected = shapes.find((shape) => shape.id === selectedId) ?? null;

  function removeSelected() {
    if (!selectedId) return;
    setShapes((prev) => prev.filter((shape) => shape.id !== selectedId));
    setSelectedId(null);
  }

  function labelSelected(label: string) {
    if (!selectedId) return;
    setShapes((prev) => prev.map((shape) => (shape.id === selectedId ? { ...shape, label } : shape)));
  }

  async function save() {
    if (!uri || !natural || !deckId || shapes.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const made = await createOcclusionCards(userId, deckId, {
        height: natural.height,
        mode,
        shapes,
        uri,
        width: natural.width,
      });
      onCreated(made.length);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't make those cards.");
    } finally {
      setSaving(false);
    }
  }

  /** Let the reader find the labelled parts, then hand them over to be adjusted.
   *
   *  🔴 THIS PROPOSES, IT DOES NOT DECIDE. The boxes land in the same `shapes`
   *  state a finger would have drawn, so every one can be moved, relabelled or
   *  deleted before Save — and Save is still a separate, deliberate press. An
   *  automatic reading that saved itself would be a deck of cards the student
   *  never looked at, which is worse than no cards.
   *
   *  Existing boxes are kept and the suggestions are added to them, so a student
   *  who drew two by hand and then asked for help does not lose their work. */
  const suggest = useCallback(async () => {
    if (!uri || !natural || suggesting) return;
    setSuggesting(true);
    setError(null);
    try {
      const found = await suggestOcclusionMasks(
        userId,
        uri,
        natural.width,
        natural.height,
        () => generateUuidV4(),
      );
      if (found.shapes.length === 0) {
        setError(found.note || "Nothing to hide was found in that image.");
      } else {
        setShapes((current) => [...current, ...found.shapes]);
        // Never silent about what was thrown away — "it covered everything" is
        // the impression a quiet truncation leaves.
        if (found.note) setError(found.note);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't read that image.");
    } finally {
      setSuggesting(false);
    }
  }, [natural, suggesting, uri, userId]);

  const canSave = !!uri && !!natural && !!deckId && shapes.length > 0 && !saving;

  return (
    <SlideUpSheet visible={visible} onClose={onClose} title="Image cloze" fullScreen testID="occlusion-editor-sheet">
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!uri ? (
        <View style={styles.empty} testID="occlusion-empty">
          <Text style={styles.emptyTitle}>Photograph what you want to learn</Text>
          <Text style={styles.emptyBody}>
            A diagram, a slide, a page of a textbook. Then drag a box over each part you want to be asked about — every box
            becomes its own card.
          </Text>
          <MissionButton label="Take a photo" variant="primary" onPress={() => setCameraOpen(true)} testID="occlusion-take-photo" />
        </View>
      ) : !layout ? (
        <View style={styles.empty}>
          <ActivityIndicator color={c.text2} />
        </View>
      ) : (
        <>
          <Text style={styles.hint}>
            {shapes.length === 0
              ? "Drag across the picture to cover something."
              : `${shapes.length} box${shapes.length === 1 ? "" : "es"} — ${shapes.length} card${shapes.length === 1 ? "" : "s"}. Tap one to name or remove it.`}
          </Text>

          <GestureDetector gesture={drawGesture}>
            <View style={[styles.canvas, { height: layout.height, width: layout.width }]} testID="occlusion-canvas">
              <Image source={{ uri }} style={{ height: layout.height, width: layout.width }} resizeMode="contain" />
              {shapes.map((shape, index) => {
                const on = shape.id === selectedId;
                return (
                  <Pressable
                    key={shape.id}
                    onPress={() => setSelectedId(on ? null : shape.id)}
                    style={[
                      styles.mask,
                      on && styles.maskOn,
                      {
                        height: shape.h * layout.scale,
                        left: shape.x * layout.scale,
                        top: shape.y * layout.scale,
                        width: shape.w * layout.scale,
                      },
                    ]}
                    testID={`occlusion-mask-${index}`}
                  >
                    <Text style={styles.maskLabel} numberOfLines={1}>
                      {occlusionCardFront(shape.label, index)}
                    </Text>
                  </Pressable>
                );
              })}
              {/* The box currently under the finger. */}
              {draft ? (
                <View
                  pointerEvents="none"
                  style={[
                    styles.mask,
                    styles.maskDraft,
                    {
                      height: draft.h * layout.scale,
                      left: draft.x * layout.scale,
                      top: draft.y * layout.scale,
                      width: draft.w * layout.scale,
                    },
                  ]}
                />
              ) : null}
            </View>
          </GestureDetector>

          {selected ? (
            <View style={styles.selectedRow} testID="occlusion-selected">
              <TextInput
                style={styles.labelInput}
                value={selected.label}
                onChangeText={labelSelected}
                placeholder="Name this one (optional)"
                placeholderTextColor={c.textHint}
                testID="occlusion-label"
              />
              <Pressable onPress={removeSelected} hitSlop={8} style={styles.removeBtn} accessibilityLabel="Remove this box" testID="occlusion-remove">
                <CloseIcon size={14} color={c.danger} />
              </Pressable>
            </View>
          ) : null}

          {/* Anki's two behaviours, in the words they actually mean rather than
              "hide-all" / "hide-one". */}
          <Text style={styles.fieldLabel}>While you answer</Text>
          <View style={styles.modeRow}>
            <ModeBtn
              label="Cover everything"
              hint="The other boxes stay covered too"
              on={mode === "hide-all"}
              onPress={() => setMode("hide-all")}
              testID="occlusion-mode-hide-all"
            />
            <ModeBtn
              label="Cover just this one"
              hint="The rest of the picture stays readable"
              on={mode === "hide-one"}
              onPress={() => setMode("hide-one")}
              testID="occlusion-mode-hide-one"
            />
          </View>

          <View style={styles.actions}>
            <Pressable onPress={() => setCameraOpen(true)} hitSlop={6} style={styles.retake} testID="occlusion-retake">
              <Text style={styles.retakeLabel}>Retake</Text>
            </Pressable>
            <MissionButton
              label={suggesting ? "Reading…" : "Suggest boxes"}
              variant="secondary"
              busy={suggesting}
              disabled={!uri || !natural || suggesting}
              onPress={() => void suggest()}
              testID="occlusion-suggest"
            />
            <MissionButton
              label={saving ? "Adding…" : shapes.length > 0 ? `Add ${shapes.length} card${shapes.length === 1 ? "" : "s"}` : "Add cards"}
              variant="primary"
              busy={saving}
              disabled={!canSave}
              onPress={() => void save()}
              testID="occlusion-save"
            />
          </View>
          {!deckId ? <Text style={styles.hint}>Choose a deck on the New cards page first.</Text> : null}
          {deckId && deckLabel ? <Text style={styles.hint}>Cards go into {deckLabel}.</Text> : null}
        </>
      )}

      <PhotoCaptureSheet visible={cameraOpen} onClose={() => setCameraOpen(false)} onCaptured={onCaptured} />
    </SlideUpSheet>
  );
}

function ModeBtn({
  label,
  hint,
  on,
  onPress,
  testID,
}: {
  label: string;
  hint: string;
  on: boolean;
  onPress: () => void;
  testID: string;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.modeBtn, on && styles.modeBtnOn, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      testID={testID}
    >
      <Text style={[styles.modeLabel, on && styles.modeLabelOn]}>{label}</Text>
      <Text style={styles.modeHint}>{hint}</Text>
    </Pressable>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    rowPressed: { backgroundColor: c.surface },
    error: { ...type.small, color: c.danger, backgroundColor: c.surface2, borderRadius: radius.sm, padding: space(2.5), marginBottom: space(2) },

    empty: { alignItems: "center", gap: space(3), paddingVertical: space(8), paddingHorizontal: space(2) },
    emptyTitle: { ...type.h2, color: c.text, textAlign: "center" },
    emptyBody: { ...type.small, color: c.textHint, textAlign: "center", marginBottom: space(2) },

    hint: { ...type.small, color: c.textHint, marginBottom: space(2) },
    fieldLabel: { ...type.micro, color: c.text3, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: space(1.5), marginTop: space(2) },

    canvas: { alignSelf: "center", borderRadius: radius.md, overflow: "hidden", backgroundColor: c.surface2, marginBottom: space(3) },
    // A mask is opaque on purpose — a translucent one lets you read the answer
    // straight through it, which is the whole thing the card is testing.
    mask: { position: "absolute", backgroundColor: c.text, alignItems: "center", justifyContent: "center", borderRadius: 2 },
    maskOn: { borderWidth: 2, borderColor: c.accent },
    maskDraft: { opacity: 0.55 },
    maskLabel: { ...type.micro, color: c.bg, paddingHorizontal: 2 },

    selectedRow: { flexDirection: "row", alignItems: "center", gap: space(2), marginBottom: space(2) },
    labelInput: {
      ...type.body,
      flex: 1,
      color: c.text,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radius.md,
      paddingHorizontal: space(3),
      paddingVertical: space(2),
    },
    removeBtn: { width: control.lg, height: control.lg, borderRadius: control.lg / 2, alignItems: "center", justifyContent: "center", backgroundColor: c.surface },

    modeRow: { flexDirection: "row", gap: space(2), marginBottom: space(3) },
    modeBtn: { flex: 1, gap: 2, padding: space(2.5), borderRadius: radius.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
    modeBtnOn: { backgroundColor: c.accentFaint, borderColor: c.accent },
    modeLabel: { ...type.small, color: c.text2, fontWeight: "600" },
    modeLabelOn: { color: c.accent },
    modeHint: { ...type.micro, color: c.textHint },

    actions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space(1) },
    retake: { paddingVertical: space(2), paddingHorizontal: space(1) },
    retakeLabel: { ...type.small, color: c.text2, fontWeight: "600" },
  });
