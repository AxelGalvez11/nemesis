import { useQuery } from "@tanstack/react-query";
import { allPages, bootstrap, buildTree, type PageSummary } from "@/api/space";
import { listDecks } from "@/api/study";
import { useAuth } from "@/auth/AuthProvider";
import { isFresh } from "@/lib/fresh";

/** The signed-in person's space and every page in it, as a flat list, a lookup and a tree. */
export function useSpacePages() {
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const boot = useQuery({ queryKey: ["ws-bootstrap", uid], queryFn: bootstrap, enabled: !!uid, staleTime: 60_000 });
  const spaceId = boot.data?.space?.id ?? null;
  const pages = useQuery({
    queryKey: ["ws-all-pages", spaceId],
    queryFn: () => allPages(spaceId as string),
    enabled: !!spaceId,
    staleTime: 15_000,
  });
  // Old pages (copied in from the old library) are not shown. See lib/fresh.ts.
  const list: PageSummary[] = (pages.data ?? []).filter((p) => isFresh(p.created_at));
  const byId = new Map(list.map((p) => [p.id, p]));
  return {
    spaceId,
    pages: list,
    byId,
    tree: buildTree(list),
    recents: (boot.data?.recents ?? []).filter((p) => isFresh(p.created_at)),
    favoriteIds: new Set((boot.data?.favorites ?? []).map((p) => p.id)),
    loading: boot.isLoading || pages.isLoading,
    error: (boot.error ?? pages.error) as Error | null,
    refetch: async () => {
      await boot.refetch();
      await pages.refetch();
    },
    refreshing: boot.isRefetching || pages.isRefetching,
  };
}

export function useDecks() {
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  return useQuery({ queryKey: ["study-decks", uid], queryFn: listDecks, enabled: !!uid, staleTime: 15_000 });
}
