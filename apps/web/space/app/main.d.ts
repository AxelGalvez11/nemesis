import type { SupabaseClient } from "@supabase/supabase-js";

export interface SpaceHost {
  supabase: SupabaseClient;
  /** Next.js navigation, for leaving the Space frontend's own routes (Canvas, Study, Calendar, pricing). */
  navigate(path: string, opts?: { replace?: boolean }): void;
  setTheme(pref: "system" | "light" | "dark"): void;
  signOut(): Promise<void> | void;
  /** Shares a page by email and says how many people were invited and emailed. */
  invite?(request: { page: string; emails: string[]; role: "full" | "edit" | "comment" | "read" }): Promise<{ invited: number; emailed: number }>;
  toast?: (text: string) => void;
}

export function mountSpace(root: HTMLElement, host: SpaceHost): () => void;
