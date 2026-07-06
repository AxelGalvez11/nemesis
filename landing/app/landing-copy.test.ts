import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("landing page positioning", () => {
  it("does not render the old video reel or link to its anchor", () => {
    const page = read("app/page.tsx");
    const hero = read("components/Hero.tsx");

    expect(page).not.toContain("VideoShowcase");
    expect(page).not.toContain("<VideoShowcase");
    expect(hero).not.toContain("#reel");
    expect(hero).not.toContain("30-second tour");
  });

  it("positions PharmaOrb as a scientific evidence workspace with agents, notebooks, and deliverables", () => {
    const files = [
      "app/layout.tsx",
      "components/Hero.tsx",
      "components/Sections.tsx",
      "components/Nav.tsx",
    ];
    const copy = files.map(read).join("\n").toLowerCase();

    expect(copy).toContain("scientific evidence");
    expect(copy).toContain("biomedicine");
    expect(copy).toContain("life sciences");
    expect(copy).toContain("behavioral sciences");
    expect(copy).toContain("notebook");
    expect(copy).toContain("agent");
    expect(copy).toContain("deliverables");
    expect(copy).toContain("paper");
    expect(copy).toContain("map");
    expect(copy).toContain("monitor");
  });
});
