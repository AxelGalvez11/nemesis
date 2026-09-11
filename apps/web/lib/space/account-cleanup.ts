// ── Workspace files when an account is deleted ─────────────────────────────────────────────────────────────────────
//
// ws_account_cleanup names the folders in the private ws-files bucket that belonged only to the person leaving: a
// workspace's (`<space>/`, one folder per page inside) or a page's (`<space>/<page>/`, the files themselves). Storage
// lists one level at a time and removes by full path, so this walks each folder down to its files first, then removes
// them a thousand at a time.

export interface StorageBucket {
  list(path: string, options: { limit: number; offset: number }): PromiseLike<{ data: Array<{ name: string; id?: string | null }> | null; error: unknown }>;
  remove(paths: string[]): PromiseLike<{ error: unknown }>;
}

const PAGE = 1000;

/** Every file under a folder, as full paths. A listed entry without an id is a folder, walked `depth` levels down. */
export async function listFiles(bucket: StorageBucket, folder: string, depth = 2): Promise<string[]> {
  const base = folder.replace(/\/+$/, "");
  const files: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await bucket.list(base, { limit: PAGE, offset });
    if (error) throw error;
    const entries = data ?? [];
    for (const entry of entries) {
      const path = `${base}/${entry.name}`;
      if (entry.id) files.push(path);
      else if (depth > 0) files.push(...(await listFiles(bucket, path, depth - 1)));
    }
    if (entries.length < PAGE) break;
  }
  return files;
}

/** Removes every file under the folders and returns how many went. The first storage error stops it and is thrown. */
export async function removeFolders(bucket: StorageBucket, folders: readonly string[]): Promise<number> {
  let removed = 0;
  for (const folder of folders) {
    const files = await listFiles(bucket, folder);
    for (let i = 0; i < files.length; i += PAGE) {
      const batch = files.slice(i, i + PAGE);
      const { error } = await bucket.remove(batch);
      if (error) throw error;
      removed += batch.length;
    }
  }
  return removed;
}
