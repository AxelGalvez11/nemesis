import { NextRequest, NextResponse } from "next/server";

import {
  supabaseAnonKey,
  supabaseUrl,
} from "@/lib/env";
import { verifyBearer } from "@/lib/server";

export const runtime = "nodejs";

const ACTIONS = new Set(["context", "organize", "apply", "reject", "undo"]);

/**
 * Stable authenticated proxy shared by web and installed iOS builds.
 *
 * The Edge function verifies the same user JWT again and performs all content
 * reads through a JWT-scoped Supabase client, so this route is not a second
 * authorization implementation. It exists to keep the phone pointed at the
 * stable app origin while the backend can move independently via OTA.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ action: string }> },
) {
  const { action } = await context.params;
  if (!ACTIONS.has(action)) {
    return NextResponse.json({ error: "unknown action" }, { status: 404 });
  }
  if (!await verifyBearer(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!supabaseUrl) {
    return NextResponse.json(
      { error: "second brain unavailable" },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/library-brain/${action}`,
      {
        body: await request.text(),
        cache: "no-store",
        headers: {
          apikey: supabaseAnonKey,
          Authorization: request.headers.get("authorization") ?? "",
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );
    return new Response(await response.text(), {
      headers: { "Content-Type": "application/json" },
      status: response.status,
    });
  } catch (error) {
    console.error("library-brain forward failed", action, (error as Error).message);
    return NextResponse.json(
      { error: "second brain unavailable" },
      { status: 503 },
    );
  }
}

