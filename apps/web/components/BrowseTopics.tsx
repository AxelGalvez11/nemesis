"use client";

import { groupBrowseTopics, type BrowseTopic } from "@nemesis/shared";

// "Browse popular topics" for Monitoring: the tappable starting points that complement the search box.
// One tap on a chip starts a watch (the parent wires onPick → createWatch). The catalog + grouping are
// the PURE shared module (browse-topics.ts); this is presentation only. `busy` disables every chip
// while a watch is being created so a double-tap can't burn two of the plan's watch slots.
export function BrowseTopics({ onPick, busy }: { onPick: (t: BrowseTopic) => void; busy?: boolean }) {
  const groups = groupBrowseTopics();
  return (
    <div className="browse-topics">
      <div className="browse-topics-head">Or browse popular topics</div>
      {groups.map((g) => (
        <div key={g.category} className="browse-group">
          <div className="browse-group-label">{g.label}</div>
          <div className="browse-chips">
            {g.topics.map((t) => (
              <button
                key={t.label}
                type="button"
                className="browse-chip"
                disabled={busy}
                onClick={() => onPick(t)}
                aria-label={`Monitor ${t.label}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
