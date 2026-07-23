import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createWatch, fetchWatches } from "@/api/monitor";
import { useAuth } from "@/auth/AuthProvider";
import { c, radius, space, type } from "@/theme/tokens";

// "Watch this" affordance on the drug page. Creates a topic watch in the LIVE evidence_watches system
// (the same one web uses + the Monitoring tab reads) — NOT the retired watchlist_items spine the old
// Follow button wrote, which made a phone "follow" diverge from web. If the drug is already watched we
// link straight to its monitor feed so a returning user can't silently create a duplicate (and burn
// their plan limit). The per-plan cap is enforced server-side; "limit" surfaces an upgrade hint.
const ERROR_COPY: Record<"not_enabled" | "limit" | "auth" | "unknown", string> = {
  not_enabled: "Monitoring isn’t switched on yet.",
  limit: "You’ve reached your plan’s watch limit.",
  auth: "Sign in to start watching.",
  unknown: "Couldn’t start watching — try again.",
};

export function FollowButton({ drugId, drugName }: { drugId: string; drugName: string }) {
  const { session } = useAuth();
  const qc = useQueryClient();
  const { data: watches = [], isLoading } = useQuery({
    queryKey: ["watches"],
    queryFn: fetchWatches,
    enabled: !!session,
  });
  // The topic watch this button creates uses the drug name as both title and topic (the (user_id, topic)
  // uniqueness key), so an existing watch with the same title is "already watching this drug".
  const existing = watches.find((w) => w.title === drugName);

  const create = useMutation({
    mutationFn: () =>
      createWatch({ kind: "topic", title: drugName, topic: drugName, query_terms: drugName, mentions: [drugName] }),
    onSuccess: (res) => {
      if (res.ok) {
        qc.invalidateQueries({ queryKey: ["watches"] });
        router.push(`/monitor/${res.id}`);
      }
    },
  });

  if (!session) return null;
  if (isLoading) return <ActivityIndicator testID="follow-loading" color={c.accent} />;

  if (existing) {
    return (
      <Pressable
        testID="watching-btn"
        style={[styles.btn, styles.following]}
        onPress={() => router.push(`/monitor/${existing.id}`)}
      >
        <Text style={styles.followingText}>Watching ✓</Text>
      </Pressable>
    );
  }

  const res = create.data;
  const errReason = res && !res.ok ? res.reason : null;

  return (
    <View style={styles.wrap}>
      <Pressable
        testID="follow-btn"
        style={[styles.btn, styles.follow]}
        disabled={create.isPending}
        onPress={() => create.mutate()}
      >
        <Text style={styles.followText}>{create.isPending ? "Starting…" : "+ Watch this"}</Text>
      </Pressable>
      {errReason ? (
        <Text style={styles.note} testID="follow-note">
          {ERROR_COPY[errReason]}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "flex-start", gap: space(1.5) },
  btn: { paddingHorizontal: space(4.5), paddingVertical: space(2.5), borderRadius: radius.sm, alignSelf: "flex-start" },
  follow: { backgroundColor: c.accent },
  followText: { color: c.onAccent, fontWeight: "700", fontSize: type.small.fontSize },
  following: { backgroundColor: c.accentFaint, borderWidth: 1, borderColor: c.accentLine },
  followingText: { color: c.accentDim, fontWeight: "700", fontSize: type.small.fontSize },
  note: { fontSize: type.micro.fontSize, color: c.warn },
});
