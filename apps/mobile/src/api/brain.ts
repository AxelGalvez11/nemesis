import {
  brainContextFrom,
  type BrainContext,
} from "@nemesis/shared";

import { supabase } from "./supabase";

const APP_BASE = "https://app.enternemesis.com";
const TIMEOUT_MS = 7_000;

async function postBrain(
  action: "apply" | "context" | "organize" | "reject" | "undo",
  body: Record<string, unknown>,
): Promise<unknown | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    action === "organize" ? 40_000 : TIMEOUT_MS,
  );
  try {
    const response = await fetch(`${APP_BASE}/api/v1/brain/${action}`, {
      body: JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function recallBrain(
  query: string,
): Promise<BrainContext | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const payload = await postBrain("context", {
    query: trimmed,
    today: new Date().toISOString().slice(0, 10),
  });
  return brainContextFrom(payload);
}

export async function brainAction(
  action: "apply" | "organize" | "reject" | "undo",
  body: Record<string, unknown>,
): Promise<boolean> {
  return Boolean(await postBrain(action, body));
}
