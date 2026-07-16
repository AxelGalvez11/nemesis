import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Link, router } from "expo-router";
import { useAuth } from "@/auth/AuthProvider";
import { AGE_TOS_ACK } from "@/lib/legal";
import { common, PLACEHOLDER } from "@/theme/common";
import { c, space } from "@/theme/tokens";
import { Orb } from "@/components/TopBar";

// Sign-in screen. We drive real email/password sign-IN (never UI signup — that would
// hang on email confirmation). "Continue as guest" enters the app in browse-only mode.
// doc-18 age gate: an 18+ / Terms+Privacy attestation gates BOTH entry actions. There is
// no separate signup form, so the entry screen is where the attestation lives; the
// Terms/Privacy links resolve to the legal screens (the router has no auth guard).
export default function SignIn() {
  const { signInEmail, continueAsGuest } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [acked, setAcked] = useState(false);

  return (
    <View style={common.center} testID="signin-screen">
      <Orb size={44} />
      <Text style={common.h1}>Nemesis</Text>
      <Text style={common.sub}>Educational use only — not medical advice.</Text>
      <TextInput
        testID="email"
        style={common.input}
        placeholder="Email"
        placeholderTextColor={PLACEHOLDER}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        testID="password"
        style={common.input}
        placeholder="Password"
        placeholderTextColor={PLACEHOLDER}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error ? (
        <Text testID="signin-error" style={common.err}>
          {error}
        </Text>
      ) : null}

      <Pressable
        testID="age-ack"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: acked }}
        style={styles.ackRow}
        onPress={() => setAcked((a) => !a)}
      >
        <View style={[styles.box, acked && styles.boxOn]}>
          {acked ? <Text style={styles.tick}>✓</Text> : null}
        </View>
        <Text style={styles.ackText}>{AGE_TOS_ACK}</Text>
      </Pressable>
      <View style={styles.links}>
        <Link testID="link-terms" href="/profile/legal?doc=terms" style={common.link}>
          Terms
        </Link>
        <Text style={styles.dot}>·</Text>
        <Link testID="link-privacy" href="/profile/legal?doc=privacy" style={common.link}>
          Privacy Policy
        </Link>
      </View>

      <Pressable
        testID="signin-submit"
        style={[common.btn, (busy || !acked) && styles.disabled]}
        disabled={busy || !acked}
        onPress={async () => {
          setBusy(true);
          setError(null);
          const result = await signInEmail(email.trim(), password);
          setBusy(false);
          if (result.error) setError(result.error);
          else router.replace("/");
        }}
      >
        <Text style={common.btnText}>{busy ? "Signing in…" : "Sign in"}</Text>
      </Pressable>
      <Pressable
        testID="continue-guest"
        style={[common.linkBtn, !acked && styles.disabled]}
        disabled={!acked}
        onPress={() => {
          continueAsGuest();
          router.replace("/");
        }}
      >
        <Text style={common.link}>Continue as guest</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  ackRow: { flexDirection: "row", alignItems: "center", gap: space(2.5), marginTop: space(2), maxWidth: 320 },
  box: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: c.line2,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { backgroundColor: c.acid, borderColor: c.acid },
  tick: { color: c.onAcid, fontSize: 14, fontWeight: "700", lineHeight: 16 },
  ackText: { flex: 1, fontSize: 13, lineHeight: 18, color: c.text2 },
  links: { flexDirection: "row", alignItems: "center", gap: space(2), marginTop: space(1.5) },
  dot: { color: c.text3 },
  disabled: { opacity: 0.45 },
});
