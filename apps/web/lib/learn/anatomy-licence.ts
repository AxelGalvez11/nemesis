// Who made each atlas, and under what terms — the one anatomy fact a client component may hold.
//
// 🔴 ITS OWN MODULE BECAUSE THE REGISTRY MUST NOT REACH THE LEARNER'S BUNDLE. The viewer has to
// draw a credit line, and a credit line is four short strings; the registry beside it is 3,777
// structure names and grows with every region harvested. Importing the licence from
// `anatomy-atlas.ts` would drag the whole atlas into every page that can render a Canvas — the
// §45 rule about the maths layer, applied to data.
//
// 🔴 THREE SOURCES ON TWO LICENCES, AND THE CREDIT MUST NAME THE RIGHT ONE. The bones, skulls and
// limbs come from the university-revised Open3DModel; the organs, muscles, vessels and nerves come
// from Z-Anatomy upstream; the female organs come from the NIH Human Reference Atlas, because the
// other two descend from one male body and have none. The first two are share-alike and the third
// is plain attribution, so the TERMS travel per region too, not just the name — printing one
// atlas's licence under another atlas's mesh is exactly what these licences exist to prevent.

export type AnatomySource = "open3dmodel" | "z-anatomy" | "hra";

export interface AnatomyCredit {
  readonly attribution: string;
  readonly licence: string;
  readonly source: string;
  readonly url: string;
}

export const ANATOMY_SOURCES: Readonly<Record<AnatomySource, AnatomyCredit>> = {
  "open3dmodel": {
    attribution: "Open3DModel (AnatomyTOOL), revised from Z-Anatomy / BodyParts3D",
    licence: "CC-BY-SA-4.0",
    source: "Open3DModel",
    url: "https://anatomytool.org/open3dmodel-about",
  },
  "z-anatomy": {
    attribution: "Z-Anatomy, derived from BodyParts3D",
    licence: "CC-BY-SA-4.0",
    source: "Z-Anatomy",
    url: "https://www.z-anatomy.com/",
  },
  "hra": {
    attribution:
      "Human Reference Atlas (HuBMAP), from the Visible Human Dataset, U.S. National Library of Medicine",
    licence: "CC-BY-4.0",
    source: "Human Reference Atlas",
    url: "https://humanatlas.io/3d-reference-library",
  },
};

/** The credit for a region's source, falling back to the atlas that serves the most regions. */
export function anatomyCredit(source: string | undefined): AnatomyCredit {
  return ANATOMY_SOURCES[(source ?? "") as AnatomySource] ?? ANATOMY_SOURCES["open3dmodel"];
}
