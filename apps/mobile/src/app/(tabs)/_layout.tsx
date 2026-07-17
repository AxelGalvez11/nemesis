import { Redirect, Slot } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { DrawerProvider } from "@/components/AppDrawer";
import { TopBar } from "@/components/TopBar";
import { useTheme } from "@/theme/ThemeProvider";

// The app shell (§12, redesigned): chat-first with a slide-out drawer instead of a bottom tab bar
// (the ChatGPT/Claude pattern). The shared TopBar + drawer wrap every screen; the active route renders
// in <Slot/>. Guarded: an un-authenticated, non-guest visitor is redirected to sign-in; a guest is let
// in and screens render guest affordances where a real session is required.
export default function AppShellLayout() {
  const { session, isGuest, loading } = useAuth();
  const { colors: c } = useTheme();

  if (loading) {
    return (
      <View
        testID="auth-loading"
        style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.bg }}
      >
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }
  if (!session && !isGuest) return <Redirect href="/sign-in" />;

  return (
    <DrawerProvider>
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <TopBar />
        <View style={{ flex: 1 }}>
          <Slot />
        </View>
      </View>
    </DrawerProvider>
  );
}
