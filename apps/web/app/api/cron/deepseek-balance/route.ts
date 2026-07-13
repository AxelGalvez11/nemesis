import { buildBalanceAlertEmail, evaluateProviderBalance } from "@/lib/deepseek-balance";
import { sendEmail } from "@/lib/email";
import { balanceAlertEmail, cronSecret, deepseekApiKey, deepseekBalanceAlertUsd } from "@/lib/env";
import { json } from "@/lib/server";

export const runtime = "nodejs";

/**
 * Daily prepaid-balance alarm (Vercel cron, see vercel.json). The provider account is prepaid,
 * so an empty balance is a full engine outage — this emails the owner before that happens and
 * keeps emailing daily until the balance is healthy again.
 */
export async function GET(req: Request) {
  if (!cronSecret) return json({ error: "CRON_SECRET missing" }, 500);
  if (req.headers.get("authorization") !== `Bearer ${cronSecret}`) return json({ error: "unauthorized" }, 401);
  if (!deepseekApiKey) return json({ error: "DEEPSEEK_API_KEY missing" }, 500);

  let payload: unknown = null;
  try {
    const res = await fetch("https://api.deepseek.com/user/balance", {
      headers: { Authorization: `Bearer ${deepseekApiKey}` },
      cache: "no-store",
    });
    if (res.ok) payload = await res.json();
    else console.error("balance_check_http_error", { status: res.status });
  } catch (error) {
    console.error("balance_check_unreachable", { message: error instanceof Error ? error.message : undefined });
  }

  const check = evaluateProviderBalance(payload, deepseekBalanceAlertUsd);
  const alertContent = buildBalanceAlertEmail(check, deepseekBalanceAlertUsd);
  let emailed = false;
  if (alertContent) {
    emailed = await sendEmail({
      to: balanceAlertEmail,
      subject: alertContent.subject,
      text: alertContent.text,
      html: `<pre style="font-family:Arial,Helvetica,sans-serif;white-space:pre-wrap;font-size:15px;">${alertContent.text}</pre>`,
    });
  }

  console.log("balance_check", { status: check.status, total_usd: check.totalUsd, emailed });
  return json({ status: check.status, totalUsd: check.totalUsd, thresholdUsd: deepseekBalanceAlertUsd, emailed });
}
