import { mkdirSync, writeFileSync } from "fs";
import path from "path";

// Seeds a CONFIRMED test user (email_confirm:true) via the admin API and resolves a
// real entity id to deep-link — exactly the pattern in scripts/phase6a-validate.ts.
// We never drive signup through the UI (it would hang on email confirmation);
// Playwright drives the real sign-IN against this seeded user. Service key stays
// here (Node), never in the app bundle.
async function globalSetup(): Promise<void> {
  const SB_URL = process.env.SB_URL;
  const SERVICE_KEY = process.env.SERVICE_KEY;
  const ANON_KEY = process.env.ANON_KEY;
  if (!SB_URL || !SERVICE_KEY || !ANON_KEY) {
    throw new Error(
      "SB_URL + SERVICE_KEY + ANON_KEY required (source supabase/functions/.env before the gate)",
    );
  }
  const svc = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };

  const email = `phase6b1+${Date.now().toString(36)}@pharmabro.test`;
  const password = `Pb!${Math.random().toString(36).slice(2)}Aa1`;
  const created = await fetch(`${SB_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: svc,
    body: JSON.stringify({ email, password, email_confirm: true }),
  }).then((r) => r.json());
  const userId = created?.id ?? created?.user?.id;
  if (!userId) {
    throw new Error(`failed to seed user: ${JSON.stringify(created).slice(0, 200)}`);
  }

  // Resolve a real entity id to deep-link (search isn't built in 6b-1).
  const rows = await fetch(
    `${SB_URL}/rest/v1/drug_entities?normalized_name=eq.semaglutide&select=id&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  ).then((r) => r.json());
  const drugId = Array.isArray(rows) ? rows[0]?.id : undefined;
  if (!drugId) throw new Error("could not resolve the semaglutide entity id");

  const dir = path.resolve(__dirname, ".auth");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "seed.json"),
    JSON.stringify({ userId, email, password, drugId }, null, 2),
  );
  console.log(`[6b-1 setup] seeded ${email}; semaglutide id ${drugId}`);
}

export default globalSetup;
