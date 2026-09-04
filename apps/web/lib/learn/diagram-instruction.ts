// When Nemesis draws instead of describing, and in what notation. ONE copy, read by every surface
// that speaks.
//
// Owner, 2026-08-30: *"flow charts, diagrams, graphs, mind maps in chat. Like, that's literally all
// I want."* Then, 2026-09-04, of the board: *"wondering.app is able to create visuals, can we
// implement visuals similar?"*
//
// 🔴🔴 THE DRAWING RIDES THE PROSE, WHICH IS WHY THIS IS A PROMPT AND NOT AN API FIELD. A fence is
// positional: the diagram lands exactly where the model put it, between the sentence that
// introduces it and the one that follows. A `visuals` array on the turn decision cannot know
// "where", because the prose is written in the same breath (reply-visuals.ts says the same thing
// about its own fences).
//
// 🔴 WHAT WONDERING DOES AND WE DELIBERATELY DO NOT: their card streams an `[[EMBED …]]` block and
// an image model paints a picture of the subject (docs/wondering-canvas-reference.md §8). A painted
// picture of a mechanism is a guess about the mechanism, and a learner cannot tell the guess from
// the fact. A mermaid fence is drawn from the words the model just wrote and is wrong only where
// the words are wrong; a curated figure is a real published figure with a licence. Those are the
// two lanes Nemesis draws in, and neither of them invents an image.
//
// 🔴 A FENCE THAT FAILS TO PARSE COSTS ONLY ITSELF. `mermaid-diagram.tsx` is parse-gated: a bad
// diagram renders as its own code block rather than a broken frame, so the worst case is text.
//
// PURE. A string, nothing else.

/**
 * How to draw, shared by the chat's turn router and the board's card turn.
 *
 * 🔴 THE JUDGEMENT IS THE MODEL'S, NOT ONLY THE LEARNER'S — owner, 2026-08-30: *"shouldn't DeepSeek
 * be able to know when a diagram or flow chart or mermaid would be most useful?"* The first draft of
 * this paragraph led with on-request use, and the model behaved accordingly: asked to teach meiosis
 * it wrote prose, asked to "show" it drew. The signs below name the shapes of answer that want a
 * drawing, so reaching for one unprompted is instructed rather than permitted; the never-decorate
 * sentence is the brake that keeps a definition from arriving as art.
 *
 * 🔴 THE SIZE CAP AND THE PLAIN-LABEL RULE ARE WHAT KEEP DRAWINGS READABLE: a forty-node graph lays
 * out as spaghetti, and HTML in a label is stripped by the renderer's strict mode anyway. The mind
 * map is the exception, because since 2026-09-03 it draws as an interactive tree the learner opens
 * branch by branch (owner: *"a ladder of things you need to know from shallow to deeply
 * detailed"*), so depth costs nothing on screen and is the whole point of asking for one.
 */
export const DIAGRAM_INSTRUCTION =
  "Nemesis draws fenced mermaid blocks in your answer: flowchart TD for steps and "
  + "decisions, mindmap for how a subject branches, sequenceDiagram for exchanges over time, "
  + "stateDiagram-v2 for states, pie for shares of a whole. Judge for yourself when one would "
  + "genuinely help, without being asked: an answer that IS a process with stages, a branching "
  + "decision, a cycle, a hierarchy, or several parts relating to each other lands better drawn, "
  + 'and if you find yourself writing "first... then... which leads to...", draw that answer '
  + "beside the prose. Always use one when the learner asks for a flow chart, diagram, mind map "
  + "or similar. Keep a diagram under about fifteen nodes, write labels as short plain "
  + 'text in double quotes (no HTML, no LaTeX inside labels), and let the prose still carry the '
  + "explanation. "
  + "A mindmap is the exception to that cap: it draws as an interactive tree the learner opens "
  + "one branch at a time, so when they ask for a mind map go deep, three to five levels and up "
  + "to about sixty nodes, the big ideas nearest the root and the specifics at the leaves, one "
  + "idea per node in a few words, every branch drawn from their material. "
  + "Never decorate: a plain fact, a definition, or a feeling needs no diagram.";
