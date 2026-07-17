import { Redirect, Slot } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { DrawerProvider } from "@/components/AppDrawer";
import { TopBar } from "@/components/TopBar";
import { c } from "@/theme/tokens";

// The app shell (§12, redesigned): chat-first with a slide-out drawer instead of a bottom tab bar
// (the ChatGPT/Claude pattern). The shared TopBar + drawer wrap every screen; the active route renders
// in <Slot/>. Guarded: an un-authenticated, non-guest visitor is redirected to sign-in; a guest is let
// in and screens render guest affordances where a real session is required.
export default function AppShellLayout() {
  const { session, isGuest, loading } = useAuth();

  if (loading) {
    return (
      <View testID="auth-loading" style={styles.loading}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }
  if (!session && !isGuest) return <Redirect href="/sign-in" />;

  return (
    <DrawerProvider>
      <View style={styles.shell}>
        <TopBar />
        <View style={styles.body}>
          <Slot />
        </View>
      </View>
    </DrawerProvider>
  );
}

const styles = {
  loading: { flex: 1, alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: c.bg },
  shell: { flex: 1, backgroundColor: c.bg },
  body: { flex: 1 },
};
