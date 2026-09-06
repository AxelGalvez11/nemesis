import { adminClient, json, verifyBearer, withRouteLog } from "@/lib/server";
import { stripe, stripeFailureDetail } from "@/lib/stripe";
import { stripeSecretKey } from "@/lib/env";

// POST /api/account/delete: the learner deletes their own account.
//
// 🔴 THE OLD PATH DELETED THE LOGIN AND NOTHING ELSE. `supabase/functions/account-delete` did one
// admin DELETE on auth.users and let the foreign keys cascade. Two things do not cascade from a
// Postgres row: the Stripe subscription (they kept being charged) and the objects in Storage
// (their PDFs stayed on disk). This route does those first, then the same admin delete.
//
// Order matters: cancel billing and remove files BEFORE the user row goes, because the
// `subscriptions` row that holds the Stripe customer id cascades away with it.
//
// Every step short of the final delete is best-effort and logged: a Stripe outage must not leave a
// learner unable to leave, but it must be visible in the logs that a subscription was left behind.

const USER_OWNED_BUCKETS = ["library-sources", "library-images", "study-images", "recordings"];

async function POSTHandler(req: Request) {
  const user = await verifyBearer(req);
  if (!user) return json({ error: "authentication required" }, 401);

  let body: { confirm?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  if (body.confirm !== true) return json({ error: "confirmation required" }, 400);

  const admin = adminClient();
  const left: string[] = [];

  // 1. Stripe: cancel every subscription on the customer, now, not at period end. A deleted
  //    account cannot use the rest of the period, and a "cancel at period end" would leave a
  //    renewal race if the webhook ever fired after the user row was gone.
  try {
    const { data: sub } = await admin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();
    const customerId = sub?.stripe_customer_id as string | null | undefined;
    if (customerId && stripeSecretKey) {
      const client = stripe();
      const list = await client.subscriptions.list({ customer: customerId, status: "all", limit: 20 });
      for (const item of list.data) {
        if (item.status === "canceled" || item.status === "incomplete_expired") continue;
        await client.subscriptions.cancel(item.id, { prorate: false });
      }
      // The customer record itself carries the email; deleting it is what "delete my data" means
      // to a student, and Stripe keeps the invoices it is legally required to keep regardless.
      await client.customers.del(customerId);
    }
  } catch (error) {
    left.push("stripe");
    console.error("account_delete_stripe_failed", { user_id: user.id, ...stripeFailureDetail(error) });
  }

  // 2. Storage: every user-owned bucket keys objects under `<user id>/…`.
  for (const bucket of USER_OWNED_BUCKETS) {
    try {
      let offset = 0;
      for (;;) {
        const { data: objects, error } = await admin.storage.from(bucket).list(user.id, { limit: 1000, offset });
        if (error) throw error;
        if (!objects || objects.length === 0) break;
        const paths = objects.map((o) => `${user.id}/${o.name}`);
        const { error: removeError } = await admin.storage.from(bucket).remove(paths);
        if (removeError) throw removeError;
        if (objects.length < 1000) break;
        offset += objects.length;
      }
    } catch (error) {
      left.push(`storage:${bucket}`);
      console.error("account_delete_storage_failed", { user_id: user.id, bucket, message: error instanceof Error ? error.message : String(error) });
    }
  }

  // 3. The login. Everything user-owned in Postgres cascades from here.
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error("account_delete_failed", { user_id: user.id, message: deleteError.message, left });
    return json({ error: "account deletion failed" }, 502);
  }

  console.info("account_deleted", { user_id: user.id, left });
  return json({ deleted: true, left });
}

export const POST = withRouteLog(POSTHandler);
