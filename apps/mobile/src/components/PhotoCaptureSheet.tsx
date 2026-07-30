import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import { radius, space, type } from "@/theme/tokens";

// The camera, for "photograph this and read it" (owner 2026-07-24).
//
// A Modal rather than a route on purpose: a route would have to hand the
// captured file back to the chat screen through a module singleton or a
// navigation param, and a camera is a transient thing the student is either in
// or out of. As a modal it returns its result by simply calling onCaptured.
//
// expo-camera is declared in app.json and the native permission copy describes
// this study-material use case. The camera is opened only from the student's
// explicit attachment action.
//
// 🔴 REBUILT 2026-07-30 AGAINST ChatGPT, WHICH THE OWNER SENT AS THE TARGET:
// "this is how chatgpt camera works, i need it to work and look the same."
// Two things changed, and the second one is not cosmetic.
//
// 1. IT IS A PANEL, NOT A TAKEOVER. This used to be a full-screen black modal.
//    ChatGPT slides a rounded-corner panel up over the conversation and leaves
//    the chat visible above it, so the camera reads as something you are doing
//    INSIDE the chat rather than a different place you have travelled to. That
//    also gives the shot an obvious way out — tap the chat you can still see.
//
// 2. THE CONFIRM STEP IS GONE. There used to be a Retake / Use photo screen
//    here, defended on the grounds that a blurred slide is cheaper to catch
//    before a round trip than after. That reasoning was sound and still lost:
//    ChatGPT drops the shot straight into the composer, where it sits as a
//    thumbnail you can look at, remove, or ignore while you type your question.
//    The student can still see the picture and still back out — the check just
//    happens somewhere that does not block them. A retake is now "tap the ✕ and
//    shoot again", which costs the same two taps the confirm screen did.
export function PhotoCaptureSheet({
  visible,
  onClose,
  onCaptured,
}: {
  visible: boolean;
  onClose: () => void;
  /** Called with a local file URI the moment the shutter fires. There is no
   *  confirm step — see this file's header. */
  onCaptured: (uri: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [taking, setTaking] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [facing, setFacing] = useState<"back" | "front">("back");
  const cameraRef = useRef<CameraView | null>(null);
  // Before the first ask, `permission` is null — treat that as askable.
  const askable = permission?.canAskAgain ?? true;

  // The parent closes the sheet after a capture without calling close(), so
  // reset here or the next open inherits the last session's state.
  useEffect(() => {
    if (visible) return;
    setTaking(false);
    setCameraReady(false);
    setCaptureError(null);
    setFacing("back");
  }, [visible]);

  const close = () => {
    setTaking(false);
    setCameraReady(false);
    setCaptureError(null);
    onClose();
  };

  const take = async () => {
    if (taking) return;
    if (!cameraReady || !cameraRef.current) {
      setCaptureError("The camera is still starting. Try again in a moment.");
      return;
    }
    setTaking(true);
    setCaptureError(null);
    try {
      // quality 0.7 is the only size lever available: expo-image-manipulator is
      // not installed, and adding it is a native dependency that would orphan
      // the over-the-air update. A 12-megapixel shot at 0.7 lands around 2 MB,
      // comfortably inside the 14 MB ceiling the bucket and the reader share.
      const picture = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      if (picture?.uri) onCaptured(picture.uri);
      else setCaptureError("The camera didn't return a photo. Try again.");
    } catch (cause) {
      setCaptureError(cause instanceof Error ? cause.message : "Couldn't take that photo. Try again.");
    } finally {
      setTaking(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close} statusBarTranslucent>
      {/* The chat shows through here. Tapping it leaves, the way tapping outside
          any sheet does — with the panel covering most of the screen this strip
          is small, so the chevron below is still the main way out. */}
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close camera" />
      <View style={[styles.panel, { paddingBottom: insets.bottom }]}>
        {!permission?.granted ? (
          <View style={styles.permission}>
            <Text style={styles.permissionTitle}>Let Nemesis use the camera</Text>
            <Text style={styles.permissionBody}>
              {askable
                ? "Photograph a slide, a page, or a whiteboard and Nemesis will read it into your chat."
                : "Camera access is switched off for Nemesis. Turn it on in Settings and come back."}
            </Text>
            {/* iOS asks ONCE. After a refusal, requestPermission resolves
                immediately with the same answer, so a button that only calls it
                is a button that does nothing — the screen becomes a dead end
                with "Not now" as its only exit. Settings is the real way back. */}
            <Pressable
              style={styles.primaryButton}
              onPress={() => void (askable ? requestPermission() : Linking.openSettings())}
              accessibilityRole="button"
              testID="photo-permission-action"
            >
              <Text style={styles.primaryButtonText}>{askable ? "Allow camera" : "Open Settings"}</Text>
            </Pressable>
            <Pressable onPress={close} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.secondaryText}>Not now</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing={facing}
              mode="picture"
              onCameraReady={() => {
                setCameraReady(true);
                setCaptureError(null);
              }}
              onMountError={(event) => setCaptureError(event.message || "The camera could not start.")}
            />
            {captureError ? (
              <View style={styles.captureError} accessibilityLiveRegion="polite">
                <Text style={styles.captureErrorText}>{captureError}</Text>
              </View>
            ) : null}

            {/* All three controls float ON the picture rather than sitting in a
                bar below it, so the preview stays as tall as the panel. */}
            <View style={styles.controls}>
              <Pressable
                onPress={close}
                style={({ pressed }) => [styles.roundButton, pressed && styles.roundButtonPressed]}
                accessibilityLabel="Close camera"
                accessibilityRole="button"
                testID="photo-back"
                hitSlop={8}
              >
                <ChevronLeftGlyph />
              </Pressable>

              <Pressable
                onPress={() => void take()}
                accessibilityLabel="Take photo"
                accessibilityHint={cameraReady ? "Attaches the photo to your message" : "Wait for the camera to finish starting"}
                testID="photo-shutter"
                disabled={!cameraReady || taking}
                style={({ pressed }) => [
                  styles.shutter,
                  (!cameraReady || taking) && styles.shutterDisabled,
                  pressed && styles.shutterPressed,
                ]}
              >
                {taking ? <ActivityIndicator color="#fff" size="large" /> : <ShutterGlyph />}
              </Pressable>

              {/* ChatGPT puts a "…" here. A menu with one item in it is worse
                  than the item itself, so this is the flip directly — the one
                  thing a camera needs that the shutter cannot do. */}
              <Pressable
                onPress={() => setFacing((current) => (current === "back" ? "front" : "back"))}
                style={({ pressed }) => [styles.roundButton, pressed && styles.roundButtonPressed]}
                accessibilityLabel={facing === "back" ? "Switch to the front camera" : "Switch to the back camera"}
                accessibilityRole="button"
                testID="photo-flip"
                hitSlop={8}
              >
                <FlipGlyph />
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

/** The shutter ring. Local to this file — the shared icon set has no camera
 *  glyph, and new glyphs stay where they are used (same rule as
 *  ComposerPlusMenu's CheckIcon). */
function ShutterGlyph() {
  return (
    <Svg width={72} height={72} viewBox="0 0 72 72">
      <Circle cx={36} cy={36} r={34} fill="none" stroke="#fff" strokeWidth={3} />
      <Circle cx={36} cy={36} r={27} fill="#fff" />
    </Svg>
  );
}

function ChevronLeftGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path d="M15 5l-7 7 7 7" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function FlipGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        d="M4 9a8 8 0 0 1 13.5-3.5L20 8M20 15a8 8 0 0 1-13.5 3.5L4 16"
        fill="none"
        stroke="#fff"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M20 4v4h-4M4 20v-4h4" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Fixed black-and-white rather than themed: a camera panel IS the picture, and
// a tinted surface over a live preview reads as a colour cast on the shot.
const styles = StyleSheet.create({
  // Deliberately not a scrim. ChatGPT leaves the chat above the panel looking
  // normal, not dimmed, which is what makes the camera feel like part of the
  // conversation instead of a modal thrown over it.
  backdrop: { flex: 1 },
  panel: {
    backgroundColor: "#000",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderCurve: "continuous",
    // Roughly ChatGPT's proportion: enough chat left visible to read as "still
    // in this conversation", enough panel that the preview is the screen.
    height: "78%",
    overflow: "hidden",
  },
  controls: {
    alignItems: "center",
    bottom: space(5),
    flexDirection: "row",
    justifyContent: "space-between",
    left: 0,
    paddingHorizontal: space(6),
    position: "absolute",
    right: 0,
  },
  roundButton: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: radius.pill,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  roundButtonPressed: { opacity: 0.6 },
  shutter: { alignItems: "center", justifyContent: "center" },
  shutterDisabled: { opacity: 0.5 },
  shutterPressed: { opacity: 0.7 },
  captureError: {
    position: "absolute",
    left: space(5),
    right: space(5),
    top: space(6),
    backgroundColor: "rgba(0,0,0,0.72)",
    borderRadius: radius.md,
    padding: space(3),
  },
  captureErrorText: { ...type.small, color: "#fff", textAlign: "center" },
  permission: { alignItems: "center", flex: 1, gap: space(4), justifyContent: "center", padding: space(8) },
  permissionBody: { ...type.body, color: "rgba(255,255,255,0.7)", textAlign: "center" },
  permissionTitle: { ...type.h2, color: "#fff", textAlign: "center" },
  primaryButton: {
    backgroundColor: "#fff",
    borderRadius: radius.pill,
    paddingHorizontal: space(6),
    paddingVertical: space(3),
  },
  primaryButtonText: { ...type.body, color: "#000", fontWeight: "600" },
  secondaryText: { ...type.body, color: "rgba(255,255,255,0.6)" },
});
