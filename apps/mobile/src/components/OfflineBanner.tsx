import { StyleSheet, Text, View } from "react-native";
import { useOnline } from "@/lib/useOnline";

// The doc-06 "offline" state, surfaced globally so it satisfies the §12 matrix on every
// key screen at once (Ask/Drug/Source/Search/Watchlist all show ●) rather than five
// per-screen copies. Floats over the active route; renders nothing while online.
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <View style={styles.banner} testID="offline-banner" accessibilityRole="alert">
      <Text style={styles.text}>You're offline. Showing cached data where available.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#3a4451",
    paddingTop: 44,
    paddingBottom: 10,
    paddingHorizontal: 16,
    zIndex: 1000,
  },
  text: { color: "#fff", fontSize: 13, fontWeight: "600", textAlign: "center" },
});
