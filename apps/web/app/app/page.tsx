import { redirect } from "next/navigation";

// The app entry is the chat. Every way in lands on /app — the root "/" redirect, sign-in,
// sign-up, and the email-verify link (see app/page.tsx, sign-in, sign-up, AuthProvider) — so send
// users straight to the Ask chat instead of the old "Evidence workspace" dashboard. Usage, plan,
// and watchlist live in the rail nav + /app/billing, so nothing is lost by skipping the dashboard.
export default function AppHome() {
  redirect("/app/ask");
}
