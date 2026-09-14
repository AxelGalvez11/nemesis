"use client";

// The chat beside the lesson. Opens from a button, closes again, and never takes you off the page.
//
// Owner, 2026-09-04: *"they have like this icon where you can click on to open a small chat window
// ... and then like a chat window for Nemesis to help you out on the right side."*
//
// 🔴🔴 IT IS THE APP'S CHAT, NOT A SECOND ONE. Owner, same day: *"make the chat have the same style
// as chat, canvas style."* The first version of this file drew its own bubbles, its own composer
// and its own "Thinking…" line, all hand-styled from `--ui-*` tokens. They were close enough to
// pass a glance and wrong in every particular: a grey bubble where the app uses the learner's
// accent, plain text where the app renders markdown, a bordered rectangle where the app has a
// 28px capsule with a filled send button. So the pieces are IMPORTED now:
//
//   `LearnerUtterance`   the learner's own words, §46.2's single treatment, accent-filled
//   `AssistantMarkdown`  what Nemesis says, through the same renderer as every other answer
//   `ComposerSend`       the shared send control, already written once for the two composers
//   `.canvas-thinking-word`  the measured ChatGPT shimmer, not a static "Thinking…"
//   `--composer-*`       the capsule's radius, fill, edge and padding, as tokens
//
// The rule the composer file states about ITSELF applies here word for word: "two people writing
// the same button twice is how that happens, so it is written once". This panel is the third place
// a person talks to Nemesis, and it may not be the place where the treatment quietly forks.
//
// 🔴 WHAT IS GENUINELY DIFFERENT STAYS DIFFERENT: it is 384px in a rounded card rather than a 768px
// column, it has no attachments, no capabilities, no voice and no history. Those are absences, not
// restyles. Nothing about how a sentence LOOKS is decided in this file.
//
// 🔴 IT KNOWS WHICH SECTION YOU ARE ON, AND THAT IS THE WHOLE ADVANTAGE. Wondering's chat and
// Claude's academy have no equivalent: theirs answer in the abstract. This one is handed the
// section title, its objectives and the vocabulary the passage introduced, so "explain that again"
// means the thing on the screen. The lesson text is deliberately NOT sent: the objectives and terms
// are what the section is about, and they cost a fraction of the tokens.
//
// 🔴 THE CHAT NEVER TOUCHES THE KNOWLEDGE GRAPH FROM HERE. What a learner types while reading is a
// question, not a demonstration. Evidence is written by the checks and the test, which are the
// surfaces where somebody actually showed something (`knowledge-graph-grows-from-evidence`).

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { ComposerSend } from "@/components/workspace/learn/composer-controls";
import { LearnerUtterance } from "@/components/workspace/learn/learner-utterance";
import { AssistantMarkdown } from "@/lib/workspace/chat-markdown";
import { postChatCompletion, type WireMsg } from "@/lib/workspace/chat-api";
import { plainText, type Lesson } from "@/lib/courses/lesson";

interface Turn {
  readonly role: "user" | "assistant";
  readonly text: string;
}

/** Matches the canvas composer's own cap, so a long question grows the same distance in both. */
const INPUT_MAX = 150;

function briefing(courseTitle: string, sectionTitle: string, objectives: readonly string[], lesson: Lesson | null): string {
  const vocabulary = lesson
    ? lesson.terms.map((t) => `${t.term}: ${t.definition}`).join("\n")
    : "";
  return [
    `The learner is reading "${sectionTitle}" in the course "${courseTitle}".`,
    "",
    "This section is meant to leave them able to:",
    ...objectives.map((o) => `- ${plainText(o)}`),
    vocabulary ? "\nThe words this section introduced, with the definitions they were given:" : "",
    vocabulary,
    "",
    "Answer their question about this material. Stay at the level of the section: do not reach ahead",
    "into later chapters unless they ask. Keep it short unless they ask for depth. If they ask about",
    "something outside this section, answer it anyway rather than refusing.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function CourseChat({
  userId,
  courseTitle,
  sectionTitle,
  objectives,
  lesson,
  open,
  onClose,
}: {
  userId: string | null;
  courseTitle: string;
  sectionTitle: string;
  objectives: readonly string[];
  lesson: Lesson | null;
  /**
   * Whether the panel is showing.
   *
   * 🔴 IT IS MOUNTED EITHER WAY, so this is not "render or not" — it is the difference between a
   * panel and a clipped 0px frame. Closed it leaves the tab order and stops doing work nobody can
   * see; it does NOT forget the conversation, which is the point of keeping it mounted.
   */
  open: boolean;
  onClose: () => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const foot = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  // 🔴 NOT WHILE CLOSED. `scrollIntoView` walks up every scrollable ancestor, and inside a frame
  // clipped to zero width it can scroll the page behind it to chase an element nobody can see.
  useEffect(() => {
    if (!open) return;
    foot.current?.scrollIntoView({ block: "end" });
  }, [open, turns, busy]);

  // 🔴 LAYOUT EFFECT, NOT AN EFFECT: measuring after paint makes the box jump a frame behind the
  // character being typed. Reset to `auto` first or `scrollHeight` reports the height it already
  // has and the control only ever grows.
  useLayoutEffect(() => {
    const box = input.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight, INPUT_MAX)}px`;
    box.style.overflowY = box.scrollHeight > INPUT_MAX ? "auto" : "hidden";
  }, [draft]);

  const send = useCallback(async () => {
    const said = draft.trim();
    if (!said || busy) return;
    if (!userId) {
      setNote("Sign in to ask about this section.");
      return;
    }
    setDraft("");
    setNote(null);
    setTurns((prev) => [...prev, { role: "user", text: said }]);
    setBusy(true);

    const wire: WireMsg[] = [
      { role: "system", content: briefing(courseTitle, sectionTitle, objectives, lesson) },
      ...turns.map((t) => ({ role: t.role, content: t.text }) as WireMsg),
      { role: "user", content: said },
    ];

    let streamed = "";
    const reply = await postChatCompletion(userId, wire, {
      decision: { model: "deepseek-chat", route: "conversation", searchWeb: false },
      onDelta: (delta) => {
        streamed += delta;
        setTurns((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") next[next.length - 1] = { role: "assistant", text: streamed };
          else next.push({ role: "assistant", text: streamed });
          return next;
        });
      },
    });
    setBusy(false);
    if (reply.errorText) {
      setNote(reply.errorText);
      return;
    }
    const text = reply.text ?? streamed;
    if (!text) return;
    setTurns((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role === "assistant") next[next.length - 1] = { role: "assistant", text };
      else next.push({ role: "assistant", text });
      return next;
    });
  }, [busy, courseTitle, draft, lesson, objectives, sectionTitle, turns, userId]);

  const waiting = busy && turns[turns.length - 1]?.role === "user";

  return (
    <aside
      className="ml-[12px] flex h-full w-[384px] shrink-0 flex-col overflow-hidden rounded-[16px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated)"
      inert={!open}
    >
      <div className="flex h-[44px] shrink-0 items-center justify-between px-[14px]">
        <span className="text-[13px] font-medium text-(--ui-text-primary)">Ask about this section</span>
        <button
          aria-label="Close the chat"
          className="flex h-[28px] w-[28px] items-center justify-center rounded-[7px] text-(--course-quiet) transition-colors duration-[90ms] hover:bg-(--ui-bg-quaternary) active:bg-(--ui-bg-tertiary)"
          onClick={onClose}
          type="button"
        >
          <svg fill="none" height="15" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" viewBox="0 0 16 16" width="15">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>

      <div className="min-h-0 grow overflow-y-auto px-[14px] pb-[8px]">
        {turns.length === 0 ? (
          <p className="m-0 text-[length:var(--canvas-text-small)] leading-[1.6] text-(--course-quiet)">
            Nemesis can see which section you are on and what it is meant to teach you. Ask it to
            explain something again, or to give you a harder example.
          </p>
        ) : null}

        <div className="flex flex-col">
          {turns.map((turn, i) =>
            turn.role === "user" ? (
              // 🔴 THE APP'S BUBBLE, WITH NOTHING ADDED. Every measurement it carries — 70% cap,
              // 22px radius, 16/24 type, the accent fill and its computed ink — is decided inside
              // `LearnerUtterance` and must stay there; a class on this wrapper that touched any of
              // them would be the second treatment §46.2 exists to prevent.
              <div className="mb-[16px] flex justify-end" key={i}>
                <LearnerUtterance>{turn.text}</LearnerUtterance>
              </div>
            ) : (
              // 🔴 MARKDOWN, NOT `whitespace-pre-wrap`. What came back has headings, lists, bold and
              // formulas in it, and printing them as literal asterisks was the loudest way this
              // panel announced it was not the real chat.
              <AssistantMarkdown
                className="mb-[20px] text-[length:var(--canvas-text-body)] leading-relaxed text-(--ui-text-primary)"
                key={i}
                singleDollarMath
                text={turn.text}
              />
            ),
          )}

          {/* 🔴 THE SHIMMER THE APP ALREADY USES, MEASURED OFF THE REFERENCE (globals.css records
              the reading: 1400ms ease, a 50%-wide band swept -100%→250%, washing toward the page).
              A static grey "Thinking…" in here beside a shimmering one in the canvas is exactly the
              fork this file was rewritten to close. */}
          {waiting ? (
            <span className="canvas-thinking-word mb-[20px] self-start text-[length:var(--canvas-text-small)] leading-[18px]">
              Thinking
            </span>
          ) : null}
        </div>

        {note ? (
          <div className="text-[length:var(--canvas-text-small)] text-(--course-quiet)">{note}</div>
        ) : null}
        <div ref={foot} />
      </div>

      {/* 🔴 THE CAPSULE, FROM THE TOKENS RATHER THAN FROM A LITERAL. `--composer-radius` (28px),
          `--composer-fill` and `--composer-edge` are what the canvas composer and the front door
          both read; writing 12px and a border here is how the third composer starts to drift from
          the two that agree. The row is `--composer-pad-x` (8px) with the shared send button, which
          is always present and dims when there is nothing to send — the reference's behaviour, and
          already argued at length in `composer-controls.tsx`. */}
      <div className="shrink-0 p-[12px] pt-[4px]">
        <div className="flex items-end rounded-[var(--composer-radius)] bg-(--composer-fill) py-[6px] pl-[16px] pr-[var(--composer-pad-x)] shadow-[var(--composer-edge)]">
          <textarea
            className="max-h-[150px] min-h-[36px] w-full resize-none border-0 bg-transparent py-[7px] text-[length:var(--canvas-text-body)] leading-[22px] text-(--ui-text-primary) outline-none placeholder:text-(--course-meta)"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            // 🔴 NOT A SECOND COPY OF THE HEADER. The canvas composer's own note records the
            // same rule from 2026-08-30 — "a second copy down here said it twice". The panel is
            // already titled "Ask about this section"; the box only has to look askable.
            placeholder="Ask Nemesis…"
            ref={input}
            rows={1}
            value={draft}
          />
          <ComposerSend busy={busy} disabled={draft.trim().length === 0} label="Send" onClick={() => void send()} />
        </div>
      </div>
    </aside>
  );
}
