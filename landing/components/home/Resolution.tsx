/**
 * FIRST THE MAP. THEN THE TERRITORY.
 *
 * DECLARED ILLUSTRATION. There is no zoomable knowledge-resolution surface in the
 * product, so nothing here is presented as one — this is a drawing of an idea, built
 * from the same lozenge the beads are cut from, and the caption says so.
 *
 * What it draws: one form becoming several, then many, each generation lighter than
 * the one above it. The rows arrive in sequence when the section is scrolled to, so
 * the increase in resolution is something the visitor watches happen rather than a
 * static hierarchy diagram they have to interpret. That is the entire difference
 * between this and an org chart.
 *
 * The cell COUNTS are the content. 1, then 3, then 6, then 12 — each level roughly
 * doubling — is what "progressively increasing resolution" looks like, and it is why
 * the widths are fractions of a grid rather than hand-placed boxes.
 */

const LEVELS = [
  { cells: 1, label: "the shape of the whole thing" },
  { cells: 3, label: "the parts, and how they depend on each other" },
  { cells: 6, label: "the mechanisms inside each part" },
  { cells: 12, label: "the detail, once there is somewhere to put it" },
] as const;

export function Resolution() {
  return (
    <section className="hsec" id="map">
      <div className="wrap">
        <div className="hsec-head" data-reveal="up">
          <p className="hkicker">resolution</p>
          <h2 className="htitle">
            first the map.
            <br />
            then the territory.
          </h2>
          <p className="hlede">
            Knowledge has a shape. Nemesis starts at the highest useful level and adds
            detail once there is a structure to hang it on, because twenty isolated
            facts are far harder to hold than the three ideas that explain them.
          </p>
        </div>

        <div className="res" data-reveal="soft" aria-hidden="true">
          {LEVELS.map((level) => (
            <div key={level.cells}>
              <div
                className="res-row"
                style={{ gridTemplateColumns: `repeat(${level.cells}, 1fr)` }}
              >
                {Array.from({ length: level.cells }, (_, i) => (
                  <div className="res-cell" key={i} />
                ))}
              </div>
              <p className="res-label">{level.label}</p>
            </div>
          ))}
        </div>

        <p className="hlede hsec-foot" data-reveal="soft">
          Learning is not the accumulation of disconnected cards. It is a coordinate
          system you can put new things into.
        </p>
      </div>
    </section>
  );
}
