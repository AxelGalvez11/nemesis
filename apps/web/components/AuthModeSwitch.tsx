import Link from "next/link";

// Two-tab mode indicator for the auth panel. Sign-in and sign-up share the
// same frame, fields, and OAuth buttons, and their themed titles alone
// ("Re-enter the perimeter" vs "Bring Nemesis online") left people unsure
// which screen they were on (owner report, 2026-07-14). The active tab names
// the mode plainly and the other tab is the one-click way across.
export function AuthModeSwitch({ active }: { active: "sign-in" | "sign-up" }) {
  return (
    <nav aria-label="Sign in or create account" className="nemesis-auth-mode">
      <Link aria-current={active === "sign-in" ? "page" : undefined} className={active === "sign-in" ? "is-active" : undefined} href="/sign-in">
        Sign in
      </Link>
      <Link aria-current={active === "sign-up" ? "page" : undefined} className={active === "sign-up" ? "is-active" : undefined} href="/sign-up">
        Create account
      </Link>
    </nav>
  );
}
