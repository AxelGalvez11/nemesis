import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, router } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MissionButton } from "@/components/mission-ui";
import { storePairingCode } from "@/api/librarySync";
import { space, type } from "@/theme/tokens";
import tokens from "@/theme/tokens.json";

// Pairing: point the camera at the QR code the Mac shows (Settings → Phone sync),
// or paste the code by hand — the manual path also covers denied camera permission
// and the simulator. The code IS the vault key, so it goes straight into the iOS
// Keychain (SecureStore) and never to our servers.

const { colors, radius } = tokens;

export default function PairScreen() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // A QR in frame fires onBarcodeScanned many times a second — latch the first.
  const handled = useRef(false);

  const accept = async (code: string) => {
    if (handled.current) return;
    handled.current = true;
    const ok = await storePairingCode(code);
    if (ok) {
      setDone(true);
      setError(null);
      setTimeout(() => router.back(), 600);
    } else {
      handled.current = false;
      setError("That doesn't look like a Nemesis pairing code.");
    }
  };

  const cameraGranted = permission?.granted === true;

  return (
    <View style={[styles.flex, { paddingTop: insets.top + space(2) }]} testID="pair-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.topRow}>
        <Pressable onPress={() => router.back()} hitSlop={10} testID="pair-back" style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        <Text style={styles.h1}>Pair with your Mac</Text>
        <Text style={styles.sub}>On your Mac, open Settings → Phone sync → Pair phone, then scan the code it shows.</Text>

        {done ? (
          <View style={styles.scanBox} testID="pair-success">
            <Text style={styles.successText}>Paired. Your library is on its way.</Text>
          </View>
        ) : cameraGranted ? (
          <View style={styles.scanBox} testID="pair-camera">
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={({ data }) => void accept(data)}
            />
            <View style={styles.scanFrame} pointerEvents="none" />
          </View>
        ) : (
          <View style={[styles.scanBox, styles.scanBoxIdle]} testID="pair-no-camera">
            <Text style={styles.idleText}>
              {permission?.canAskAgain === false
                ? "Camera access is off for Nemesis (you can enable it in iOS Settings) — paste the code below instead."
                : "Allow camera access to scan, or paste the code below."}
            </Text>
            {permission?.canAskAgain !== false ? (
              <MissionButton label="Allow camera" variant="secondary" testID="pair-allow-camera" onPress={() => void requestPermission()} />
            ) : null}
          </View>
        )}

        <Text style={styles.orLine}>or paste the code</Text>
        <TextInput
          testID="pair-manual"
          style={styles.input}
          placeholder="nemsync1.…"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          value={manual}
          onChangeText={setManual}
        />
        {error ? (
          <Text style={styles.error} testID="pair-error">
            {error}
          </Text>
        ) : null}
        <MissionButton
          label="Pair"
          variant="primary"
          testID="pair-submit"
          disabled={manual.trim().length === 0 || done}
          onPress={() => void accept(manual)}
        />
        <Text style={styles.privacyNote}>
          The code is the key to your library. It's stored only on this phone — never on our servers — and anyone with
          it can read your notes, so share it with nobody.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  topRow: { paddingHorizontal: space(3), paddingBottom: space(2) },
  backBtn: { alignSelf: "flex-start", paddingVertical: space(1) },
  backText: { ...type.bodyStrong, color: colors.muted },
  body: { flex: 1, paddingHorizontal: space(5), gap: space(3) },
  h1: { ...type.h1, color: colors.foreground },
  sub: { ...type.small, color: colors.muted, lineHeight: 19 },
  scanBox: {
    height: 260,
    borderRadius: radius.card,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  scanBoxIdle: { padding: space(5), gap: space(4) },
  scanFrame: {
    width: 180,
    height: 180,
    borderWidth: 2,
    borderColor: colors.accentBorder,
    borderRadius: radius.input,
  },
  idleText: { ...type.small, color: colors.muted, textAlign: "center", lineHeight: 19 },
  successText: { ...type.title, color: colors.foreground },
  orLine: { ...type.micro, color: colors.muted, textAlign: "center", letterSpacing: 1, textTransform: "uppercase" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: space(3),
    paddingVertical: space(2.75),
    fontSize: 15,
    color: colors.foreground,
    backgroundColor: colors.surface,
    fontFamily: "Menlo",
  },
  error: { ...type.small, color: colors.accent },
  privacyNote: { ...type.micro, color: colors.muted, lineHeight: 16, marginTop: space(1) },
});
