import type { ReactNode } from "react";
import type { LegalDocument, LegalSection } from "@/lib/legal-content";
import { LegalShell } from "./LegalShell";

// Renders one legal document from lib/legal-content.ts (generated from packages/shared/src/legal)
// inside the landing site's legal shell. The words live in the shared source; this owns the frame.

const EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/;

function withMailto(text: string): ReactNode {
  const match = EMAIL.exec(text);
  if (!match) return text;
  const [email] = match;
  return (
    <>
      {text.slice(0, match.index)}
      <a href={`mailto:${email}`}>{email}</a>
      {text.slice(match.index + email.length)}
    </>
  );
}

function Section({ section }: { section: LegalSection }) {
  return (
    <>
      <h2 id={section.id}>{section.heading}</h2>
      {section.paragraphs.map((text, i) => (
        <p key={i}>{withMailto(text)}</p>
      ))}
      {section.bullets && section.bullets.length > 0 ? (
        <ul>
          {section.bullets.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

export function LegalDocumentPage({ doc, kicker }: { doc: LegalDocument; kicker: string }) {
  return (
    <LegalShell>
      <div className="legal-kicker">
        Legal<span className="dot"> · </span>{kicker}
      </div>
      <h1>{doc.title}</h1>
      <p className="legal-updated">Effective {doc.effectiveDate}</p>
      <p className="legal-lead">{withMailto(doc.lead)}</p>
      {doc.sections.map((section) => (
        <Section key={section.id ?? section.heading} section={section} />
      ))}
    </LegalShell>
  );
}
