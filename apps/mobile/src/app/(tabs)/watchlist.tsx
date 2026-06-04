import { Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { EmptyState, GuestState } from "@/components/states";
import { common } from "@/theme/common";

// Watchlist tab (stub). Follow/updates/digest/compare land in 6b-4. Empty-state copy
// is the doc-06 verbatim text.
export default function WatchlistTab() {
  const { session } = useAuth();
  return (
    <View style={common.screen} testID="tab-watchlist">
      <Text style={common.h1}>Watchlist</Text>
      {session ? (
        <EmptyState
          testID="watchlist-empty"
          title="No follows yet"
          body="Follow drugs, clinical trials, medication classes, or PubMed keywords. PharmaBro will notify you when something important changes."
        />
      ) : (
        <GuestState body="Sign in to follow items and get a weekly digest." />
      )}
    </View>
  );
}
