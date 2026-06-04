import { readFileSync, rmSync } from "fs";
import path from "path";

// Delete the seeded test user (admin API) and ALWAYS remove the local seed file so a
// plaintext test password never lingers in the working tree. Teardown failure is
// logged loudly (console.error) rather than silently swallowed.
async function globalTeardown(): Promise<void> {
  const SB_URL = process.env.SB_URL;
  const SERVICE_KEY = process.env.SERVICE_KEY;
  const seedPath = path.resolve(__dirname, ".auth", "seed.json");
  try {
    const seed = JSON.parse(readFileSync(seedPath, "utf8")) as {
      userId?: string;
      email?: string;
    };
    if (SB_URL && SERVICE_KEY && seed.userId) {
      const res = await fetch(`${SB_URL}/auth/v1/admin/users/${seed.userId}`, {
        method: "DELETE",
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      });
      if (res.ok) console.log(`[6b-1 teardown] deleted ${seed.email}`);
      else console.error(`[6b-1 teardown] FAILED to delete ${seed.email}: HTTP ${res.status}`);
    }
  } catch (e) {
    console.error(`[6b-1 teardown] error: ${(e as Error).message}`);
  } finally {
    // Never leave the plaintext test credentials on disk, even if teardown failed.
    try {
      rmSync(seedPath, { force: true });
    } catch {
      /* nothing to remove */
    }
  }
}

export default globalTeardown;
