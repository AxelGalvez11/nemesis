import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWatchlist, followItem, unfollowItem } from "@/api/watchlist";
import { useAuth } from "@/auth/AuthProvider";
import { FREE_WATCHLIST_LIMIT } from "@/lib/limits";

// AC7 affordance: follow/unfollow a drug. Free tier caps at FREE_WATCHLIST_LIMIT —
// past it the button becomes the doc-06 paywall stub (real purchases = Phase 8).
export function FollowButton({ drugId }: { drugId: string }) {
  const { session } = useAuth();
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["watchlist"],
    queryFn: fetchWatchlist,
    enabled: !!session,
  });
  const followed = items.find((i) => i.item_type === "drug" && i.item_ref === drugId);
  const atLimit = !followed && items.length >= FREE_WATCHLIST_LIMIT;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["watchlist"] });
  const follow = useMutation({ mutationFn: () => followItem("drug", drugId), onSuccess: invalidate });
  const unfollow = useMutation({
    mutationFn: () => unfollowItem(followed!.id),
    onSuccess: invalidate,
  });

  if (!session) return null;
  if (isLoading) return <ActivityIndicator testID="follow-loading" />;

  const busy = follow.isPending || unfollow.isPending;

  if (atLimit) {
    return (
      <Pressable
        testID="follow-paywall"
        style={[styles.btn, styles.paywall]}
        disabled // inert stub — the RevenueCat upgrade flow wires here in Phase 8
      >
        <Text style={styles.paywallText}>Upgrade to follow more than {FREE_WATCHLIST_LIMIT}</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      testID={followed ? "unfollow-btn" : "follow-btn"}
      style={[styles.btn, followed ? styles.following : styles.follow]}
      disabled={busy}
      onPress={() => (followed ? unfollow.mutate() : follow.mutate())}
    >
      <Text style={followed ? styles.followingText : styles.followText}>
        {busy ? "…" : followed ? "Following ✓" : "+ Follow"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8, alignSelf: "flex-start" },
  follow: { backgroundColor: "#208AEF" },
  followText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  following: { backgroundColor: "#e6f0fb", borderWidth: 1, borderColor: "#208AEF" },
  followingText: { color: "#1c6fc0", fontWeight: "700", fontSize: 15 },
  paywall: { backgroundColor: "#fdf6e3", borderWidth: 1, borderColor: "#d8b24a", opacity: 0.9 },
  paywallText: { color: "#7a5c12", fontWeight: "700", fontSize: 14 },
});
