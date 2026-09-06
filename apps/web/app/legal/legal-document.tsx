import Link from "next/link";

import type { LegalDocument, LegalSection } from "@nemesis/shared";

// Renders one shared legal document inside the app's legal page shell. The words come from
// packages/shared/src/legal; this file owns only the frame around them.

const EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/;

/** A paragraph with any email address turned into a mailto link. */
function Paragraph({ text }: { text: string }) {
  const match = EMAIL.exec(text);
  if (!match) return <p>{text}</p>;
  const [email] = match;
  const before = text.slice(0, match.index);
  const after = text.slice(match.index + email.length);
  return (
    <p>
      {before}
      <a href={`mailto:${email}`}>{email}</a>
      {after}
    </p>
  );
}

export function LegalSectionView({ section }: { section: LegalSection }) {
  return (
    <section id={section.id}>
      <h2>{section.heading}</h2>
      {section.paragraphs.map((text, i) => (
        <Paragraph key={i} text={text} />
      ))}
      {section.bullets && section.bullets.length > 0 ? (
        <ul>
          {section.bullets.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function LegalPage({
  eyebrow = "Legal",
  doc,
  sections = doc.sections,
  lead = doc.lead,
  links,
}: {
  eyebrow?: string;
  doc: LegalDocument;
  sections?: LegalSection[];
  lead?: string;
  /** The other legal pages, linked from the top bar. */
  links: { href: string; label: string }[];
}) {
  return (
    <main className="legal-page">
      <nav className="legal-nav">
        <Link className="brand" href="/">Nemesis</Link>
        <div>
          {links.map((link) => (
            <Link key={link.href} className="source-link" href={link.href}>
              {link.label}
            </Link>
          ))}
        </div>
      </nav>
      <article className="legal-content">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{doc.title}</h1>
        <p className="muted">Effective {doc.effectiveDate}</p>
        <Paragraph text={lead} />
        {sections.map((section) => (
          <LegalSectionView key={section.id ?? section.heading} section={section} />
        ))}
      </article>
    </main>
  );
}
