"use client";

import {
  brainContextFrom,
  type BrainContext,
} from "@nemesis/shared";

import { supabase } from "@/lib/supabase";

const TIMEOUT_MS = 7_000;

async function token(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function postBrain(
  action: "apply" | "context" | "organize" | "reject" | "undo",
  body: Record<string, unknown>,
): Promise<unknown | null> {
  const accessToken = await token();
  if (!accessToken) return null;
  const controller = new AbortController();
  const timer = window.setTimeout(
    () => controller.abort(),
    action === "organize" ? 40_000 : TIMEOUT_MS,
  );
  try {
    const response = await fetch(`/api/v1/brain/${action}`, {
      body: JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${accessToken}`,
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
    window.clearTimeout(timer);
  }
}

export async function recallBrain(
  query: string,
): Promise<BrainContext | null> {
  const payload = await postBrain("context", {
    query,
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
