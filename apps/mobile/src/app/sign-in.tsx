import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/auth/AuthProvider";
import { AgeGate } from "@/components/AgeGate";
import { BrandMark } from "@/components/BrandMark";
import { Button, Input } from "@/components/ui";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { radius, space, type, useTheme } from "@/theme";

// Entry screen. Drives real email/password sign-IN; "Create account" routes to the
// sign-up screen; "Continue as guest" enters browse-only mode. The doc-18 age gate
// (18+ / Terms+Privacy) gates the two entry actions here; sign-up re-gates itself.
export default function SignIn() {
  const t = useTheme();
  const { signInEmail, continueAsGuest } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [acked, setAcked] = useState(false);

  async function onSignIn() {
    setBusy(true);
    setError(null);
    const result = await signInEmail(email.trim(), password);
    setBusy(false);
    if (result.error) setError(result.error);
    else router.replace("/");
  }

  return (
    <ScrollView
      testID="signin-screen"
      style={{ backgroundColor: t.color.background }}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.content}>
        <View style={styles.brand}>
          <BrandMark size={64} />
          <Text style={[type.display, { color: t.color.text }]}>{APP_NAME}</Text>
          <Text style={[type.body, styles.tagline, { color: t.color.textMuted }]}>{APP_TAGLINE}</Text>
        </View>

        <View style={styles.form}>
          <Input
            testID="email"
            label="Email"
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
          />
          <Input
            testID="password"
            label="Password"
            placeholder="••••••••"
            secureTextEntry
            autoComplete="password"
            value={password}
            onChangeText={setPassword}
            returnKeyType="go"
            onSubmitEditing={() => {
              if (acked && !busy) void onSignIn();
            }}
          />
          {error ? (
            <Text testID="signin-error" style={[type.bodySm, { color: t.color.danger }]}>
              {error}
            </Text>
          ) : null}

          <AgeGate checked={acked} onToggle={() => setAcked((a) => !a)} />

          <Button
            testID="signin-submit"
            title="Sign in"
            onPress={onSignIn}
            loading={busy}
            disabled={!acked}
            fullWidth
          />

          <View style={styles.divider}>
            <View style={[styles.rule, { backgroundColor: t.color.border }]} />
            <Text style={[type.caption, { color: t.color.textSubtle }]}>NEW HERE?</Text>
            <View style={[styles.rule, { backgroundColor: t.color.border }]} />
          </View>

          <Button
            testID="link-signup"
            title="Create account"
            variant="secondary"
            onPress={() => router.push("/sign-up")}
            fullWidth
          />

          <Pressable
            testID="continue-guest"
            disabled={!acked}
            style={[styles.guest, !acked && styles.guestDisabled]}
            onPress={() => {
              continueAsGuest();
              router.replace("/");
            }}
          >
            <Text style={[type.bodyStrong, { color: t.color.primary }]}>Continue as guest</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: "center", padding: space[6] },
  content: { width: "100%", maxWidth: 420, alignSelf: "center", gap: space[8] },
  brand: { alignItems: "center", gap: space[3] },
  tagline: { textAlign: "center", maxWidth: 320 },
  form: { gap: space[4] },
  divider: { flexDirection: "row", alignItems: "center", gap: space[3], marginVertical: space[1] },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, borderRadius: radius.pill },
  guest: { alignItems: "center", paddingVertical: space[3] },
  guestDisabled: { opacity: 0.45 },
});
