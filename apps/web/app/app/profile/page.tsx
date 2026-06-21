import { redirect } from "next/navigation";

// Profile is now the "Account" section of the consolidated Settings surface — keep the old URL working.
export default function ProfilePage() {
  redirect("/app/settings?section=account");
}
