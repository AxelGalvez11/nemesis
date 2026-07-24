import { useRef, useState } from "react";
import { ActivityIndicator, Image, Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import { CloseIcon } from "./icons";
import { radius, space, type } from "@/theme/tokens";

// The camera, for "photograph this and read it" (owner 2026-07-24).
//
// A full-screen Modal rather than a route on purpose: a route would have to
// hand the captured file back to the chat screen through a module singleton or
// a navigation param, and a camera is a transient thing the student is either
// in or out of. As a modal it returns its result by simply calling onCaptured.
//
// expo-camera is ALREADY in the installed native build (and declared in
// app.json), so this ships over the air. Nothing here touches app.json — an
// edit there changes the fingerprint runtime version and would orphan the
// update from the build the phone is actually running.
//
// KNOWN, DELIBERATE: the iOS permission prompt still reads "Nemesis uses the
// camera only to scan the pairing code shown on your Mac", because that string
// lives in app.json. It is wrong now and can only be corrected in a new native
// build; correcting it here would cost the over-the-air path this feature rides.
//
// Two states, no more: live preview with a shutter, then the shot with Retake /
// Use photo. The confirmation step is not decoration — a blurred or half-framed
// photo of a lecture slide reads back as nonsense, and it is much cheaper to
// notice that here than after a round trip to the server.
export function PhotoCaptureSheet({
  visible,
  onClose,
  onCaptured,
  busy = false,
}: {
  visible: boolean;
  onClose: () => void;
  /** Called with a local file URI once the student accepts the shot. */
  onCaptured: (uri: string) => void;
  /** The caller is uploading/reading the accepted shot — keeps the sheet up
   *  with a spinner so the student isn't dropped back into chat wondering
   *  whether anything happened. */
  busy?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [shot, setShot] = useState<string | null>(null);
  const [taking, setTaking] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);
  // Before the first ask, `permission` is null — treat that as askable.
  const askable = permission?.canAskAgain ?? true;

  const close = () => {
    setShot(null);
    setTaking(false);
    onClose();
  };

  const take = async () => {
    if (taking || !cameraRef.current) return;
    setTaking(true);
    try {
      // quality 0.7 is the only size lever available: expo-image-manipulator is
      // not installed, and adding it is a native dependency that would orphan
      // the over-the-air update. A 12-megapixel shot at 0.7 lands around 2 MB,
      // comfortably inside the 14 MB ceiling the bucket and the reader share.
      const picture = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      if (picture?.uri) setShot(picture.uri);
    } catch {
      // Nothing to say that the student could act on — the shutter simply
      // didn't fire. Leaving the live preview up IS the retry.
    } finally {
      setTaking(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View style={styles.host}>
        {!permission?.granted ? (
          <View style={[styles.permission, { paddingTop: insets.top + space(6) }]}>
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
        ) : shot ? (
          <>
            <Image source={{ uri: shot }} style={StyleSheet.absoluteFill} resizeMode="contain" />
            <View style={[styles.bar, { paddingBottom: insets.bottom + space(5) }]}>
              <Pressable onPress={() => setShot(null)} disabled={busy} accessibilityRole="button" hitSlop={10}>
                <Text style={[styles.barAction, busy && styles.barActionDim]}>Retake</Text>
              </Pressable>
              <Pressable
                onPress={() => onCaptured(shot)}
                disabled={busy}
                accessibilityRole="button"
                testID="photo-use"
                hitSlop={10}
              >
                {busy ? (
                  <View style={styles.busyRow}>
                    <ActivityIndicator color="#fff" />
                    <Text style={styles.barAction}>Reading…</Text>
                  </View>
                ) : (
                  <Text style={[styles.barAction, styles.barActionStrong]}>Use photo</Text>
                )}
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
            <View style={[styles.shutterBar, { paddingBottom: insets.bottom + space(6) }]}>
              <Pressable
                onPress={() => void take()}
                accessibilityLabel="Take photo"
                testID="photo-shutter"
                style={({ pressed }) => [styles.shutter, pressed && styles.shutterPressed]}
              >
                <ShutterGlyph />
              </Pressable>
            </View>
          </>
        )}

        {permission?.granted ? (
          <Pressable
            onPress={close}
            style={[styles.close, { top: insets.top + space(2) }]}
            accessibilityLabel="Close camera"
            hitSlop={10}
          >
            <CloseIcon size={20} color="#fff" />
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}

/** The shutter ring. Local to this file — the shared icon set has no camera
 *  glyph, and new glyphs stay where they are used (same rule as
 *  ComposerPlusMenu's CheckIcon). */
function ShutterGlyph() {
  return (
    <Svg width={64} height={64} viewBox="0 0 64 64">
      <Circle cx={32} cy={32} r={30} fill="none" stroke="#fff" strokeWidth={2.5} />
      <Circle cx={32} cy={32} r={24} fill="#fff" />
    </Svg>
  );
}

// Fixed black-and-white rather than themed: a camera screen IS the picture, and
// a tinted panel over a live preview reads as a colour cast on the shot.
const styles = StyleSheet.create({
  bar: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.65)",
    bottom: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    left: 0,
    paddingHorizontal: space(8),
    paddingTop: space(5),
    position: "absolute",
    right: 0,
  },
  barAction: { ...type.body, color: "#fff" },
  barActionDim: { opacity: 0.4 },
  barActionStrong: { fontWeight: "600" },
  busyRow: { alignItems: "center", flexDirection: "row", gap: space(2) },
  close: { left: space(4), padding: space(2), position: "absolute", zIndex: 2 },
  host: { backgroundColor: "#000", flex: 1 },
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
  shutter: { alignItems: "center", justifyContent: "center" },
  shutterBar: { alignItems: "center", bottom: 0, left: 0, paddingTop: space(6), position: "absolute", right: 0 },
  shutterPressed: { opacity: 0.7 },
});
