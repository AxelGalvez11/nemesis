import { faviconUrl } from "@/lib/favicon";

// Rounded chips naming the domains the engine searched (favicon + hostname), with an overflow count —
// the ChatGPT Activity-panel pattern. While a search runs we show the fixed search surface; once the
// answer lands the chips become the REAL hostnames its citations came from. Shared by the answer's
// Thinking trail, the pinned AgentRunDock, and the right-dock WorkPanel.
export function DomainChips({ domains, max = 6 }: { domains: string[]; max?: number }) {
  if (!domains.length) return null;
  const shown = domains.slice(0, max);
  const extra = domains.length - shown.length;
  return (
    <div className="domain-chips">
      {shown.map((d) => (
        <span className="domain-chip" key={d}>
          <img src={faviconUrl(d)} alt="" width={14} height={14} loading="lazy" />
          {d}
        </span>
      ))}
      {extra > 0 ? <span className="domain-chip domain-chip-more">{extra} more</span> : null}
    </div>
  );
}
