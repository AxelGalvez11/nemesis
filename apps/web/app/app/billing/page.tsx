import { redirect } from "next/navigation";

// Stable billing handoff used by desktop clients and old bookmarks. A path route survives the sign-in
// `next` round-trip more reliably than a query-string-selected settings tab.
export default function BillingPage() {
  redirect("/account/billing");
}
