import { useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { listCalendarEvents } from "@/api/cloudCalendar";
import type { PageNode, PageSummary } from "@/api/space";
import { createPage } from "@/api/spaceWrite";
import { useAuth } from "@/auth/AuthProvider";
import { NewMenu } from "@/components/nx/NewMenu";
import { NxIcon } from "@/components/nx/NxIcon";
import { NxBottomBar, NxButton, NxNewButton, NxRow, NxSection } from "@/components/nx/primitives";
import { useSpacePages } from "@/hooks/useSpace";
import { ago } from "@/lib/ago";
import { iconOf } from "@/lib/fresh";
import { nxType, useNx, type NxColors } from "@/theme/nx";

// Notes, the home tab (canvas artboards "Main" and "Notes, first day"): Coming up (today's classes),
// Recents as cards, then the page tree under Private. With no pages yet, the first-day screen.
export default function NotesHome() {
  const c = useNx();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const { spaceId, pages, tree, recents, loading, error, refetch, refreshing } = useSpacePages();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState(false);
  const [making, setMaking] = useState(false);
  const [makeError, setMakeError] = useState<string | null>(null);

  const today = localDate(new Date());
  const upcoming = useQuery({
    queryKey: ["calendar-coming-up", uid, today],
    queryFn: () => listCalendarEvents(uid as string, { from: today, to: today }),
    enabled: !!uid,
    staleTime: 5 * 60_000,
  });
  const now = nowTime();
  const comingUp = (upcoming.data ?? []).filter((e) => !e.time || e.time >= now).slice(0, 3);

  const openPage = (id: string) => router.push({ pathname: "/page/[id]", params: { id } });

  const newPage = async () => {
    if (!spaceId) return;
    setMaking(true);
    setMakeError(null);
    try {
      const id = await createPage(spaceId, {});
      await qc.invalidateQueries({ queryKey: ["ws-all-pages", spaceId] });
      setMenu(false);
      router.push({ pathname: "/page/[id]", params: { id, fresh: "1" } });
    } catch (e) {
      setMakeError(e instanceof Error ? e.message : "The page could not be made.");
      setMenu(false);
    } finally {
      setMaking(false);
    }
  };

  const renderNode = (node: PageNode, level: number): React.ReactNode[] => {
    const expanded = !!open[node.id];
    const leaf = node.children.length === 0;
    const rows: React.ReactNode[] = [
      <Pressable
        key={node.id}
        onPress={() => openPage(node.id)}
        style={({ pressed }) => [styles.tree, { paddingLeft: 6 + level * 22 }, pressed && { backgroundColor: c.soft }]}
      >
        <Pressable
          hitSlop={6}
          disabled={leaf}
          onPress={() => setOpen((o) => ({ ...o, [node.id]: !o[node.id] }))}
          style={styles.chev}
          accessibilityLabel={expanded ? "Collapse" : "Expand"}
        >
          {leaf ? null : <NxIcon name={expanded ? "chev_d" : "chev_r"} size={14} color={c.t3} strokeWidth={2} />}
        </Pressable>
        <Text style={styles.treeEmoji}>{iconOf(node.props.icon)}</Text>
        <Text numberOfLines={1} style={[nxType.rowTitle, { color: c.t1, flex: 1 }]}>
          {node.props.title || "Untitled"}
        </Text>
      </Pressable>,
    ];
    if (expanded) for (const child of node.children) rows.push(...renderNode(child, level + 1));
    return rows;
  };

  const firstDay = !loading && !error && pages.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={c.t3} />
      ) : firstDay ? (
        <View style={{ flex: 1 }}>
          <View style={styles.center}>
            <View style={[styles.circle, { backgroundColor: c.sel }]}>
              <NxIcon name="notes" size={40} color={c.t1} strokeWidth={1.5} />
            </View>
            <Text style={[styles.centerTitle, { color: c.t1 }]}>Your notes live here</Text>
            <Text style={[styles.centerText, { color: c.t2 }]}>Start a note. Nemesis and your own AI can read everything you keep here.</Text>
            {makeError ? <Text style={{ color: c.danger, fontSize: 14 }}>{makeError}</Text> : null}
          </View>
          <View style={[styles.actions, { paddingBottom: insets.bottom + 12 }]}>
            <NxButton label={making ? "Making your note" : "New note"} icon="compose" disabled={making || !spaceId} onPress={() => void newPage()} />
          </View>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  void refetch();
                  void upcoming.refetch();
                }}
                tintColor={c.t3}
              />
            }
          >
            {error ? <Text style={[styles.note, { color: c.t2 }]}>Your pages could not be loaded. Pull down to try again.</Text> : null}
            {makeError ? <Text style={[styles.note, { color: c.danger }]}>{makeError}</Text> : null}

            {comingUp.length ? (
              <>
                <NxSection label="Coming up" />
                {comingUp.map((e) => (
                  <NxRow
                    key={e.id}
                    lead={<View style={[styles.bar, { backgroundColor: c.t3 }]} />}
                    title={e.title}
                    meta={[e.time ? formatTime(e.time) : "Today", e.course].filter(Boolean).join(", ")}
                  />
                ))}
              </>
            ) : null}

            {recents.length ? (
              <>
                <NxSection label="Recents" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cards}>
                  {recents.slice(0, 8).map((p, i) => (
                    <RecentCard key={p.id} page={p} cover={coverFor(c, i)} onPress={() => openPage(p.id)} />
                  ))}
                </ScrollView>
              </>
            ) : null}

            <NxSection label="Private" />
            {tree.flatMap((n) => renderNode(n, 0))}
          </ScrollView>
          <NxBottomBar ask="Ask Nemesis" onAsk={() => router.push("/chat")} right={spaceId ? <NxNewButton onPress={() => setMenu(true)} /> : null} />
        </>
      )}
      <NewMenu
        visible={menu}
        busy={making}
        onClose={() => setMenu(false)}
        onNewPage={() => void newPage()}
        onRecord={() => {
          setMenu(false);
          router.push("/chat");
        }}
      />
    </View>
  );
}

function RecentCard({ page, cover, onPress }: { page: PageSummary; cover: string; onPress: () => void }) {
  const c = useNx();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, { backgroundColor: c.card, borderColor: c.ln }, pressed && { opacity: 0.8 }]}>
      <View style={{ height: 38, backgroundColor: cover }} />
      <View style={{ paddingHorizontal: 12, paddingBottom: 12, marginTop: -14 }}>
        <Text style={{ fontSize: 24, lineHeight: 28 }}>{iconOf(page.props.icon)}</Text>
        <Text numberOfLines={2} style={{ fontSize: 14, lineHeight: 19, fontWeight: "500", color: c.t1, marginTop: 6, height: 38 }}>
          {page.props.title || "Untitled"}
        </Text>
        <Text style={{ fontSize: 12, lineHeight: 18, color: c.t2, marginTop: 4 }}>{ago(page.edited_at)}</Text>
      </View>
    </Pressable>
  );
}

function coverFor(c: NxColors, i: number): string {
  return [c.c1, c.c2, c.c3][i % 3]!;
}

function localDate(d: Date): string {
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
}

function nowTime(): string {
  const d = new Date();
  return `${`${d.getHours()}`.padStart(2, "0")}:${`${d.getMinutes()}`.padStart(2, "0")}`;
}

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map((x) => Number(x));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const d = new Date();
  d.setHours(h!, m!, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

const styles = StyleSheet.create({
  tree: { flexDirection: "row", alignItems: "center", minHeight: 44, paddingRight: 16 },
  chev: { width: 32, height: 44, alignItems: "center", justifyContent: "center" },
  treeEmoji: { width: 26, fontSize: 18, textAlign: "center" },
  note: { paddingHorizontal: 20, paddingTop: 16, fontSize: 15, lineHeight: 22 },
  bar: { width: 3, height: 32, borderRadius: 2, marginLeft: 4 },
  cards: { gap: 10, paddingHorizontal: 16, paddingVertical: 2 },
  card: { width: 140, borderRadius: 10, borderWidth: 1, overflow: "hidden" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 32 },
  circle: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  centerTitle: { fontSize: 22, lineHeight: 28, fontWeight: "600", letterSpacing: -0.3, textAlign: "center" },
  centerText: { fontSize: 16, lineHeight: 24, textAlign: "center" },
  actions: { paddingHorizontal: 20, gap: 8 },
});
