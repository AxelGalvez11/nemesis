import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";

// The 4-tab MVP shell (§12). Guarded: an un-authenticated, non-guest visitor is
// redirected to sign-in. A guest (browse-only) is allowed in; screens render guest
// affordances where a real session is required.
export default function TabsLayout() {
  const { session, isGuest, loading } = useAuth();

  if (loading) {
    return (
      <View
        testID="auth-loading"
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      >
        <ActivityIndicator />
      </View>
    );
  }
  if (!session && !isGuest) return <Redirect href="/sign-in" />;

  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: "Ask" }} />
      <Tabs.Screen name="explore" options={{ title: "Explore" }} />
      <Tabs.Screen name="watchlist" options={{ title: "Watchlist" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
