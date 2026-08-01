import { redirect } from "next/navigation";

/**
 * Retired 2026-08-01 (owner: "i want this page gone").
 *
 * This was a second subscription surface, separate from /pricing and from the
 * in-app Settings -> Billing panel, and Stripe sent everyone here after checkout.
 * Nothing is lost by removing it: /pricing already renders the checkout success
 * and cancelled banners, and for someone who already subscribes the checkout API
 * returns a Stripe billing-portal URL instead of a new session, so "manage my
 * subscription" still works from there.
 *
 * A REDIRECT RATHER THAN A DELETE, deliberately. Stripe stores success_url and
 * cancel_url on sessions that are already open, the billing portal has its own
 * stored return_url, and the desktop app ships a hardcoded link to this path that
 * cannot be updated retroactively. All of those keep arriving here for a while,
 * and a 404 at the end of a payment is the worst possible place for one.
 *
 * THE QUERY STRING MUST SURVIVE. `?checkout=success` is what makes /pricing show
 * the confirmation; drop it in the hop and a student who just paid gets a silent
 * plan page and no idea whether the payment worked.
 */
export default async function AccountBillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const forwarded = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") forwarded.set(key, value);
    else if (Array.isArray(value) && value[0] !== undefined) forwarded.set(key, value[0]);
  }
  const query = forwarded.toString();
  redirect(query ? `/pricing?${query}` : "/pricing");
}
