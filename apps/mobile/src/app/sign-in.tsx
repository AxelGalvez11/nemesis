import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/auth/AuthProvider";
import { common } from "@/theme/common";

// Sign-in screen. We drive real email/password sign-IN (never UI signup — that would
// hang on email confirmation). "Continue as guest" enters the app in browse-only mode.
export default function SignIn() {
  const { signInEmail, continueAsGuest } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <View style={common.center} testID="signin-screen">
      <Text style={common.h1}>PharmaBro</Text>
      <Text style={common.sub}>Educational use only — not medical advice.</Text>
      <TextInput
        testID="email"
        style={common.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        testID="password"
        style={common.input}
        placeholder="Password"
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
        testID="signin-submit"
        style={common.btn}
        disabled={busy}
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
        style={common.linkBtn}
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
