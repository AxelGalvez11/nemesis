// History, literature, writing, philosophy and the arts. Library sweep 2026-08-23.

import { course, t } from "./authoring";

const HIST = "history";
const LIT = "literature";
const WRIT = "writing";
const PHIL = "philosophy";
const MUS = "music";
const ART = "art-history";
const COMM = "communication";

export const HISTORY_HUMANITIES_COURSES = [
  course(HIST, "US History", ["american history", "apush", "ap us history", "us history 101"], [
    t("Colonial America", { outcome: "compare the colonies' economies and societies" }),
    t("Revolution and founding", { aliases: ["american revolution"], outcome: "explain why the break came and what the founding settled" }),
    t("The early republic", { outcome: "trace the first parties and the young state's tests" }),
    t("Expansion and its costs", { aliases: ["westward expansion"], outcome: "connect expansion to removal, war and sectional strain" }),
    t("Slavery and the Civil War", { aliases: ["civil war"], outcome: "argue the war's causes from the record" }),
    t("Reconstruction", { outcome: "state what Reconstruction attempted, won and lost" }),
    t("Industrialization and the Gilded Age", { outcome: "connect industry's rise to labour, cities and immigration" }),
    t("Progressivism through the New Deal", { aliases: ["great depression", "new deal"], outcome: "trace reform from muckrakers to the New Deal order" }),
    t("World wars and the Cold War", { aliases: ["cold war"], outcome: "narrate America's rise to superpower and its costs" }),
    t("Civil rights era", { aliases: ["civil rights movement"], outcome: "sequence the movement's campaigns and their wins" }),
    t("Recent America", { outcome: "connect the late twentieth century to today's fault lines" }),
  ]),

  course(HIST, "World History", ["ap world history", "world history 101", "global history"], [
    t("Early civilizations", { outcome: "compare the river-valley civilizations' solutions" }),
    t("Classical empires", { aliases: ["rome", "han china"], outcome: "compare how the classical empires ruled and fell" }),
    t("Belief systems", { aliases: ["world religions"], outcome: "map the great traditions' origins and spread" }),
    t("The post-classical world", { aliases: ["islamic golden age", "medieval"], outcome: "trace trade and learning across Afro-Eurasia" }),
    t("Networks of exchange", { aliases: ["silk road"], outcome: "follow goods, ideas and disease along the routes" }),
    t("Early modern empires and encounters", { aliases: ["columbian exchange"], outcome: "weigh the Columbian exchange's ledgers" }),
    t("Revolutions", { aliases: ["atlantic revolutions"], outcome: "compare the age of revolutions' causes and outcomes" }),
    t("Industrialization and imperialism", { outcome: "connect factories at home to empires abroad" }),
    t("Global wars", { aliases: ["world war 1", "world war 2"], outcome: "explain the world wars as one connected crisis" }),
    t("Decolonization and the contemporary world", { outcome: "trace empire's end and what filled the space" }),
  ]),

  course(HIST, "European History", ["ap european history", "ap euro", "modern european history"], [
    t("Renaissance and Reformation", { outcome: "connect humanism to the church's fracture" }),
    t("Exploration and state-building", { aliases: ["absolutism"], outcome: "compare absolutist and constitutional paths" }),
    t("The Scientific Revolution and Enlightenment", { outcome: "trace how new knowledge became new politics" }),
    t("The French Revolution and Napoleon", { aliases: ["french revolution"], outcome: "sequence the revolution's turns and Napoleon's Europe" }),
    t("Industrial society", { outcome: "describe what the factory did to family, city and class" }),
    t("Nationalism and unification", { outcome: "explain how Germany and Italy became states" }),
    t("Imperial Europe and the Great War", { aliases: ["world war 1"], outcome: "argue how Europe walked into 1914" }),
    t("Interwar crises and World War II", { aliases: ["fascism"], outcome: "explain fascism's rise and the war it made" }),
    t("Cold War Europe to the present", { outcome: "trace division, integration and the union's strains" }),
  ]),

  course(ART, "Art History", ["ap art history", "intro art history", "history of art"], [
    t("How to look at art", { aliases: ["formal analysis"], outcome: "describe a work in form, content and context" }),
    t("Ancient art", { aliases: ["egyptian art", "greek art"], outcome: "read ancient works as power and belief made visible" }),
    t("Medieval art", { outcome: "connect sacred spaces to their liturgies" }),
    t("The Renaissance", { outcome: "explain what perspective and patronage changed" }),
    t("Baroque through Rococo", { outcome: "read drama and ornament as argument" }),
    t("Neoclassicism through Romanticism", { outcome: "contrast reason's art with feeling's" }),
    t("The birth of modern art", { aliases: ["impressionism"], outcome: "explain what the avant-garde was rebelling against" }),
    t("Twentieth-century movements", { aliases: ["cubism", "abstract expressionism"], outcome: "place the isms and what each claimed" }),
    t("Global and contemporary art", { outcome: "engage contemporary work beyond like and dislike" }),
  ]),

  course(WRIT, "Composition and Rhetoric", ["freshman composition", "english composition", "ap english language", "ap lang", "college writing"], [
    t("The rhetorical situation", { aliases: ["audience", "purpose"], outcome: "name a text's audience, purpose and constraints" }),
    t("Reading critically", { outcome: "summarise fairly before judging" }),
    t("Claims and evidence", { aliases: ["argument"], outcome: "build an argument that survives a hostile reader" }),
    t("Structure and paragraphs", { outcome: "order a piece so each part earns the next" }),
    t("Style and clarity", { aliases: ["concision"], outcome: "cut a draft's fog without cutting its meaning" }),
    t("Research and sources", { aliases: ["citation"], outcome: "find, evaluate and cite sources honestly" }),
    t("Revision", { outcome: "revise globally before polishing locally" }),
    t("Rhetorical analysis", { outcome: "explain how a text persuades, not just what it says" }),
  ]),

  course(LIT, "English Literature", ["ap english literature", "ap lit", "intro to literature", "literary analysis"], [
    t("Close reading", { outcome: "ground a claim in the words on the page" }),
    t("Poetry", { aliases: ["meter", "imagery"], outcome: "analyse how a poem's form makes its meaning" }),
    t("The short story", { outcome: "read structure, point of view and compression" }),
    t("The novel", { aliases: ["narrative"], outcome: "track character, plot and theme across length" }),
    t("Drama", { aliases: ["shakespeare"], outcome: "read a play as performance, not just text" }),
    t("Literary devices and figurative language", { outcome: "name devices and, more importantly, their effects" }),
    t("Critical lenses", { aliases: ["literary theory"], outcome: "reread one text through two lenses" }),
    t("Writing about literature", { aliases: ["literary essays"], outcome: "argue an interpretation with textual evidence" }),
  ]),

  course(WRIT, "Creative Writing", ["intro creative writing", "fiction writing"], [
    t("Reading as a writer", { outcome: "steal techniques, not sentences" }),
    t("Image and detail", { aliases: ["show don't tell"], outcome: "render a scene in concrete particulars" }),
    t("Character", { outcome: "build a character who wants something" }),
    t("Plot and structure", { aliases: ["scene and summary"], outcome: "shape events so pressure rises" }),
    t("Point of view and voice", { outcome: "choose a point of view and keep its contract" }),
    t("Dialogue", { outcome: "write talk that does work" }),
    t("Poetry fundamentals", { aliases: ["line breaks"], outcome: "use line, sound and image deliberately" }),
    t("Revision and workshop", { outcome: "give and take critique that improves the draft" }),
  ]),

  course(COMM, "Public Speaking", ["speech", "intro public speaking", "oral communication"], [
    t("Managing speech anxiety", { outcome: "turn nerves into usable energy" }),
    t("Knowing your audience", { outcome: "fit a message to the room" }),
    t("Organizing a speech", { aliases: ["outlining"], outcome: "structure a talk someone can follow by ear" }),
    t("Openings and closings", { outcome: "earn attention early and land the ending" }),
    t("Evidence and reasoning aloud", { outcome: "support claims without losing the listener" }),
    t("Language for the ear", { outcome: "write for speaking, not reading" }),
    t("Delivery", { aliases: ["body language"], outcome: "use voice, pause and gesture on purpose" }),
    t("Visual aids", { aliases: ["slides"], outcome: "make slides that help instead of compete" }),
    t("Persuasive and special-occasion speaking", { outcome: "adapt the craft to the occasion" }),
  ]),

  course(PHIL, "Introduction to Philosophy", ["intro philosophy", "philosophy 101"], [
    t("What philosophy does", { aliases: ["socratic method"], outcome: "state a thesis and follow an argument where it leads" }),
    t("Knowledge and scepticism", { aliases: ["epistemology"], outcome: "say what would count as knowing something" }),
    t("Mind and body", { aliases: ["philosophy of mind", "consciousness"], outcome: "state the mind–body problem and the main answers" }),
    t("Free will", { aliases: ["determinism"], outcome: "map the free-will positions and their costs" }),
    t("Personal identity", { outcome: "say what makes you the same person over time, if anything" }),
    t("God and reason", { aliases: ["philosophy of religion"], outcome: "evaluate the classic arguments both ways" }),
    t("Right and wrong", { aliases: ["moral philosophy"], outcome: "apply the major moral theories to one case" }),
    t("Justice and the state", { aliases: ["political philosophy"], outcome: "argue what makes authority legitimate" }),
  ]),

  course(PHIL, "Logic", ["intro logic", "formal logic", "symbolic logic"], [
    t("Arguments and validity", { outcome: "tell valid from sound from persuasive" }),
    t("Informal fallacies", { outcome: "name fallacies in the wild without abusing the names" }),
    t("Propositional logic", { aliases: ["truth tables"], outcome: "translate and test arguments with truth tables" }),
    t("Natural deduction", { aliases: ["proofs"], outcome: "derive a conclusion line by line" }),
    t("Predicate logic", { aliases: ["quantifiers"], outcome: "translate 'all' and 'some' correctly and prove with them" }),
    t("Inductive reasoning", { aliases: ["analogy"], outcome: "grade inductive strength honestly" }),
    t("Probability and reasoning under uncertainty", { outcome: "avoid the classic probability blunders" }),
  ]),

  course(PHIL, "Ethics", ["intro ethics", "moral philosophy course", "applied ethics"], [
    t("Metaethics", { aliases: ["moral relativism"], outcome: "say whether moral claims can be true, and what turns on it" }),
    t("Consequentialism", { aliases: ["utilitarianism"], outcome: "apply utilitarian reasoning and state its bite" }),
    t("Deontology", { aliases: ["kant"], outcome: "apply the categorical imperative to a case" }),
    t("Virtue ethics", { aliases: ["aristotle"], outcome: "evaluate an act by the character it expresses" }),
    t("The ethics of life and death", { aliases: ["bioethics"], outcome: "argue a bioethics case with a named framework" }),
    t("Ethics of technology and data", { outcome: "apply ethical frameworks to machines that decide" }),
    t("Justice and inequality", { outcome: "compare theories of what a fair share is" }),
    t("Moral psychology", { outcome: "confront what empirical minds do to ethical theory" }),
  ]),

  course(MUS, "Music Theory", ["ap music theory", "intro music theory", "theory 101"], [
    t("Notation and the staff", { aliases: ["reading music"], outcome: "read pitch and rhythm fluently" }),
    t("Scales and keys", { aliases: ["key signatures", "circle of fifths"], outcome: "spell any major or minor scale and its key" }),
    t("Intervals", { outcome: "name and hear the intervals" }),
    t("Triads and seventh chords", { aliases: ["chords"], outcome: "build and identify chords in root position and inversion" }),
    t("Harmonic function", { aliases: ["roman numerals", "cadences"], outcome: "analyse a progression's pull toward home" }),
    t("Voice leading", { aliases: ["part writing"], outcome: "connect chords by the common-practice rules" }),
    t("Melody and phrase", { outcome: "analyse how a melody breathes" }),
    t("Rhythm and meter", { outcome: "perform and notate syncopation and compound meters" }),
    t("Form", { aliases: ["binary form", "sonata form"], outcome: "map a piece's architecture" }),
  ]),
] as const;
