const SOCIAL_LINKS = [
  {
    label: "Instagram",
    href: "https://www.instagram.com/nemesis_agent/",
  },
  {
    label: "TikTok",
    href: "https://www.tiktok.com/@enternemesis",
  },
] as const;

export function SocialLinks() {
  return (
    <nav className="social-links" aria-label="Nemesis social media">
      {SOCIAL_LINKS.map(({ label, href }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${label} — opens in a new tab`}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
