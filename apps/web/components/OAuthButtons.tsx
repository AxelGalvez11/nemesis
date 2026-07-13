"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { enabledOAuthProviders, isPreviewMode, type OAuthProviderId } from "@/lib/env";

interface OAuthButtonsProps {
  /** Disable the buttons while the surrounding form is busy. */
  disabled?: boolean;
  /** Return an error message to block the redirect (e.g. the signup consent box is unchecked). */
  gate?: () => string | null;
  onError: (message: string) => void;
  /** Sign-in renders a terms line because OAuth can create an account without the signup checkbox. */
  showTermsNote?: boolean;
  /** Post-auth destination, defaults to /account. */
  next?: string;
}

const PROVIDER_LABELS: Record<OAuthProviderId, string> = {
  google: "Continue with Google",
  apple: "Continue with Apple",
};

const PROVIDER_ICONS: Record<OAuthProviderId, React.ReactNode> = {
  google: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.49 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.44a5.52 5.52 0 0 1-2.39 3.62v3h3.86c2.26-2.09 3.58-5.17 3.58-8.81Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.86-3c-1.07.72-2.44 1.15-4.08 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56V6.63H1.29a12 12 0 0 0 0 10.74l3.98-3.09Z" />
      <path fill="#EA4335" d="M12 4.76c1.76 0 3.34.6 4.59 1.8l3.42-3.42A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.29 6.63l3.98 3.09C6.22 6.87 8.87 4.76 12 4.76Z" />
    </svg>
  ),
  apple: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M16.62 12.77c.03 3.2 2.8 4.26 2.83 4.28-.02.08-.44 1.52-1.46 3-.88 1.28-1.79 2.55-3.23 2.58-1.41.03-1.87-.84-3.48-.84-1.62 0-2.12.81-3.46.87-1.39.05-2.44-1.38-3.33-2.65-1.81-2.62-3.2-7.4-1.34-10.62A5.17 5.17 0 0 1 7.5 6.73c1.36-.03 2.65.92 3.48.92.83 0 2.4-1.13 4.04-.97.69.03 2.62.28 3.86 2.1-.1.07-2.3 1.35-2.26 3.99ZM13.96 4.94c.74-.9 1.24-2.14 1.1-3.38-1.06.04-2.35.71-3.11 1.6-.68.79-1.28 2.06-1.12 3.27 1.19.1 2.4-.6 3.13-1.49Z" />
    </svg>
  ),
};

/**
 * Social sign-in buttons. Renders nothing unless NEXT_PUBLIC_AUTH_PROVIDERS lists a provider,
 * so the UI can never offer a provider before it is enabled in the Supabase dashboard.
 */
export function OAuthButtons({ disabled, gate, onError, showTermsNote, next }: OAuthButtonsProps) {
  const { signInWithOAuth } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState<OAuthProviderId | null>(null);

  if (enabledOAuthProviders.length === 0) return null;

  async function start(provider: OAuthProviderId) {
    const blocked = gate?.() ?? null;
    if (blocked) {
      onError(blocked);
      return;
    }
    setPending(provider);
    try {
      const err = await signInWithOAuth(provider, next);
      if (err) {
        onError(err);
        setPending(null);
        return;
      }
      // Real OAuth navigates the whole tab to the provider; only preview mode stays on-page.
      if (isPreviewMode) router.replace(next ?? "/account");
    } catch {
      onError("Nemesis could not reach the identity service. Check your connection and try again.");
      setPending(null);
    }
  }

  return (
    <div className="nemesis-auth-oauth">
      {enabledOAuthProviders.map((provider) => (
        <button
          key={provider}
          type="button"
          className="nemesis-auth-oauth-btn"
          disabled={disabled || pending !== null}
          onClick={() => void start(provider)}
        >
          {PROVIDER_ICONS[provider]}
          <span>{pending === provider ? "Opening…" : PROVIDER_LABELS[provider]}</span>
        </button>
      ))}
      {showTermsNote ? (
        <p className="nemesis-auth-oauth-note">
          By continuing, you agree to the <Link className="nemesis-auth-link" href="/legal/terms">Terms</Link> and{" "}
          <Link className="nemesis-auth-link" href="/legal/privacy">Privacy Policy</Link>.
        </p>
      ) : null}
      <div className="nemesis-auth-divider" aria-hidden="true"><span>or with email</span></div>
    </div>
  );
}
