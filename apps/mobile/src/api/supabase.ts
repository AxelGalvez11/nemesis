import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// Public client config only. EXPO_PUBLIC_* is inlined into the bundle — the anon
// key is public by design; the service key NEVER ships here. Reads are gated by the
// REVOKE-anon/GRANT-authenticated posture (0111/0112/0118), so the app must be
// signed in (JWT) to read protected data.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set (see .env.example)",
  );
}

// Native: persist the session in the OS keychain. Web (the e2e gate path):
// supabase-js defaults to localStorage. NOTE (native carry-forward): SecureStore
// has a ~2KB per-key limit; a large session may need chunking — handled when native
// is exercised (device checklist / 6b-5), not on the web gate path.
const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    ...(Platform.OS === "web" ? {} : { storage: secureStorage }),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
