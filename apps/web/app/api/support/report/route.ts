import { escapeHtml, sendEmail } from "@/lib/email";
import { adminClient, json, verifyBearer, withRouteLog } from "@/lib/server";

// One learner report, with the context attached for them. The row is the record of truth;
// the email to support is best effort and never fails the request.

export const runtime = "nodejs";

const SUPPORT_EMAIL = "support@enternemesis.com";
const MESSAGE_LIMIT = 4000;
const FIELD_LIMIT = 1000;

function text(value: unknown, limit: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, limit) : null;
}

async function POSTHandler(req: Request) {
  const user = await verifyBearer(req);
  if (!user) return json({ error: "authentication required" }, 401);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  const message = text(body.message, MESSAGE_LIMIT);
  if (!message) return json({ error: "message_required" }, 400);

  const row = {
    user_id: user.id,
    email: user.email,
    message,
    path: text(body.path, FIELD_LIMIT),
    user_agent: text(body.userAgent, FIELD_LIMIT),
    last_error: text(body.lastError, FIELD_LIMIT * 2),
    canvas_id: text(body.canvasId, 200),
    app_version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
  };

  const { data, error } = await adminClient()
    .from("support_reports")
    .insert(row)
    .select("id")
    .single();
  if (error || !data) {
    console.error(JSON.stringify({ event: "support_report_failed", user_id: user.id, message: error?.message }));
    return json({ error: "report_failed" }, 500);
  }

  const id = data.id as string;
  console.info(JSON.stringify({ event: "support_report", id, user_id: user.id }));

  const lines = [
    `Report ${id}`,
    `From: ${user.email ?? "(no email)"} (${user.id})`,
    `Page: ${row.path ?? "(unknown)"}`,
    `Canvas: ${row.canvas_id ?? "(none)"}`,
    `Version: ${row.app_version ?? "(unknown)"}`,
    `Browser: ${row.user_agent ?? "(unknown)"}`,
    `Last error: ${row.last_error ?? "(none)"}`,
    ``,
    message,
  ];
  const plain = lines.join("\n");
  const html = `<pre style="font-family:ui-monospace,Menlo,monospace;white-space:pre-wrap;">${escapeHtml(plain)}</pre>`;
  // Best effort. sendEmail logs and returns false on its own; nothing to catch here.
  await sendEmail({
    to: SUPPORT_EMAIL,
    subject: `Nemesis report from ${user.email ?? user.id}`,
    html,
    text: plain,
  });

  return json({ id });
}

export const POST = withRouteLog(POSTHandler);
