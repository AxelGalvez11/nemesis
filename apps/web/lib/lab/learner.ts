/**
 * The Lab's throwaway learner — Nemesis Lab §16, and the reason the Lab is safe to use at all.
 *
 * 🔴🔴 THE LAB RUNS AGAINST THE HOSTED SUPABASE PROJECT, AND THAT IS FORCED RATHER THAN CHOSEN.
 * Real cognition needs the model door, and the model door is `supabase/functions/nemesis-llm`, which
 * resolves the caller with `admin.auth.getUser(jwt)` against ITS OWN project. A JWT minted by a
 * local Supabase stack cannot be verified there, so "local database, production model" is not a
 * trade-off — it is impossible. Isolation therefore has to come from IDENTITY, not from hostname.
 *
 * 🔴 SO IT IS ONE DEDICATED ACCOUNT THAT OWNS NOTHING ELSE, EVER. Every row the Tutor Lab writes —
 * canvases, knowledge objects, learning objectives, evidence, term lookups, library sources, parsed
 * documents — belongs to `nemesis-lab@nemesis.test`. Nothing the owner does as themselves is
 * touched, and nothing the Lab does appears in their Library, their histories or their evidence.
 *
 * 🔴 AND THAT IS WHY RESET IS SAFE HERE WHERE IT IS NOT SAFE ELSEWHERE. `acceptance-cleanup.ts`
 * exists because a run that deletes by "rows newer than my start time" once nearly deleted the
 * owner's own recording — recency is not authorship. This module needs none of that machinery,
 * because it deletes by USER ID and that user is, by construction, the Lab. Identity is the
 * strongest possible provenance; the timestamp question never comes up.
 *
 * SERVER ONLY. It holds the service key. Never import this from a client component.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** The one Lab identity. A `@nemesis.test` address, as every acceptance script here uses. */
export const LAB_LEARNER_EMAIL = "nemesis-lab@nemesis.test";

/**
 * Where the Lab remembers its learner between page loads.
 *
 * 🔴 A FILE RATHER THAN A RANDOM ACCOUNT PER VISIT, BECAUSE LEARNER STATE IS THE POINT. A new
 * learner on every reload would mean every session started from "knows nothing", and §11 —
 * partially known, established, holds a misconception — would be unreachable. Gitignored; it holds
 * a password for a throwaway account on a developer's own machine.
 */
// 🔴 FROM `process.cwd()`, NOT FROM `import.meta.url`. Turbopack treats `new URL(…, import.meta.url)`
// as a MODULE reference and fails the build with "Module not found" for a path that is data, not
// code. The dev server's working directory is `apps/web`, which is the only place the Lab runs.
const CREDENTIAL_FILE = join(process.cwd(), ".lab", "learner.json");

/** Every table the Lab learner can own a row in. Reset empties all of them for that user id. */
export const LAB_OWNED_TABLES = [
  "learner_evidence",
  "learner_lookups",
  "learning_objectives",
  "knowledge_objects",
  "learning_canvases",
  "library_sources",
] as const;

export interface LabLearner {
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
}

interface StoredCredentials {
  email: string;
  password: string;
  userId: string;
}

function serviceHeaders(service: string): Record<string, string> {
  return { Authorization: `Bearer ${service}`, "Content-Type": "application/json", apikey: service };
}

function readStored(): StoredCredentials | null {
  try {
    const parsed = JSON.parse(readFileSync(CREDENTIAL_FILE, "utf8")) as Partial<StoredCredentials>;
    if (typeof parsed.email === "string" && typeof parsed.password === "string" && typeof parsed.userId === "string") {
      return parsed as StoredCredentials;
    }
    return null;
  } catch {
    return null;
  }
}

function writeStored(credentials: StoredCredentials): void {
  mkdirSync(dirname(CREDENTIAL_FILE), { recursive: true });
  writeFileSync(CREDENTIAL_FILE, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
}

/** What the Lab needs from the environment, and the exact sentence to show when it is missing. */
export function labEnvironment():
  | { ok: true; url: string; anon: string; service: string }
  | { ok: false; missing: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "").trim();
  if (!url || !anon) return { missing: "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY", ok: false };
  if (!service) return { missing: "SUPABASE_SERVICE_ROLE_KEY", ok: false };
  return { anon, ok: true, service, url };
}

async function signIn(url: string, anon: string, email: string, password: string): Promise<{ access_token: string; refresh_token: string } | null> {
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    body: JSON.stringify({ email, password }),
    headers: { "Content-Type": "application/json", apikey: anon },
    method: "POST",
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { access_token?: string; refresh_token?: string };
  return body.access_token && body.refresh_token
    ? { access_token: body.access_token, refresh_token: body.refresh_token }
    : null;
}

/**
 * The Lab learner, signed in — created on first use, reused thereafter.
 *
 * 🔴 IT RECOVERS FROM A DELETED ACCOUNT RATHER THAN FAILING. The stored file can outlive the user
 * (someone resets from the Supabase dashboard, someone runs the reset route and the file write
 * fails). A stale file that made the Lab permanently unusable would be a support problem with no
 * error message worth reading; recreating is the obvious right answer and costs one round trip.
 */
export async function ensureLabLearner(): Promise<{ ok: true; learner: LabLearner } | { ok: false; error: string }> {
  const env = labEnvironment();
  if (!env.ok) {
    return {
      error: `Nemesis Lab needs ${env.missing} in apps/web/.env.local to create its own test learner. Copy it from the repo's root .env.`,
      ok: false,
    };
  }

  const stored = readStored();
  if (stored) {
    const session = await signIn(env.url, env.anon, stored.email, stored.password);
    if (session) {
      return {
        learner: {
          accessToken: session.access_token,
          email: stored.email,
          refreshToken: session.refresh_token,
          userId: stored.userId,
        },
        ok: true,
      };
    }
  }

  // Fresh account. A random password because nothing should be able to guess into it, and it is
  // written to disk because the Lab has to be able to come back to the SAME learner tomorrow.
  const password = `Lab-${crypto.randomUUID()}`;
  const created = await fetch(`${env.url}/auth/v1/admin/users`, {
    body: JSON.stringify({ email: LAB_LEARNER_EMAIL, email_confirm: true, password }),
    headers: serviceHeaders(env.service),
    method: "POST",
  });
  const createdBody = (await created.json().catch(() => ({}))) as { id?: string; msg?: string; message?: string };
  let userId = createdBody.id;

  if (!userId) {
    // Already exists from an earlier run whose credential file is gone. Reset its password to one
    // we know rather than leaving the Lab locked out of its own account.
    const existing = await fetch(
      `${env.url}/auth/v1/admin/users?filter=${encodeURIComponent(LAB_LEARNER_EMAIL)}`,
      { headers: serviceHeaders(env.service) },
    );
    const list = (await existing.json().catch(() => ({}))) as { users?: { id: string; email: string }[] };
    const found = list.users?.find((user) => user.email === LAB_LEARNER_EMAIL);
    if (!found) {
      return { error: createdBody.msg ?? createdBody.message ?? "Could not create the Lab's test learner.", ok: false };
    }
    const updated = await fetch(`${env.url}/auth/v1/admin/users/${found.id}`, {
      body: JSON.stringify({ password }),
      headers: serviceHeaders(env.service),
      method: "PUT",
    });
    if (!updated.ok) return { error: "Could not reset the Lab learner's password.", ok: false };
    userId = found.id;
  }

  const session = await signIn(env.url, env.anon, LAB_LEARNER_EMAIL, password);
  if (!session) return { error: "Created the Lab learner but could not sign it in.", ok: false };
  writeStored({ email: LAB_LEARNER_EMAIL, password, userId });
  return {
    learner: {
      accessToken: session.access_token,
      email: LAB_LEARNER_EMAIL,
      refreshToken: session.refresh_token,
      userId,
    },
    ok: true,
  };
}

/**
 * Empty the Lab learner — §16's "reset without touching production data".
 *
 * 🔴 DELETES BY USER ID, WHICH IS THE STRONGEST PROVENANCE THERE IS. No timestamp window, no name
 * matching, no marker convention: this account exists only because the Lab made it, so everything it
 * owns is the Lab's. `keepLearner` is the default because losing the account means losing nothing
 * and recreating it costs a round trip — but keeping it means the owner's next session starts with
 * the same identity rather than a new one.
 */
export async function resetLabLearner(options: { keepLearner?: boolean } = {}): Promise<
  { ok: true; deleted: Record<string, number | "unavailable"> } | { ok: false; error: string }
> {
  const env = labEnvironment();
  if (!env.ok) return { error: `Nemesis Lab needs ${env.missing} to reset.`, ok: false };
  const stored = readStored();
  if (!stored) return { deleted: {}, ok: true };

  const deleted: Record<string, number | "unavailable"> = {};
  for (const table of LAB_OWNED_TABLES) {
    const response = await fetch(`${env.url}/rest/v1/${table}?user_id=eq.${stored.userId}`, {
      headers: { ...serviceHeaders(env.service), Prefer: "return=representation" },
      method: "DELETE",
    });
    if (!response.ok) {
      deleted[table] = "unavailable";
      continue;
    }
    const rows = (await response.json().catch(() => [])) as unknown[];
    deleted[table] = Array.isArray(rows) ? rows.length : 0;
  }

  if (!options.keepLearner) {
    await fetch(`${env.url}/auth/v1/admin/users/${stored.userId}`, {
      headers: serviceHeaders(env.service),
      method: "DELETE",
    });
    rmSync(CREDENTIAL_FILE, { force: true });
  }
  return { deleted, ok: true };
}

/** The Lab learner's id without signing in — for routes that only need to scope a write. */
export function labLearnerId(): string | null {
  return readStored()?.userId ?? null;
}
