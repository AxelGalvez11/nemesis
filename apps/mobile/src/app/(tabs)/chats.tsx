import { useCallback, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { listThreads } from "@/api/chat";
import { useAuth } from "@/auth/AuthProvider";
import { NxIcon } from "@/components/nx/NxIcon";
import { NxBottomBar, NxRow, NxSection } from "@/components/nx/primitives";
import { ago } from "@/lib/ago";
import type { ThreadSummary } from "@/lib/chat-threads";
import { useNx } from "@/theme/nx";
import { isFresh } from "@/lib/fresh";

// Chats (canvas artboard "Chats, previous chats"): opens on previous chats; a chat opens full screen.
export default function ChatsTab() {
  const c = useNx();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // 🔴 ALWAYS SETTLE. Returning early with no signed-in person (or on a failed read) left `threads` null,
  // and null draws the spinner forever. No person, or no list, is the empty state.
  const load = useCallback(async () => {
    if (!uid) {
      setThreads([]);
      return;
    }
    try {
      // Old chats are not shown. See lib/fresh.ts.
      setThreads((await listThreads(uid)).filter((t) => isFresh(t.createdAt ?? t.updatedAt)));
    } catch {
      setThreads((prev) => prev ?? []);
    }
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const pinned = (threads ?? []).filter((t) => t.pinned);
  const rest = (threads ?? []).filter((t) => !t.pinned);
  const open = (id: string) => router.push({ pathname: "/chat", params: { c: id } });

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={c.t3}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        {threads === null ? (
          <ActivityIndicator style={{ marginTop: 48 }} color={c.t3} />
        ) : threads.length === 0 ? (
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: c.sel }]}>
              <NxIcon name="bubble" size={30} color={c.t2} />
            </View>
            <Text style={[styles.emptyTitle, { color: c.t1 }]}>No chats yet</Text>
            <Text style={[styles.emptyText, { color: c.t2 }]}>Ask Nemesis anything. It answers from your notes first.</Text>
          </View>
        ) : (
          <>
            {pinned.length ? <NxSection label="Pinned" /> : null}
            {pinned.map((t) => (
              <NxRow key={t.id} lead={<NxIcon name="bubble" size={20} color={c.t2} />} title={t.title || "New chat"} meta={ago(t.updatedAt)} onPress={() => open(t.id)} />
            ))}
            <NxSection label="Previous chats" />
            {rest.map((t) => (
              <NxRow key={t.id} lead={<NxIcon name="bubble" size={20} color={c.t2} />} title={t.title || "New chat"} meta={ago(t.updatedAt)} onPress={() => open(t.id)} />
            ))}
          </>
        )}
      </ScrollView>
      <NxBottomBar ask="Ask Nemesis" onAsk={() => router.push("/chat")} />
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: "center", paddingTop: 80, paddingHorizontal: 32, gap: 8 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  emptyTitle: { fontSize: 19, fontWeight: "600" },
  emptyText: { fontSize: 15, lineHeight: 22, textAlign: "center" },
});
