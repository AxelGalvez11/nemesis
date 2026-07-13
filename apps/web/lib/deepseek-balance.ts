// The LLM provider account is prepaid: an empty balance is a FULL engine outage
// (every answer fails with "Insufficient Balance"). This evaluator is deliberately
// fail-loud — anything it cannot positively read as healthy raises an alert.

export type BalanceStatus = "healthy" | "below_threshold" | "unavailable" | "unreadable";

export interface BalanceCheck {
  status: BalanceStatus;
  alert: boolean;
  totalUsd: number | null;
}

interface BalanceInfoLike {
  currency?: unknown;
  total_balance?: unknown;
}

/** Parse the provider's GET /user/balance payload and decide whether to raise the alarm. */
export function evaluateProviderBalance(payload: unknown, thresholdUsd: number): BalanceCheck {
  if (!payload || typeof payload !== "object") return { status: "unreadable", alert: true, totalUsd: null };

  const record = payload as { is_available?: unknown; balance_infos?: unknown };
  const infos: BalanceInfoLike[] = Array.isArray(record.balance_infos) ? record.balance_infos : [];
  const usdInfo = infos.find((info) => typeof info?.currency === "string" && info.currency.toUpperCase() === "USD")
    ?? infos[0];
  const totalRaw = usdInfo?.total_balance;
  const totalUsd = typeof totalRaw === "string" || typeof totalRaw === "number" ? Number(totalRaw) : NaN;

  if (record.is_available === false) {
    return { status: "unavailable", alert: true, totalUsd: Number.isFinite(totalUsd) ? totalUsd : null };
  }
  if (!Number.isFinite(totalUsd)) return { status: "unreadable", alert: true, totalUsd: null };
  if (totalUsd < thresholdUsd) return { status: "below_threshold", alert: true, totalUsd };
  return { status: "healthy", alert: false, totalUsd };
}

/** Alert email content for a non-healthy check. Returns null when no alert is needed. */
export function buildBalanceAlertEmail(check: BalanceCheck, thresholdUsd: number): { subject: string; text: string } | null {
  if (!check.alert) return null;
  const balanceLine = check.totalUsd != null ? `Balance right now: $${check.totalUsd.toFixed(2)}.` : "";
  if (check.status === "unavailable") {
    return {
      subject: "Nemesis ALERT: AI balance exhausted — answers are DOWN",
      text: [
        "The AI provider account reports it is out of usable balance, which means Nemesis answers are failing right now.",
        balanceLine,
        "Top up immediately: https://platform.deepseek.com",
        "This check runs daily and will email again until the balance is healthy.",
      ].filter(Boolean).join("\n\n"),
    };
  }
  if (check.status === "below_threshold") {
    return {
      subject: `Nemesis alert: AI balance low ($${check.totalUsd?.toFixed(2)} left)`,
      text: [
        `The AI provider balance is below your $${thresholdUsd} alert line. When it hits zero, every Nemesis answer fails.`,
        balanceLine,
        "Top up soon: https://platform.deepseek.com",
        "This check runs daily and will email again until the balance is back above the line.",
      ].filter(Boolean).join("\n\n"),
    };
  }
  return {
    subject: "Nemesis alert: could not read the AI balance",
    text: [
      "The daily balance check could not read the AI provider account (API error or unexpected response). The engine may be fine, but please check manually.",
      "Check here: https://platform.deepseek.com",
    ].join("\n\n"),
  };
}
