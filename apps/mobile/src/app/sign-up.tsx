import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/auth/AuthProvider";
import { AgeGate } from "@/components/AgeGate";
import { BrandMark } from "@/components/BrandMark";
import { Button, Input } from "@/components/ui";
import { space, type, useTheme } from "@/theme";

// Sign-up screen. Email/password → Supabase signUp. When confirmation is required
// (no session minted) we show a "check your email" state; when it's not (instant),
// we drop straight into the app. doc-18 age gate re-asserted here.
export default function SignUp() {
  const t = useTheme();
  const { signUpEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [acked, setAcked] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit() {
    const clean = email.trim();
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await signUpEmail(clean, password);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.needsConfirmation) setSentTo(clean);
    else router.replace("/");
  }

  if (sentTo) {
    return (
      <ScrollView
        testID="signup-confirm"
        style={{ backgroundColor: t.color.background }}
        contentContainerStyle={styles.scroll}
      >
        <View style={[styles.content, styles.confirm]}>
          <BrandMark size={56} />
          <Text style={[type.h1, styles.center, { color: t.color.text }]}>Check your email</Text>
          <Text style={[type.body, styles.center, { color: t.color.textMuted }]}>
            We sent a confirmation link to{"\n"}
            <Text style={{ color: t.color.text, fontWeight: "600" }}>{sentTo}</Text>.{"\n"}
            Tap it to finish setting up your account, then sign in.
          </Text>
          <Button title="Back to sign in" variant="secondary" fullWidth onPress={() => router.replace("/sign-in")} />
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      testID="signup-screen"
      style={{ backgroundColor: t.color.background }}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.content}>
        <View style={styles.brand}>
          <BrandMark size={56} />
          <Text style={[type.h1, { color: t.color.text }]}>Create your account</Text>
          <Text style={[type.bodySm, styles.center, { color: t.color.textMuted }]}>
            Educational use only — not medical advice.
          </Text>
        </View>

        <View style={styles.form}>
          <Input
            testID="signup-email"
            label="Email"
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
          />
          <Input
            testID="signup-password"
            label="Password"
            placeholder="At least 6 characters"
            secureTextEntry
            autoComplete="new-password"
            value={password}
            onChangeText={setPassword}
          />
          {error ? (
            <Text testID="signup-error" style={[type.bodySm, { color: t.color.danger }]}>
              {error}
            </Text>
          ) : null}

          <AgeGate checked={acked} onToggle={() => setAcked((a) => !a)} />

          <Button
            testID="signup-submit"
            title="Create account"
            onPress={onSubmit}
            loading={busy}
            disabled={!acked}
            fullWidth
          />

          <Pressable testID="link-signin" style={styles.signin} onPress={() => router.replace("/sign-in")}>
            <Text style={[type.bodySm, { color: t.color.textMuted }]}>
              Already have an account? <Text style={{ color: t.color.primary, fontWeight: "600" }}>Sign in</Text>
            </Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: "center", padding: space[6] },
  content: { width: "100%", maxWidth: 420, alignSelf: "center", gap: space[8] },
  confirm: { alignItems: "center", gap: space[4] },
  brand: { alignItems: "center", gap: space[3] },
  center: { textAlign: "center" },
  form: { gap: space[4] },
  signin: { alignItems: "center", paddingVertical: space[2] },
});
