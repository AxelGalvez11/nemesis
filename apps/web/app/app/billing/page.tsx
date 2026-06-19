import { redirect } from "next/navigation";

// Billing is now the "Billing" section of the consolidated Settings surface — keep the old URL working.
export default function BillingPage() {
  redirect("/app/settings?section=billing");
}
