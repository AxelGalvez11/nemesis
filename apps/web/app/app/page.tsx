import { redirect } from "next/navigation";

// The browser is now an account control plane for the desktop-first Nemesis product. Keep legacy
// research URLs available by direct path, but retire /app as an implicit entry to the old workspace.
export default function AppHome() {
  redirect("/account");
}
