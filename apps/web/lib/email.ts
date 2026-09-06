import { appUrl, emailFrom, resendApiKey } from "@/lib/env";

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Transactional email via the Resend REST API. Best-effort by design: returns false (and logs)
 * instead of throwing, because no email is ever worth failing a webhook or a request over.
 */
export async function sendEmail({ to, subject, html, text }: SendEmailInput): Promise<boolean> {
  if (!resendApiKey) {
    console.error("email_skipped_no_resend_key", { subject });
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: emailFrom, to: [to], subject, html, text }),
    });
    if (!res.ok) {
      console.error("email_send_failed", { status: res.status, detail: (await res.text()).slice(0, 300) });
      return false;
    }
    return true;
  } catch (error) {
    console.error("email_send_failed", { message: error instanceof Error ? error.message : undefined });
    return false;
  }
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export interface WelcomeEmailInput {
  planName: string;
  trialing: boolean;
  trialDays: number;
}

/** Welcome/confirmation email sent when a checkout completes (trial start or direct purchase). */
export function buildWelcomeEmail({ planName, trialing, trialDays }: WelcomeEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const safePlan = escapeHtml(planName);
  const accountUrl = `${appUrl}/settings`;
  const subject = trialing ? `Your ${planName} trial is live` : `Your ${planName} subscription is active`;
  const trialLineText = trialing
    ? `Your card will not be charged until the ${trialDays}-day trial ends. Cancel anytime before then and you pay nothing.`
    : "";

  const text = [
    `Nemesis is yours.`,
    ``,
    trialing
      ? `Your ${planName} plan is live, and your ${trialDays}-day free trial has started.`
      : `Your ${planName} plan is active.`,
    trialLineText,
    `Open Nemesis in your browser: ${appUrl}`,
    `Sign in with this account and your plan is live inside Nemesis.`,
    `Manage, switch, or cancel your plan anytime: ${accountUrl}`,
    ``,
    `Questions? Just reply to this email.`,
    `— Nemesis`,
  ].filter(Boolean).join("\n");

  const html = `
  <div style="margin:0 auto;max-width:520px;padding:32px 24px;font-family:Arial,Helvetica,sans-serif;color:#16181d;">
    <p style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#8a2430;margin:0 0 16px;">Nemesis</p>
    <h1 style="font-size:22px;line-height:1.3;margin:0 0 16px;">Nemesis is yours.</h1>
    <p style="font-size:15px;line-height:1.6;margin:0 0 12px;">
      ${trialing
        ? `Your <strong>${safePlan}</strong> plan is live, and your ${trialDays}-day free trial has started.`
        : `Your <strong>${safePlan}</strong> plan is active.`}
    </p>
    ${trialing
      ? `<p style="font-size:15px;line-height:1.6;margin:0 0 12px;">Your card will not be charged until the ${trialDays}-day trial ends. Cancel anytime before then and you pay nothing.</p>`
      : ""}
    <p style="font-size:15px;line-height:1.6;margin:0 0 12px;">
      <a href="${appUrl}" style="color:#8a2430;font-weight:bold;">Open Nemesis</a>
      in your browser, sign in with this account, and your plan is live inside Nemesis.
    </p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px;">
      Manage, switch, or cancel your plan anytime from your
      <a href="${accountUrl}" style="color:#8a2430;">account page</a>.
    </p>
    <p style="font-size:14px;line-height:1.6;color:#5c616b;margin:0;">Questions? Just reply to this email.</p>
  </div>`;

  return { subject, html, text };
}

export interface PaymentFailedEmailInput {
  planName: string;
  /** Where the card can be updated. The webhook passes `${appUrl}/settings`. */
  portalUrl: string;
}

/** Sent on Stripe's `invoice.payment_failed`. Nothing changes today; the card needs updating. */
export function buildPaymentFailedEmail({ planName, portalUrl }: PaymentFailedEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const safePlan = escapeHtml(planName);
  const safeUrl = escapeHtml(portalUrl);
  const subject = "Your Nemesis payment did not go through";

  const text = [
    `Your card was declined.`,
    ``,
    `We tried to charge your card for your ${planName} plan and it did not go through.`,
    `Nothing changes today. Your plan stays on and everything keeps working.`,
    `Please update your card here: ${portalUrl}`,
    `If the charge keeps failing, access to your plan will pause until a payment goes through.`,
    ``,
    `Questions? Just reply to this email.`,
    `Nemesis`,
  ].join("\n");

  const html = `
  <div style="margin:0 auto;max-width:520px;padding:32px 24px;font-family:Arial,Helvetica,sans-serif;color:#16181d;">
    <p style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#8a2430;margin:0 0 16px;">Nemesis</p>
    <h1 style="font-size:22px;line-height:1.3;margin:0 0 16px;">Your card was declined.</h1>
    <p style="font-size:15px;line-height:1.6;margin:0 0 12px;">
      We tried to charge your card for your <strong>${safePlan}</strong> plan and it did not go through.
    </p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 12px;">
      Nothing changes today. Your plan stays on and everything keeps working.
    </p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 12px;">
      <a href="${safeUrl}" style="color:#8a2430;font-weight:bold;">Update your card</a>
      so the next attempt succeeds.
    </p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px;">
      If the charge keeps failing, access to your plan will pause until a payment goes through.
    </p>
    <p style="font-size:14px;line-height:1.6;color:#5c616b;margin:0;">Questions? Just reply to this email.</p>
  </div>`;

  return { subject, html, text };
}

export interface CancellationEmailInput {
  planName: string;
  /** ISO date string, or null when the end date is not known. */
  accessUntil: string | null;
}

function friendlyDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

/** Sent on Stripe's `customer.subscription.deleted`. The plan has ended; the account stays. */
export function buildCancellationEmail({ planName, accessUntil }: CancellationEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const safePlan = escapeHtml(planName);
  const until = friendlyDate(accessUntil);
  const pricingUrl = `${appUrl}/pricing`;
  const subject = "Your Nemesis subscription has ended";
  const accessLine = until
    ? `You keep access until ${until}. After that your account moves to the free plan.`
    : `Your account is now on the free plan.`;

  const text = [
    `Your ${planName} subscription has ended.`,
    ``,
    accessLine,
    `Your notes, documents and study material stay in your account.`,
    `You can come back to a paid plan any time: ${pricingUrl}`,
    ``,
    `Questions? Just reply to this email.`,
    `Nemesis`,
  ].join("\n");

  const html = `
  <div style="margin:0 auto;max-width:520px;padding:32px 24px;font-family:Arial,Helvetica,sans-serif;color:#16181d;">
    <p style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#8a2430;margin:0 0 16px;">Nemesis</p>
    <h1 style="font-size:22px;line-height:1.3;margin:0 0 16px;">Your ${safePlan} subscription has ended.</h1>
    <p style="font-size:15px;line-height:1.6;margin:0 0 12px;">${escapeHtml(accessLine)}</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 12px;">
      Your notes, documents and study material stay in your account.
    </p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px;">
      You can <a href="${pricingUrl}" style="color:#8a2430;font-weight:bold;">come back to a paid plan</a> any time.
    </p>
    <p style="font-size:14px;line-height:1.6;color:#5c616b;margin:0;">Questions? Just reply to this email.</p>
  </div>`;

  return { subject, html, text };
}
