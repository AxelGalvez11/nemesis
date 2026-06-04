import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchLatestDigest,
  fetchWatchlist,
  fetchWatchlistUpdates,
  unfollowItem,
} from "@/api/watchlist";
import { fetchDrug } from "@/api/drugs";
import { useAuth } from "@/auth/AuthProvider";
import { EmptyState, ErrorState, GuestState } from "@/components/states";
import { Card, SectionHeader } from "@/components/ui";
import { SourceLink } from "@/components/SourceLink";
import { FREE_WATCHLIST_LIMIT } from "@/lib/limits";
import type { WatchlistItem } from "@pharmabro/shared";
import { common } from "@/theme/common";

// AC7 (follow ≥3) + AC8 (weekly digest). Three owner-scoped reads: the follows
// (watchlist_items), the live update feed (get_watchlist_updates), and the latest
// digest snapshot (digests). All RLS-scoped to the signed-in user.
export default function WatchlistTab() {
  const { session } = useAuth();
  const qc = useQueryClient();

  const follows = useQuery({ queryKey: ["watchlist"], queryFn: fetchWatchlist, enabled: !!session });
  const updates = useQuery({ queryKey: ["watchlist-updates"], queryFn: fetchWatchlistUpdates, enabled: !!session });
  const digest = useQuery({ queryKey: ["digest"], queryFn: fetchLatestDigest, enabled: !!session });

  const unfollow = useMutation({
    mutationFn: (id: string) => unfollowItem(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  if (!session) {
    return (
      <View style={common.screen} testID="tab-watchlist">
        <Text style={common.h1}>Watchlist</Text>
        <GuestState body="Sign in to follow items and get a weekly digest." />
      </View>
    );
  }

  const items = follows.data ?? [];

  return (
    <ScrollView contentContainerStyle={styles.body} testID="tab-watchlist">
      <Text style={common.h1}>Watchlist</Text>

      {follows.isLoading ? (
        <ActivityIndicator testID="watchlist-loading" />
      ) : follows.isError ? (
        <ErrorState testID="watchlist-error" body={(follows.error as Error).message} />
      ) : items.length === 0 ? (
        <EmptyState
          testID="watchlist-empty"
          title="No follows yet"
          body="Follow drugs, clinical trials, medication classes, or PubMed keywords. PharmaBro will notify you when something important changes."
        />
      ) : (
        <View style={styles.section}>
          <SectionHeader title={`Following (${items.length})`} testID="watchlist-following" />
          {items.map((it, i) => (
            <FollowRow key={it.id} item={it} index={i} onUnfollow={() => unfollow.mutate(it.id)} busy={unfollow.isPending} />
          ))}
          {items.length >= FREE_WATCHLIST_LIMIT ? (
            <Text style={styles.paywall} testID="watchlist-paywall">
              Free plan: {FREE_WATCHLIST_LIMIT} follows. Upgrade to follow more.
            </Text>
          ) : null}
        </View>
      )}

      {/* AC8 — latest weekly digest snapshot */}
      <View style={styles.section}>
        <SectionHeader title="Latest weekly digest" testID="watchlist-digest" />
        {digest.isLoading ? (
          <ActivityIndicator />
        ) : digest.isError ? (
          <ErrorState testID="digest-error" body={(digest.error as Error).message} />
        ) : digest.data && digest.data.items.length > 0 ? (
          <Card>
            <Text style={styles.digestMeta}>
              {digest.data.update_count} update(s) · {digest.data.period_start?.slice(0, 10)}
            </Text>
            {digest.data.items.slice(0, 10).map((d, i) => (
              <Text key={d.id} style={styles.digestItem} testID={`digest-item-${i}`} numberOfLines={2}>
                • {d.title}
              </Text>
            ))}
          </Card>
        ) : (
          <Text style={styles.muted} testID="digest-empty">No digest generated yet.</Text>
        )}
      </View>

      {/* Live update feed */}
      <View style={styles.section}>
        <SectionHeader title="What's new" testID="watchlist-updates" />
        {updates.isLoading ? (
          <ActivityIndicator />
        ) : updates.isError ? (
          <ErrorState testID="updates-error" body={(updates.error as Error).message} />
        ) : updates.data && updates.data.length > 0 ? (
          updates.data.slice(0, 20).map((u, i) => (
            <Card key={u.id} testID={`update-${i}`}>
              <Text style={styles.updateTitle} numberOfLines={2}>{u.title}</Text>
              <Text style={styles.updateMeta}>{u.update_type.replace(/_/g, " ")}</Text>
              <SourceLink sourceId={u.source_id} testID={`update-cite-${i}`} />
            </Card>
          ))
        ) : (
          <Text style={styles.muted} testID="updates-empty">No updates for your follows yet.</Text>
        )}
      </View>
    </ScrollView>
  );
}

function FollowRow({
  item,
  index,
  onUnfollow,
  busy,
}: {
  item: WatchlistItem;
  index: number;
  onUnfollow: () => void;
  busy: boolean;
}) {
  // Resolve a drug follow's name (item_ref is the entity uuid); other types show the ref.
  const isDrug = item.item_type === "drug";
  const name = useQuery({
    queryKey: ["drug-name", item.item_ref],
    queryFn: () => fetchDrug(item.item_ref),
    enabled: isDrug,
  });
  const label = isDrug ? name.data?.canonical_name ?? "…" : item.item_ref;

  return (
    <Card testID={`watchlist-item-${index}`}>
      <View style={styles.row}>
        <Pressable
          style={styles.rowMain}
          disabled={!isDrug}
          onPress={() => isDrug && router.push(`/drug/${item.item_ref}`)}
        >
          <Text style={styles.itemName} testID={`watchlist-item-name-${index}`}>{label}</Text>
          <Text style={styles.itemType}>{item.item_type}</Text>
        </Pressable>
        <Pressable testID={`unfollow-${index}`} style={styles.unfollow} disabled={busy} onPress={onUnfollow}>
          <Text style={styles.unfollowText}>Unfollow</Text>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 16 },
  section: { gap: 8 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  rowMain: { flex: 1, gap: 2 },
  itemName: { fontSize: 16, fontWeight: "600", color: "#1f2933" },
  itemType: { fontSize: 12, color: "#6b7686", textTransform: "capitalize" },
  unfollow: { paddingHorizontal: 12, paddingVertical: 6 },
  unfollowText: { color: "#b04632", fontSize: 13, fontWeight: "600" },
  paywall: { fontSize: 13, color: "#7a5c12", fontStyle: "italic" },
  digestMeta: { fontSize: 13, color: "#6b7686", marginBottom: 4 },
  digestItem: { fontSize: 14, lineHeight: 20, color: "#3a4451" },
  updateTitle: { fontSize: 14, fontWeight: "600", color: "#1f2933", lineHeight: 20 },
  updateMeta: { fontSize: 12, color: "#6b7686", textTransform: "capitalize" },
  muted: { fontSize: 14, color: "#6b7686" },
});
