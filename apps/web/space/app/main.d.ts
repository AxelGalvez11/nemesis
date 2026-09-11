import type { SupabaseClient } from "@supabase/supabase-js";

export interface SpaceHost {
  supabase: SupabaseClient;
  /** Next.js navigation, for leaving the Space frontend's own routes (Canvas, Study, Calendar, pricing). */
  navigate(path: string, opts?: { replace?: boolean }): void;
  setTheme(pref: "system" | "light" | "dark"): void;
  signOut(): Promise<void> | void;
  toast?: (text: string) => void;
}

export function mountSpace(root: HTMLElement, host: SpaceHost): () => void;
