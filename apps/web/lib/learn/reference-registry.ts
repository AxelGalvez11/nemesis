// The curated half of §42's rung three — a small registry, entered by hand.
//
// 🔴 EVERY ROW BELOW WAS VERIFIED AGAINST ITS FILE'S OWN REPOSITORY PAGE ON 2026-08-23, via
// `scripts/reference-registry-harvest.mts`, which reads the per-file licence, author and rendition
// URL through the repository's API — the same metadata the file's page renders — and REFUSES to
// emit a row whose licence does not normalise onto `REUSABLE_LICENCES`. Four candidates were
// refused that day for exactly that reason (CC BY 2.5 and CC BY-SA 2.5 are not on the allow list,
// and one file recorded no licence at all); refusal working is the evidence the process does.
//
// 🔴 IT IS NOT A CORPUS AND MUST NOT BECOME ONE: *"Do NOT bulk-ingest the internet."* Every row is
// a file somebody chose, whose licence was read, one at a time. The LIVE provider covers the long
// tail; this list exists so the highest-traffic teaching concepts resolve to a picture a human
// picked, instantly and offline. Keep it small enough to audit in one sitting.
//
// ── HOW TO ADD A ROW ────────────────────────────────────────────────────────────────────────────
// 1. `pnpm tsx scripts/reference-registry-harvest.mts search "<concept>"` and read what comes back.
// 2. Pick a file by reading its licence, author and description — not its thumbnail alone.
// 3. `pnpm tsx scripts/reference-registry-harvest.mts verify "File:..."` and paste the row it
//    prints. It prints no row for a licence off the allow list, and that is the process working.
// 4. Write the caption and concepts yourself — they are teaching judgements, not metadata.
// 5. Keep `attribution` to the credit the licence actually requires (author, source), bounded the
//    way `canvas-visual.ts` bounds it. Long courtesy citations live on the file's page, one click
//    away through `url`.
//
// `assetPath` is a bounded rendition on the repository's file store rather than an object in
// Nemesis storage. That is a stated weakness (a hotlinked file can move), mitigated three ways: the
// renderer collapses a dead link to nothing, the live provider stands behind every registry miss,
// and `reference-registry.test.ts` asserts every row's host is one the reference lane allows.

import type { CuratedEntry } from "./reference-images";

/** Hand-verified rows. See the header for what a row claims and how one is added. */
export const REFERENCE_REGISTRY: readonly CuratedEntry[] = [
  // ── Cell biology and genetics ─────────────────────────────────────────────────────────────────
  {
    assetPath: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Mitosis_Stages.svg/1280px-Mitosis_Stages.svg.png",
    attribution: "Ali Zifan",
    author: "Ali Zifan",
    caption: "The stages of mitosis: interphase, prophase, prometaphase, metaphase, anaphase and telophase.",
    concepts: ["mitosis", "cell division", "prophase metaphase anaphase telophase", "cell cycle stages"],
    licence: "CC-BY-SA-4.0",
    source: "Wikimedia Commons",
    url: "https://commons.wikimedia.org/wiki/File:Mitosis_Stages.svg",
  },
  {
    assetPath: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Process_of_Meiosis.jpg/1280px-Process_of_Meiosis.jpg",
    attribution: "Natalie Constance Hall",
    author: "Natalie Constance Hall",
    caption: "The phases of meiosis, from a diploid parent cell to four haploid daughter cells.",
    concepts: ["meiosis", "meiosis phases", "gamete formation", "haploid diploid division"],
    licence: "CC-BY-4.0",
    source: "Wikimedia Commons",
    url: "https://commons.wikimedia.org/wiki/File:Process_of_Meiosis.jpg",
  },
  {
    assetPath: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/88/Nondisjunction_in_meiosis_leading_to_trisomy_21.jpg/1280px-Nondisjunction_in_meiosis_leading_to_trisomy_21.jpg",
    attribution: "Willnpp11",
    author: "Willnpp11",
    caption: "Nondisjunction during meiosis I producing a gamete with an extra chromosome, leading to trisomy 21.",
    concepts: ["nondisjunction", "trisomy 21", "down syndrome chromosomes", "meiosis error"],
    licence: "CC-BY-SA-4.0",
    source: "Wikimedia Commons",
    url: "https://commons.wikimedia.org/wiki/File:Nondisjunction_in_meiosis_leading_to_trisomy_21.jpg",
  },
  {
    assetPath: "https://upload.wikimedia.org/wikipedia/commons/1/13/DNA_Double_Helix_by_NHGRI.jpg",
    attribution: "National Human Genome Research Institute",
    author: "National Human Genome Research Institute",
    caption: "The DNA double helix, with base pairing between the two strands.",
    concepts: ["dna", "double helix", "dna structure", "base pairing"],
    licence: "public-domain",
    source: "Wikimedia Commons",
    url: "https://commons.wikimedia.org/wiki/File:DNA_Double_Helix_by_NHGRI.jpg",
  },
  {
    assetPath: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Chromosome_DNA_Gene.svg/1280px-Chromosome_DNA_Gene.svg.png",
    attribution: "Thomas Shafee",
    author: "Thomas Shafee",
    caption: "How a chromosome packages DNA, and where a gene sits along the strand.",
    concepts: ["chromosome", "gene", "chromosome dna gene relationship", "chromatin packaging"],
    licence: "CC-BY-4.0",
    source: "Wikimedia Commons",
    url: "https://commons.wikimedia.org/wiki/File:Chromosome_DNA_Gene.svg",
  },
  {
    assetPath: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Animal_cell_structure_en.svg/1280px-Animal_cell_structure_en.svg.png",
    attribution: "LadyofHats (Mariana Ruiz)",
    author: "LadyofHats (Mariana Ruiz)",
    caption: "A typical animal cell with its organelles labelled.",
    concepts: ["animal cell", "cell organelles", "eukaryotic cell structure"],
    licence: "public-domain",
    source: "Wikimedia Commons",
    url: "https://commons.wikimedia.org/wiki/File:Animal_cell_structure_en.svg",
  },
  {
    assetPath: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Plant_cell_structure-en.svg/1280px-Plant_cell_structure-en.svg.png",
    attribution: "LadyofHats (Mariana Ruiz)",
    author: "LadyofHats (Mariana Ruiz)",
    caption: "A typical plant cell, with the cell wall, chloroplasts and central vacuole labelled.",
    concepts: ["plant cell", "chloroplast", "cell wall", "plant cell organelles"],
    licence: "public-domain",
    source: "Wikimedia Commons",
    url: "https://commons.wikimedia.org/wiki/File:Plant_cell_structure-en.svg",
  },
  {
    assetPath: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Animal_mitochondrion_diagram_en.svg/1280px-Animal_mitochondrion_diagram_en.svg.png",
    attribution: "LadyofHats (Mariana Ruiz Villarreal)",
    author: "LadyofHats (Mariana Ruiz Villarreal)",
    caption: "A mitochondrion in section: outer membrane, inner membrane, cristae and matrix.",
    concepts: ["mitochondrion", "mitochondria", "cristae matrix", "cellular respiration organelle"],
    licence: "public-domain",
    source: "Wikimedia Commons",
    url: "https://commons.wikimedia.org/wiki/File:Animal_mitochondrion_diagram_en.svg",
  },
  {
    assetPath: "https://upload.wikimedia.org/wikipedia/commons/4/47/Fluid_Mosaic_Model.png",
    attribution: "Connectivid-D",
    author: "Connectivid-D",
    caption: "The fluid mosaic model of the cell membrane: a phospholipid bilayer with embedded proteins, glycoproteins and sterols.",
    concepts: ["cell membrane", "fluid mosaic model", "phospholipid bilayer", "membrane proteins"],
    licence: "CC-BY-SA-4.0",
    source: "Wikimedia Commons",
    url: "https://commons.wikimedia.org/wiki/File:Fluid_Mosaic_Model.png",
  },
  {
    assetPath: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Photosynthesis_en.svg/1280px-Photosynthesis_en.svg.png",
    attribution: "At09kg, Wattcle, Nefronus",
    author: "At09kg, Wattcle, Nefronus",
    caption: "Photosynthesis in a plant: light, water and carbon dioxide in; glucose and oxygen out.",
    concepts: ["photosynthesis", "light reactions", "plant energy", "glucose production"],
    licence: "CC-BY-SA-4.0",
    source: "Wikimedia Commons",
    url: "https://commons.wikimedia.org/wiki/File:Photosynthesis_en.svg",
  },
  // ── Microbiology ──────────────────────────────────────────────────────────────────────────────
  {
    assetPath: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/Bacterial_morphology_diagram.svg/1280px-Bacterial_morphology_diagram.svg.png",
    attribution: "LadyofHats (Mariana Ruiz)",
    author: "LadyofHats (Mariana Ruiz)",
    caption: "Bacterial shapes and arrangements: cocci, bacilli, spirilla and their groupings.",
    concepts: ["bacterial morphology", "cocci bacilli spirilla", "bacteria shapes", "bacterial arrangements"],
    licence: "public-domain",
    source: "Wikimedia Commons",
    url: "https://commons.wikimedia.org/wiki/File:Bacterial_morphology_diagram.svg",
  },
  {
    assetPath: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Gram-Cell-wall.svg/1280px-Gram-Cell-wall.svg.png",
    attribution: "Graevemoore",
    author: "Graevemoore",
    caption: "Gram-positive versus gram-negative cell walls: peptidoglycan thickness and the outer membrane.",
    concepts: ["gram positive", "gram negative", "bacterial cell wall", "peptidoglycan gram stain"],
    licence: "CC-BY-SA-3.0",
    source: "Wikimedia Commons",
    url: "https://commons.wikimedia.org/wiki/File:Gram-Cell-wall.svg",
  },
  {
    assetPath: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/E._coli_Bacteria_%287316101966%29.jpg/1280px-E._coli_Bacteria_%287316101966%29.jpg",
    attribution: "NIAID",
    author: "NIAID",
    caption: "Escherichia coli under the electron microscope.",
    concepts: ["escherichia coli", "e coli micrograph", "bacteria electron microscope", "rod shaped bacteria"],
    licence: "public-domain",
    source: "Wikimedia Commons",
    url: "https://commons.wikimedia.org/wiki/File:E._coli_Bacteria_(7316101966).jpg",
  },
  // ── Anatomy and physiology ────────────────────────────────────────────────────────────────────
  {
    assetPath: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Diagram_of_the_human_heart_%28cropped%29.svg/1280px-Diagram_of_the_human_heart_%28cropped%29.svg.png",
    attribution: "Wapcaplet",
    author: "Wapcaplet",
    caption: "The human heart with chambers, valves and great vessels labelled.",
    concepts: ["heart anatomy", "heart chambers", "atria ventricles valves", "cardiac anatomy"],
    licence: "CC-BY-SA-3.0",
    source: "Wikimedia Commons",
    url: "https://commons.wikimedia.org/wiki/File:Diagram_of_the_human_heart_(cropped).svg",
  },
  {
    assetPath: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Heart_numlabels.svg/1280px-Heart_numlabels.svg.png",
    attribution: "Wapcaplet",
    author: "Wapcaplet",
    caption: "The human heart with numbered parts, for self-testing.",
    concepts: ["heart numbered diagram", "heart quiz labels", "heart anatomy practice"],
    licence: "CC-BY-SA-3.0",
    source: "Wikimedia Commons",
    url: "https://commons.wikimedia.org/wiki/File:Heart_numlabels.svg",
  },
  {
    assetPath: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Complete_neuron_cell_diagram_en.svg/1280px-Complete_neuron_cell_diagram_en.svg.png",
    attribution: "LadyofHats (Mariana Ruiz)",
    author: "LadyofHats (Mariana Ruiz)",
    caption: "A neuron with dendrites, soma, axon, myelin sheath and synaptic terminals labelled.",
    concepts: ["neuron", "nerve cell", "axon dendrite synapse", "myelin sheath"],
    licence: "public-domain",
    source: "Wikimedia Commons",
    url: "https://commons.wikimedia.org/wiki/File:Complete_neuron_cell_diagram_en.svg",
  },
  {
    assetPath: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dc/KidneyAndNephron-v4_Antares42.svg/1280px-KidneyAndNephron-v4_Antares42.svg.png",
    attribution: "Madhero88, Piotr Michał Jaworski; derivative work Daniel Sachse (Antares42)",
    author: "Daniel Sachse (Antares42)",
    caption: "The kidney in section beside a single nephron, from glomerulus to collecting duct.",
    concepts: ["nephron", "kidney anatomy", "glomerulus loop of henle", "renal structure"],
    licence: "CC-BY-SA-3.0",
    source: "Wikimedia Commons",
    url: "https://commons.wikimedia.org/wiki/File:KidneyAndNephron-v4_Antares42.svg",
  },
  {
    assetPath: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Gas_exchange_in_the_aveolus_simple_%28en%29.svg/1280px-Gas_exchange_in_the_aveolus_simple_%28en%29.svg.png",
    attribution: "domdomegg",
    author: "domdomegg",
    caption: "Gas exchange in an alveolus: oxygen in, carbon dioxide out, across the capillary wall.",
    concepts: ["alveolus", "gas exchange", "alveoli capillary", "respiration lungs"],
    licence: "CC-BY-4.0",
    source: "Wikimedia Commons",
    url: "https://commons.wikimedia.org/wiki/File:Gas_exchange_in_the_aveolus_simple_(en).svg",
  },
  {
    assetPath: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Digestive_system_diagram_en.svg/1280px-Digestive_system_diagram_en.svg.png",
    attribution: "Mariana Ruiz, Jmarchn",
    author: "Mariana Ruiz, Jmarchn",
    caption: "The human digestive system from mouth to rectum, with organs labelled.",
    concepts: ["digestive system", "gastrointestinal tract", "digestion organs", "stomach intestines"],
    licence: "public-domain",
    source: "Wikimedia Commons",
    url: "https://commons.wikimedia.org/wiki/File:Digestive_system_diagram_en.svg",
  },
  {
    assetPath: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Sarcomere.svg/1280px-Sarcomere.svg.png",
    attribution: "David Richfield (WikiJournal of Medicine 2014)",
    author: "David Richfield",
    caption: "A sarcomere: actin and myosin filaments between two Z-lines, the unit of muscle contraction.",
    concepts: ["sarcomere", "muscle contraction", "actin myosin", "skeletal muscle structure"],
    licence: "CC-BY-SA-3.0",
    source: "Wikimedia Commons",
    url: "https://commons.wikimedia.org/wiki/File:Sarcomere.svg",
  },
  {
    assetPath: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Blausen_0328_EarAnatomy.png/1280px-Blausen_0328_EarAnatomy.png",
    attribution: "Blausen.com staff (Medical gallery of Blausen Medical 2014)",
    author: "BruceBlaus",
    caption: "The outer, middle and inner ear in section.",
    concepts: ["ear anatomy", "cochlea", "middle ear ossicles", "hearing structures"],
    licence: "CC-BY-3.0",
    source: "Wikimedia Commons",
    url: "https://commons.wikimedia.org/wiki/File:Blausen_0328_EarAnatomy.png",
  },
  {
    assetPath: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Schematic_diagram_of_the_human_eye_en.svg/1280px-Schematic_diagram_of_the_human_eye_en.svg.png",
    attribution: "Rhcastilhos, Jmarchn",
    author: "Rhcastilhos, Jmarchn",
    caption: "The human eye in section, with cornea, lens, retina and optic nerve labelled.",
    concepts: ["eye anatomy", "retina cornea lens", "vision structures", "optic nerve"],
    licence: "CC-BY-SA-3.0",
    source: "Wikimedia Commons",
    url: "https://commons.wikimedia.org/wiki/File:Schematic_diagram_of_the_human_eye_en.svg",
  },
  // ── Beyond biology — the registry is field-agnostic, and these rows keep that true ────────────
  {
    assetPath: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Supply-and-demand.svg/1280px-Supply-and-demand.svg.png",
    attribution: "Paweł Zdziarski (faxe), Astarot",
    author: "Paweł Zdziarski (faxe), Astarot",
    caption: "Supply and demand curves crossing at market equilibrium.",
    concepts: ["supply and demand", "market equilibrium", "economics curves", "price quantity"],
    licence: "CC-BY-SA-3.0",
    source: "Wikimedia Commons",
    url: "https://commons.wikimedia.org/wiki/File:Supply-and-demand.svg",
  },
  {
    assetPath: "https://upload.wikimedia.org/wikipedia/commons/9/94/Water_cycle.png",
    attribution: "John M. Even / USGS",
    author: "John M. Even / USGS",
    caption: "The water cycle: evaporation, condensation, precipitation and collection.",
    concepts: ["water cycle", "hydrologic cycle", "evaporation precipitation", "earth science water"],
    licence: "public-domain",
    source: "Wikimedia Commons",
    url: "https://commons.wikimedia.org/wiki/File:Water_cycle.png",
  },
  {
    assetPath: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Plates_tect2_en.svg/1280px-Plates_tect2_en.svg.png",
    attribution: "USGS; description by Scott Nash",
    author: "USGS",
    caption: "Earth's major tectonic plates and their boundaries.",
    concepts: ["plate tectonics", "tectonic plates map", "earth crust plates", "geology boundaries"],
    licence: "public-domain",
    source: "Wikimedia Commons",
    url: "https://commons.wikimedia.org/wiki/File:Plates_tect2_en.svg",
  },
  {
    assetPath: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cf/EM_Spectrum_Properties_edit.svg/1280px-EM_Spectrum_Properties_edit.svg.png",
    attribution: "Inductiveload, NASA",
    author: "Inductiveload, NASA",
    caption: "The electromagnetic spectrum: wavelength, frequency and everyday scale from radio to gamma.",
    concepts: ["electromagnetic spectrum", "wavelength frequency", "radio infrared ultraviolet", "physics light spectrum"],
    licence: "CC-BY-SA-3.0",
    source: "Wikimedia Commons",
    url: "https://commons.wikimedia.org/wiki/File:EM_Spectrum_Properties_edit.svg",
  },
  {
    assetPath: "https://upload.wikimedia.org/wikipedia/commons/d/dc/4StrokeEngine_Ortho_3D_Small.gif",
    attribution: "Zephyris",
    author: "Zephyris",
    caption: "A four-stroke engine cycle in motion: intake, compression, power, exhaust.",
    concepts: ["four stroke engine", "internal combustion", "engine cycle", "mechanical engineering pistons"],
    licence: "CC-BY-SA-3.0",
    source: "Wikimedia Commons",
    url: "https://commons.wikimedia.org/wiki/File:4StrokeEngine_Ortho_3D_Small.gif",
  },
  {
    assetPath: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/58/Maslow%27s_hierarchy_of_needs.svg/1280px-Maslow%27s_hierarchy_of_needs.svg.png",
    attribution: "J. Finkelstein",
    author: "J. Finkelstein",
    caption: "Maslow's hierarchy of needs, from physiological needs to self-actualization.",
    concepts: ["maslow hierarchy of needs", "psychology motivation", "self actualization pyramid"],
    licence: "CC-BY-SA-3.0",
    source: "Wikimedia Commons",
    url: "https://commons.wikimedia.org/wiki/File:Maslow%27s_hierarchy_of_needs.svg",
  },
  {
    assetPath: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg/1280px-Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg",
    attribution: "Leonardo da Vinci",
    author: "Leonardo da Vinci",
    caption: "The Mona Lisa (c. 1503–1506), oil on poplar panel, Musée du Louvre.",
    concepts: ["mona lisa", "leonardo da vinci", "renaissance painting", "art history portrait"],
    licence: "public-domain",
    source: "Wikimedia Commons",
    url: "https://commons.wikimedia.org/wiki/File:Mona_Lisa,_by_Leonardo_da_Vinci,_from_C2RMF_retouched.jpg",
  },
];
