import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
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
  occlusionShapeAt,
  type OcclusionMode,
  type OcclusionShape,
} from "@nemesis/shared";
import {
  pickedImageMime,
  STUDY_IMAGE_PICKER_TYPES,
  STUDY_IMAGE_REFUSAL,
} from "@/lib/study-image-pick";
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
// CAMERA OR FILES (owner 2026-07-31: "allow users to choose photos from photo
// gallery or files"). The PHOTO LIBRARY is the half that is not here, and the
// reason is fingerprints: reaching the gallery means expo-image-picker, a NATIVE
// module, and adding one changes the app's runtime fingerprint so build 26 stops
// receiving over-the-air updates altogether. expo-document-picker is already in
// the build, so Files ships today and the gallery is queued behind the next
// native build — the owner's call on the day. See lib/study-image-pick.ts.
//
// Coordinates: every shape is stored in the picture's OWN pixels, never screen
// points, so a card drawn on a phone lines up on a laptop. `scale` below is the
// one place the two spaces meet.
//
// A WHOLE PAGE, NOT A BOTTOM SHEET (owner 2026-07-31: "the image occlusion
// editor is bad UI/UX, it should be full screen too"). Two things were wrong and
// only fixing both helps:
//
//  - It asked for `fullScreen`, which is a CAP on the body's height, not a
//    height. The sheet still sized itself to its content, so it opened part-way
//    down the screen with the add-card page showing above it.
//  - It is declared INSIDE that add-card page, so even a true full-screen
//    surface would have been full-*page-body*: inset by its padding, starting
//    under its header. Hence `portal` — see SlideUpSheet.
//
// And because it now owns the screen, the picture is sized from the space
// actually left for it (measured, via `area`) rather than a fixed half of the
// window, and the buttons stack instead of running off the right edge.

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

  const [cameraOpen, setCameraOpen] = useState(false);
  const [uri, setUri] = useState<string | null>(null);
  /** The picture's real content type. The camera only makes JPEGs; a file chosen
   *  from Files can be a PNG, and it has to be stored and read as one. */
  const [mime, setMime] = useState("image/jpeg");
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [shapes, setShapes] = useState<OcclusionShape[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<OcclusionMode>("hide-all");
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  // 🔴 SEPARATE FROM `error` ON PURPOSE. "Found 8 boxes, skipped 3 overlapping"
  // is a report on work that SUCCEEDED; showing it in the red error slot reads
  // as a failure and teaches the student to distrust the button that just
  // worked. Failures still go to `error`.
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The box being dragged out right now, in picture pixels. State (not a shared
  // value) because it is one rectangle on an otherwise still screen — the graph's
  // 200-node problem does not apply here, and the simpler code is worth more.
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  /** The space left for the picture once the hint and the controls have taken
   *  theirs — MEASURED, not a fraction of the window. The old half-the-window
   *  guess was tuned for a part-screen sheet and wastes most of a page. */
  const [area, setArea] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (visible) return;
    // Wiped on close, not on open: holding the picture until the sheet is
    // actually dismissed means an accidental swipe-down doesn't lose the boxes
    // before the animation has even finished.
    setCameraOpen(false);
    setUri(null);
    setMime("image/jpeg");
    setNatural(null);
    setShapes([]);
    setSelectedId(null);
    setMode("hide-all");
    setSaving(false);
    setError(null);
    setNotice(null);
    setDraft(null);
  }, [visible]);

  /** Adopt a picture, however it arrived — shutter or file picker. */
  const adoptImage = useCallback((next: string, nextMime: string, retryHint: string) => {
    setCameraOpen(false);
    setUri(next);
    setMime(nextMime);
    setShapes([]);
    setSelectedId(null);
    setNatural(null);
    // The picture's real pixel size is the coordinate space every box is stored
    // in, so nothing can be drawn until it is known.
    Image.getSize(
      next,
      (width, height) => setNatural({ height, width }),
      () => setError(retryHint),
    );
  }, []);

  const onCaptured = useCallback(
    (next: string) => adoptImage(next, "image/jpeg", "Couldn't read that picture. Try taking it again."),
    [adoptImage],
  );

  /** Choose a picture already on the phone. Files, not the photo library — see
   *  the note at the top of this file for why that half is not here yet. */
  const pickFile = useCallback(async () => {
    setError(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        // Copied into the app's cache, same as the chat's file picker: a raw
        // provider URI from Files can be unreadable by the time it is uploaded.
        copyToCacheDirectory: true,
        multiple: false,
        type: [...STUDY_IMAGE_PICKER_TYPES],
      });
      if (picked.canceled) return;
      const asset = picked.assets?.[0];
      if (!asset) return;
      // The picker filters by type, but a provider can still hand over something
      // else — the refusal is what stops that becoming a broken card later.
      const nextMime = pickedImageMime(asset.name, asset.mimeType);
      if (!nextMime) {
        setError(STUDY_IMAGE_REFUSAL);
        return;
      }
      adoptImage(asset.uri, nextMime, "Couldn't read that image. Try a different one.");
    } catch {
      setError("Couldn't open your files. Try again.");
    }
  }, [adoptImage]);

  // How the picture is laid out on screen, and the factor between screen points
  // and picture pixels. Fitted inside the measured area, so the shot is as big
  // as the page can make it without ever pushing the controls off the bottom.
  const layout = useMemo(() => {
    if (!natural || !area || area.width <= 0 || area.height <= 0) return null;
    const scale = Math.min(area.width / natural.width, area.height / natural.height);
    return { height: natural.height * scale, scale, width: natural.width * scale };
  }, [natural, area]);

  // Kept in a ref as well so the gesture callbacks (which are memoised once)
  // never read a stale layout after a rotation.
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const startRef = useRef({ x: 0, y: 0 });
  // The gesture callbacks are memoised once, so anything they read has to be a
  // ref or it goes stale the first time a box is added.
  const shapesRef = useRef(shapes);
  shapesRef.current = shapes;
  /** Set on touch-down when the finger landed ON a box: which one, and where it
   *  started, so the drag moves it instead of drawing a new one over it. */
  const movingRef = useRef<{ id: string; originX: number; originY: number; startX: number; startY: number } | null>(null);

  const drawGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(4)
        .onStart((event) => {
          const box = layoutRef.current;
          if (!box) return;
          const x = event.x / box.scale;
          const y = event.y / box.scale;
          startRef.current = { x, y };
          // 🔴 A DRAG THAT STARTS ON A BOX MOVES IT (owner 2026-07-31: "allow
          // users to select boxes instead of only creating them"). Every drag
          // used to draw a NEW rectangle, so a box put down slightly wrong could
          // only be deleted and drawn again — and on a dense diagram the
          // replacement usually landed on top of the original.
          const hit = occlusionShapeAt(shapesRef.current, x, y);
          movingRef.current = hit
            ? { id: hit.id, originX: hit.x, originY: hit.y, startX: x, startY: y }
            : null;
          if (hit) setSelectedId(hit.id);
        })
        .onUpdate((event) => {
          const box = layoutRef.current;
          if (!box || !natural) return;
          const x = event.x / box.scale;
          const y = event.y / box.scale;
          const moving = movingRef.current;
          if (moving) {
            // clampOcclusionShape keeps the size and pushes the position back
            // inside the picture, so dragging off the edge parks the box at the
            // edge rather than shrinking or losing it.
            setShapes((prev) =>
              prev.map((shape) =>
                shape.id === moving.id
                  ? clampOcclusionShape(
                      { ...shape, x: moving.originX + (x - moving.startX), y: moving.originY + (y - moving.startY) },
                      natural.width,
                      natural.height,
                    )
                  : shape,
              ),
            );
            return;
          }
          setDraft(normalizeOcclusionRect(startRef.current, { x, y }, natural.width, natural.height));
        })
        .onEnd(() => {
          const box = layoutRef.current;
          if (!box || !natural) return;
          if (movingRef.current) {
            movingRef.current = null;
            return;
          }
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
        mime,
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
    setNotice(null);
    try {
      const found = await suggestOcclusionMasks(
        userId,
        uri,
        natural.width,
        natural.height,
        () => generateUuidV4(),
        mime,
      );
      if (found.shapes.length === 0) {
        // Not a failure: plenty of pictures have nothing worth hiding.
        setNotice(found.note || "Nothing to hide was found in that image.");
      } else {
        setShapes((current) => [...current, ...found.shapes]);
        const added = `Added ${found.shapes.length} box${found.shapes.length === 1 ? "" : "es"}. Adjust or delete any, then save.`;
        // Never silent about what was thrown away — "it covered everything" is
        // the impression a quiet truncation leaves.
        setNotice(found.note ? `${added} ${found.note}` : added);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't read that image.");
    } finally {
      setSuggesting(false);
    }
  }, [mime, natural, suggesting, uri, userId]);

  const canSave = !!uri && !!natural && !!deckId && shapes.length > 0 && !saving;

  return (
    <SlideUpSheet visible={visible} onClose={onClose} title="Image cloze" page portal testID="occlusion-editor-sheet">
      <View style={styles.stage}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.hint} testID="occlusion-notice">{notice}</Text> : null}

      {!uri ? (
        <View style={styles.empty} testID="occlusion-empty">
          <Text style={styles.emptyTitle}>Photograph what you want to learn</Text>
          <Text style={styles.emptyBody}>
            A diagram, a slide, a page of a textbook. Then drag a box over each part you want to be asked about — every box
            becomes its own card.
          </Text>
          <View style={styles.emptyActions}>
            <MissionButton label="Take a photo" variant="primary" onPress={() => setCameraOpen(true)} testID="occlusion-take-photo" />
            {/* Named for what it actually opens. It is the Files app, not the
                photo library — calling it "Choose a photo" would be promising a
                place this button cannot reach. */}
            <MissionButton label="Choose a file" onPress={() => void pickFile()} testID="occlusion-pick-file" />
          </View>
        </View>
      ) : (
        <>
          <Text style={styles.hint}>
            {shapes.length === 0
              ? "Drag across the picture to cover something."
              : `${shapes.length} box${shapes.length === 1 ? "" : "es"} — ${shapes.length} card${shapes.length === 1 ? "" : "s"}. Tap one to name or remove it, or drag it to move it.`}
          </Text>

          {/* The picture takes whatever room is left. Deliberately NOT inside a
              scroll view: a Pan that draws boxes and a ScrollView that pans the
              page are the same downward finger, and the scroll would win. On a
              full page there is enough room for both without scrolling. */}
          <View
            style={styles.canvasArea}
            onLayout={(event) => {
              const { height, width } = event.nativeEvent.layout;
              setArea((current) =>
                current && current.height === height && current.width === width ? current : { height, width },
              );
            }}
            testID="occlusion-canvas-area"
          >
          {!layout ? (
            <ActivityIndicator color={c.text2} />
          ) : (
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
          )}
          </View>

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

          {/* 🔴 STACKED, NOT ONE ROW. Four controls side by side ran off the
              right edge, and the one that fell off was Add cards — the button
              the whole page exists to reach. */}
          <View style={styles.retakeRow}>
            <Pressable onPress={() => setCameraOpen(true)} hitSlop={6} style={styles.retake} testID="occlusion-retake">
              <Text style={styles.retakeLabel}>Retake</Text>
            </Pressable>
            <Pressable onPress={() => void pickFile()} hitSlop={6} style={styles.retake} testID="occlusion-replace-file">
              <Text style={styles.retakeLabel}>Choose a file</Text>
            </Pressable>
          </View>
          <View style={styles.actions}>
            <View style={styles.actionSlot}>
              <MissionButton
                label={suggesting ? "Reading…" : "Suggest boxes"}
                variant="secondary"
                busy={suggesting}
                disabled={!uri || !natural || suggesting}
                onPress={() => void suggest()}
                testID="occlusion-suggest"
              />
            </View>
            <View style={styles.actionSlot}>
              <MissionButton
                label={saving ? "Adding…" : shapes.length > 0 ? `Add ${shapes.length} card${shapes.length === 1 ? "" : "s"}` : "Add cards"}
                variant="primary"
                busy={saving}
                disabled={!canSave}
                onPress={() => void save()}
                testID="occlusion-save"
              />
            </View>
          </View>
          {!deckId ? <Text style={styles.footHint}>Choose a deck on the New cards page first.</Text> : null}
          {deckId && deckLabel ? <Text style={styles.footHint}>Cards go into {deckLabel}.</Text> : null}
        </>
      )}
      </View>

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

    // The page's own column: hint at the top, picture taking the slack, controls
    // pinned under it.
    stage: { flex: 1 },
    // A FLOOR, because there is no scroll view to fall back on. With the
    // keyboard up (naming a box) the page shrinks, and a pure flex:1 area can
    // squeeze toward zero — which shows a spinner where the diagram should be,
    // since `layout` refuses to compute against no space. Better to let the
    // last hint line clip than to lose the picture you are drawing on.
    canvasArea: {
      flex: 1,
      minHeight: 160,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      marginBottom: space(2),
    },

    empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: space(3), paddingHorizontal: space(2) },
    emptyActions: { flexDirection: "row", alignItems: "center", gap: space(2) },
    emptyTitle: { ...type.h2, color: c.text, textAlign: "center" },
    emptyBody: { ...type.small, color: c.textHint, textAlign: "center", marginBottom: space(2) },

    hint: { ...type.small, color: c.textHint, marginBottom: space(2) },
    fieldLabel: { ...type.micro, color: c.text3, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: space(1.5), marginTop: space(2) },

    canvas: { alignSelf: "center", borderRadius: radius.md, overflow: "hidden", backgroundColor: c.surface2 },
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

    actions: { flexDirection: "row", alignItems: "stretch", gap: space(2) },
    // MissionButton takes no style prop, so each one rides an equal-width slot.
    actionSlot: { flex: 1 },
    retakeRow: { flexDirection: "row", alignItems: "center", gap: space(4), marginBottom: space(2) },
    retake: { paddingVertical: space(2), paddingHorizontal: space(1) },
    retakeLabel: { ...type.small, color: c.text2, fontWeight: "600" },
    footHint: { ...type.small, color: c.textHint, marginTop: space(2) },
  });
