import * as SecureStore from "expo-secure-store";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "./supabase";
import { decryptDoc } from "@/lib/library-crypto";
import {
  bytesFromBase64Url,
  mergeRows,
  PAIRING_PREFIX,
  parsePairingCode,
  syncCursor,
  type LibraryDoc,
  type SyncCache,
  type SyncRow,
} from "@/lib/library-sync";

// Phone side of read-only library sync (Phase 1). The Mac publishes end-to-end
// encrypted rows into public.library_documents; this module holds the paired vault
// key (SecureStore), keeps a ciphertext cache on disk (encrypted at rest for free),
// pulls incrementally under RLS, and decrypts on read. The phone NEVER writes
// library rows — reading is the whole point (single-writer architecture; see
// docs/design/nemesis-phone-readonly-sync-2026-07.md).

const VAULT_KEY_STORE = "nemesis_vault_key_v1";
const CACHE_PATH = `${FileSystem.documentDirectory ?? ""}library-cache-v1.json`;

/** The paired vault key, or null when this phone hasn't been paired yet. */
export async function loadVaultKey(): Promise<Uint8Array | null> {
  try {
    const stored = await SecureStore.getItemAsync(VAULT_KEY_STORE);
    return stored ? bytesFromBase64Url(stored) : null;
  } catch {
    return null;
  }
}

/** Validate + store a pairing code (QR scan or manual paste). False = not a code. */
export async function storePairingCode(code: string): Promise<boolean> {
  const key = parsePairingCode(code);
  if (!key) return false;
  await SecureStore.setItemAsync(VAULT_KEY_STORE, code.trim().slice(PAIRING_PREFIX.length));
  return true;
}

/** Forget the key and drop the local cache (Settings escape hatch / re-pair). */
export async function unpair(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(VAULT_KEY_STORE);
  } catch {
    // fall through — cache cleanup below still applies
  }
  try {
    await FileSystem.deleteAsync(CACHE_PATH, { idempotent: true });
  } catch {
    // best-effort: a stale cache without a key renders nothing anyway
  }
}

/** Ciphertext cache — best-effort on both ends; any corruption reads as empty and
 * the next pull rebuilds it. */
export async function loadCachedRows(): Promise<SyncCache> {
  try {
    const info = await FileSystem.getInfoAsync(CACHE_PATH);
    if (!info.exists) return {};
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(CACHE_PATH)) as {
      v?: number;
      cache?: SyncCache;
    };
    return parsed.v === 1 && parsed.cache && typeof parsed.cache === "object" ? parsed.cache : {};
  } catch {
    return {};
  }
}

async function persistCachedRows(cache: SyncCache): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(CACHE_PATH, JSON.stringify({ v: 1, cache }));
  } catch {
    // best-effort: worst case the next launch re-pulls everything
  }
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Defensive narrowing from PostgREST/realtime rows — never trust the wire shape. */
function castSyncRow(row: unknown): SyncRow | null {
  if (!isObj(row)) return null;
  const { path_hash, payload, deleted, updated_at } = row;
  if (typeof path_hash !== "string" || path_hash.length !== 64) return null;
  if (payload !== null && typeof payload !== "string") return null;
  if (typeof deleted !== "boolean" || typeof updated_at !== "string") return null;
  return { path_hash, payload, deleted, updated_at };
}

/** Incremental pull: rows newer than the cache's cursor (with a 5s overlap window —
 * mergeRows is idempotent, so re-seeing a row is free), merged + persisted. */
export async function pullLibraryRows(cache: SyncCache): Promise<SyncCache> {
  const cursor = syncCursor(cache);
  let query = supabase
    .from("library_documents")
    .select("path_hash,payload,deleted,updated_at")
    .order("updated_at", { ascending: true })
    .limit(2000);
  if (cursor) {
    query = query.gt("updated_at", new Date(Date.parse(cursor) - 5000).toISOString());
  }
  const { data, error } = await query;
  if (error) throw new Error(`library sync failed: ${error.message}`);
  const rows = (data ?? []).map(castSyncRow).filter((r): r is SyncRow => r !== null);
  const merged = mergeRows(cache, rows);
  await persistCachedRows(merged);
  return merged;
}

export interface DecryptedLibrary {
  docs: (LibraryDoc & { pathHash: string })[];
  /** Rows the key couldn't open — >0 means "re-pair with your Mac" territory. */
  failures: number;
}

/** Decrypt every non-tombstone row. Failures are counted, never thrown — one bad
 * row must not blank the whole library. */
export function decryptLibrary(cache: SyncCache, key: Uint8Array): DecryptedLibrary {
  const docs: (LibraryDoc & { pathHash: string })[] = [];
  let failures = 0;
  for (const entry of Object.values(cache)) {
    if (entry.deleted || entry.payload === null) continue;
    const doc = decryptDoc(key, entry.pathHash, entry.payload);
    if (doc) docs.push({ ...doc, pathHash: entry.pathHash });
    else failures += 1;
  }
  return { docs, failures };
}

export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Live refresh signal: any insert/update on the caller's library rows. The payload
 * itself is ignored — the handler just re-pulls, which the overlap window makes
 * safe. Returns an unsubscribe fn (Realtime channels don't clean up on their own). */
export function subscribeLibrary(userId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel("library-sync")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "library_documents", filter: `user_id=eq.${userId}` },
      onChange,
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "library_documents", filter: `user_id=eq.${userId}` },
      onChange,
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
