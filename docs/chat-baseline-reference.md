# The chat baseline: ChatGPT, Claude, Gemini, Wondering, and where Nemesis stands

Owner, 2026-09-04: *"can you make sure chatgpt ui/ux matches 1 to 1 in nemesis as a baseline? for
the chats"*, then *"actually investigate wondering.app, https://claude.ai/new, chatgpt, and gemini
for their chat interfaces to come to common baseline"*.

Everything below was read off the four products in the owner's own signed-in Chrome at a 1470px
viewport on 2026-09-04, by asking each one the SAME question ("Explain the doctrine of
consideration in contract law in five sentences.") and measuring the rendered result with
`getComputedStyle` and `getBoundingClientRect`. No number here is from a screenshot or from memory.

Wondering has no chat surface of its own: its front door is a course map, and its conversation IS
the canvas board, already measured in `wondering-canvas-reference.md`. Its card numbers are
carried in the last column for comparison only.

## 1. The start screen

| | ChatGPT | Claude | Gemini | Nemesis |
|---|---|---|---|---|
| heading | 24px / 400 / 28px | large serif display | 36px / 320 / 44px | 24px / 500 / 36px |
| heading text | "What's on the agenda today?" | "What shall we think through?" | "Let's jump in, Axel" | "Learn <rotating word>" |
| composer | 768 x 52, radius 28, `rgb(33,33,33)` | 640 x 110, radius 14, `rgb(32,32,31)`, pad 8 | 660 x 64, radius 32, `rgb(30,31,32)` | **768 x 128**, radius 28, `rgb(33,33,33)` |
| placeholder | "Ask ChatGPT" | "How can I help you today?" | "Ask Gemini" | "Ask Nemesis..." |
| under the composer | three suggestion rows | nothing | nothing | a helper sentence |
| in-composer controls | + (36), model (78), dictate (36), voice (36) | + (32), Chat/Cowork toggle, model (108), send (32) | + (32), mode (95), dictate (32) | + , mic, send, then a SECOND row (Choose project, Apps) |

**The finding, and it is a CHOICE and not a defect.** Three of the four put every composer control
on one row and keep the box between 52 and 64 tall. Nemesis is 128 because it stacks the field over
a control row. But ChatGPT does the same thing in its **Work** mode, and #902 gave the Nemesis front
door that taller Work composer on purpose, because the front door also chooses a project and reaches
the apps. In the thread Nemesis is already 768 x 52 on one row, identical to ChatGPT's chat. Left
alone; the owner reverses it if he wants the shorter box on the front door too.

## 2. The thread

| | ChatGPT | Claude | Gemini | Nemesis |
|---|---|---|---|---|
| answer column | 768 | 736 | 724 | **768** |
| body | 16px / 26px | 16px / 24px | 17px / 24px | **16px / 26px** |
| learner bubble | radius 22, pad 10/16, 16/24, max 70% | radius 12, pad 12/16, 15/20, max 85% | radius 40, pad 20/28, 16px, max 452 | **radius 22, pad 10/16, 16/24, max 70%** |
| bubble fill | `rgb(44,103,50)` | white at 5% | `rgb(23,23,23)` | `--ui-learner-bubble` |
| question to answer | **40px** | 52px | 0px | **90px** |
| answer to its buttons | ~22px | ~0px (inline) | n/a | 16px |
| buttons under an answer | copy, like, dislike, share, retry, more | copy, read aloud, like, dislike, retry, timestamp | copy prompt, edit (on the question) | copy, read aloud, retry |
| composer in thread | 768 x 52, radius 28 | 768 x 48, radius 14 | 660 x 64, radius 32 | **768 x 52, radius 28** |

**The finding.** Nemesis already matches ChatGPT exactly on the numbers that were measured against
it before: the 768 column, 16/26 body, the bubble geometry, and the in-thread composer. Two things
are off: the hole between the question and the answer is 90px against a 40 to 52px reference, and
the answer carries three buttons where ChatGPT and Claude carry six.

## 3. What all four agree on

1. **One column, centred, 720 to 770 wide.** Nobody widens past 768.
2. **Body text 16 to 17px on a 24 to 26px line.** Nobody sets 14px.
3. **The learner's message is a filled bubble on the right; the answer is bare text on the left**,
   with no bubble, no avatar and no name. Gemini is the only one to make the bubble large.
4. **The composer is a single rounded box at the bottom** carrying every control on one row, with
   the + at the far left and send at the far right.
5. **Buttons under an answer appear on hover or after it finishes**, never during.
6. **Nothing decorative sits between the question and the answer.** The reference gap is 40 to 52px.

## 4. What only some do, so it is a choice and not a baseline

- A **Chat | Work** style switch at the top: ChatGPT (Chat | Work, 228.6 x 36) and Claude (Chat |
  Cowork, inside the composer). Gemini has none. Nemesis has Chat | Canvas at **256 x 36**, so it
  is 27px wider than the reference it was drawn from.
- **Suggested next actions** on the start screen: only ChatGPT.
- **A thinking line** before the answer: Claude ("Thought for 3s") and Nemesis. ChatGPT and Gemini
  show nothing on a short answer.
- **Feedback buttons** (like and dislike): ChatGPT and Claude. Gemini and Nemesis have none, and
  in Nemesis that is a standing ruling, not an omission.

## 5. The gap list for Nemesis

1. 🔴 90px between the question and the answer; the reference is 40 to 52. It is not one number:
   36px of it is a row under the bubble holding the edit control, 18px is the turn's own margin,
   and 36px is padding above the answer. ChatGPT and Claude reveal that control on hover, so it
   costs them no height.
2. The Chat | Canvas switch is 256 wide; ChatGPT's is 228.6. The track copied the reference's
   asymmetric label padding, and "Canvas" is longer than "Work", so the equal-width grid took the
   wider half twice.
3. The start composer is 128 tall. Deliberate, see §1; listed here only so nobody re-reports it.
4. Key terms in an answer are not marked at all. This is the one place Nemesis can be BETTER than
   all four rather than equal, and it is being added from the board.
5. Found while measuring, and not a design question: on production the FIRST question of a new
   chat answered nothing, said "That came back empty. Ask again and it will retry.", and left the
   dead question in the thread. Asking again worked. None of the four leaves a dead turn behind.
