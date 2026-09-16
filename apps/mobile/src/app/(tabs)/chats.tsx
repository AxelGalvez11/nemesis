import { useCallback, useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { PageMenu, type PageMenuItem } from "@/components/nx/PageMenu";
import { SkelList } from "@/components/nx/Skeleton";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { deleteThread, listThreads, pinThread, renameThread } from "@/api/chat";
import { useAuth } from "@/auth/AuthProvider";
import { Composer } from "@/components/nx/chat/Composer";
import { ChatHero, CobaltGlow } from "@/components/nx/chat/parts";
import { NoteAskBar } from "@/components/nx/NoteAskBar";
import { NxIcon } from "@/components/nx/NxIcon";
import { NxBottomBar, NxRow, NxSection } from "@/components/nx/primitives";
import { useSpacePages } from "@/hooks/useSpace";
import type { ThreadSummary } from "@/lib/chat-threads";
import { useNx } from "@/theme/nx";
import { isFresh } from "@/lib/fresh";

const DAY = 86_400_000;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function startOfToday(now: number) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Canvas meta: "12 min ago", "3h ago" today; the weekday this week; "Aug 21" before that. */
function when(iso: string, now = Date.now()): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "";
  if (at >= startOfToday(now)) {
    const mins = Math.round((now - at) / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins} min ago`;
    return `${Math.round(mins / 60)}h ago`;
  }
  if (at >= startOfToday(now) - 6 * DAY) return WEEKDAYS[new Date(at).getDay()];
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function groupOf(iso: string, now = Date.now()): string {
  const at = Date.parse(iso);
  const today = startOfToday(now);
  if (at >= today) return "Today";
  if (at >= today - 6 * DAY) return "This week";
  const d = new Date(now);
  const thisMonth = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  if (at >= thisMonth) return "This month";
  const lastMonth = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
  return at >= lastMonth ? "Last month" : "Earlier";
}

const openChat = (id: string, q?: string): Href => (q ? `/c/${id}?q=${encodeURIComponent(q)}` : `/c/${id}`) as Href;

// Chats (canvas NemesisAI): previous chats by day; a chat opens full screen at /c/[id]. No chats yet is
// canvas AIEmpty: the Nemesis tile, three starters and the composer, which opens a new chat.
export default function ChatsTab() {
  const c = useNx();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const { pages } = useSpacePages();
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [asking, setAsking] = useState(false);
  // A chat row's long-press options, in the app's own pop-up. Items stay while it animates out.
  const [rowMenu, setRowMenu] = useState<{ open: boolean; title: string; items: PageMenuItem[] }>({ open: false, title: "", items: [] });

  // 🔴 ALWAYS SETTLE. Returning early with no signed-in person (or on a failed read) left `threads` null,
  // and null draws the spinner forever. No person, or no list, is the empty state.
  const load = useCallback(async () => {
    if (!uid) {
      setThreads([]);
      return;
    }
    try {
      // Old chats are not shown. See lib/fresh.ts.
      setThreads((await listThreads(uid)).filter((t) => isFresh((t as ThreadSummary & { createdAt?: string }).createdAt ?? t.updatedAt)));
    } catch {
      setThreads((prev) => prev ?? []);
    }
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const options = (t: ThreadSummary) => {
    if (!uid) return;
    const rename = () =>
      Alert.prompt("Rename chat", undefined, async (name) => {
        if (!name?.trim()) return;
        await renameThread(uid, t.id, name.trim()).catch(() => undefined);
        void load();
      }, "plain-text", t.title);
    const pin = async () => {
      await pinThread(uid, t.id, !t.pinned).catch(() => undefined);
      void load();
    };
    const remove = () =>
      Alert.alert("Delete this chat?", "It is removed from all your devices.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setThreads((prev) => (prev ?? []).filter((x) => x.id !== t.id));
            await deleteThread(uid, t.id).catch(() => undefined);
            void load();
          },
        },
      ]);
    // A system prompt cannot open while the pop-up is still leaving, so those wait for it to finish.
    const afterClose = (fn: () => void) => () => setTimeout(fn, 320);
    setRowMenu({
      open: true,
      title: t.title || "New chat",
      items: [
        { icon: "compose", label: "Rename", onPress: afterClose(rename) },
        { icon: "pin", label: t.pinned ? "Unpin" : "Pin", onPress: () => void pin() },
        { icon: "trash", label: "Delete", danger: true, onPress: afterClose(remove) },
      ],
    });
  };

  if (threads !== null && threads.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <CobaltGlow height={300} opacity={0.1} solid={0.2} breathe={false} />
        <View style={styles.hero}>
          <ChatHero hasNotes={pages.length > 0} onSuggest={(s) => router.push(openChat("new", s))} />
        </View>
        <Composer value="" onChange={() => undefined} onSend={() => undefined} onPress={() => setAsking(true)} />
        <AskHere asking={asking} setAsking={setAsking} onSend={(q) => router.push(openChat("new", q))} />
      </View>
    );
  }

  const groups: { label: string; items: ThreadSummary[] }[] = [];
  const pinned = (threads ?? []).filter((t) => t.pinned);
  if (pinned.length) groups.push({ label: "Pinned", items: pinned });
  for (const t of threads ?? []) {
    if (t.pinned) continue;
    const label = groupOf(t.updatedAt);
    const g = groups.find((x) => x.label === label);
    if (g) g.items.push(t);
    else groups.push({ label, items: [t] });
  }

  const lead = (
    <View style={[styles.icbox, { backgroundColor: c.soft }]}>
      <NxIcon name="comment" size={18} color={c.t2} />
    </View>
  );

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
          <SkelList rows={7} lead="none" />
        ) : (
          groups.map((g) => (
            <View key={g.label}>
              <NxSection label={g.label} />
              {g.items.map((t) => (
                <NxRow key={t.id} lead={lead} title={t.title || "New chat"} meta={when(t.updatedAt)} onPress={() => router.push(openChat(t.id))} onLongPress={() => options(t)} />
              ))}
            </View>
          ))
        )}
      </ScrollView>
      <NxBottomBar ask="Ask Nemesis" onSearch={() => router.push("/search" as Href)} onAsk={() => setAsking(true)} />
      <AskHere asking={asking} setAsking={setAsking} onSend={(q) => router.push(openChat("new", q))} />
      <PageMenu anchor="bottom" visible={rowMenu.open} title={rowMenu.title} onClose={() => setRowMenu((m) => ({ ...m, open: false }))} items={rowMenu.items} />
    </View>
  );
}

/** Owner 2026-09-15: the question is typed where you are; only sending opens the chat. */
function AskHere({ asking, setAsking, onSend }: { asking: boolean; setAsking: (v: boolean) => void; onSend: (q: string) => void }) {
  return (
    <NoteAskBar
      visible={asking}
      onClose={() => setAsking(false)}
      page={null}
      onSend={(q) => {
        setAsking(false);
        onSend(q);
      }}
    />
  );
}

const styles = StyleSheet.create({
  hero: { flex: 1, justifyContent: "center", paddingHorizontal: 24, paddingBottom: 150 },
  icbox: { width: 32, height: 32, borderRadius: 6, alignItems: "center", justifyContent: "center" },
});
