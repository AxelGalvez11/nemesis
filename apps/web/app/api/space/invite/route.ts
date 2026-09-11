import { sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/env";
import { json, userClient, verifyBearer, withRouteLog } from "@/lib/server";
import { buildInviteEmail } from "@/lib/space/invite-email";
import { parseInviteRequest } from "@/lib/space/invite-request";

// Shares a Space page with people by email (docs/space/PLAN.md, M5). ws_invite decides who may share and records each
// grant or pending invite, acting as the signed-in person; this route adds the email, which is best effort.

export const runtime = "nodejs";

/** The errors ws_invite raises, by Postgres code, as HTTP statuses. */
const STATUS: Record<string, number> = { "28000": 401, "42501": 403, "22023": 400, "54000": 429 };

/** ws_invite words its errors for logs; the Share menu shows them as sentences. */
function sentence(message: string): string {
  const text = message.trim();
  if (!text) return "Sharing did not work. Try again.";
  return text[0]!.toUpperCase() + text.slice(1) + (/[.!?]$/.test(text) ? "" : ".");
}

async function POSTHandler(req: Request) {
  const user = await verifyBearer(req);
  if (!user) return json({ error: "Sign in to share pages." }, 401);
  const parsed = parseInviteRequest(await req.json().catch(() => null));
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { page, emails, role } = parsed.request;

  const { data, error } = await userClient(req).rpc("ws_invite", { p_page: page, p_emails: emails, p_role: role });
  if (error) {
    const status = STATUS[error.code ?? ""] ?? 500;
    if (status === 500) {
      console.error(JSON.stringify({ event: "space_invite_failed", user_id: user.id, code: error.code, message: error.message }));
      return json({ error: "Sharing did not work. Try again." }, 500);
    }
    return json({ error: sentence(error.message) }, status);
  }

  const result = (data ?? {}) as { notify?: unknown; page?: { title?: string }; inviter?: string | null };
  const notify = Array.isArray(result.notify) ? result.notify.filter((e): e is string => typeof e === "string") : [];
  const message = buildInviteEmail({ inviter: result.inviter ?? null, pageTitle: result.page?.title ?? "", pageUrl: `${appUrl}/p/${page}`, role });
  let emailed = 0;
  for (const to of notify) if (await sendEmail({ to, ...message })) emailed++;
  console.info(JSON.stringify({ event: "space_invite", user_id: user.id, page, invited: notify.length, emailed }));
  return json({ invited: notify.length, emailed });
}

export const POST = withRouteLog(POSTHandler);
