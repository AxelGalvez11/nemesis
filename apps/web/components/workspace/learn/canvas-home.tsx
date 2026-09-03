"use client";

// The app's landing surface: a question, a composer, and nothing else.
//
// 🔴 NOT A DASHBOARD. No "Good afternoon", no streak, no "4 sessions today", no cards due. The
// first thing someone sees is the place they type, because the product's whole claim is that
// they should not have to decide which tool they want before they can start. Type, upload or
// record — all three create a Canvas session, and that is the only entry path there is.
//
// 🔴 AND NOT A FILE BROWSER EITHER (owner 2026-08-14, marking a screenshot green above the
// composer and red below it). This surface used to list every canvas the learner had ever made,
// under the reasoning that their durable collection IS their canvases so the landing page should
// be that collection. Two attempts at it — a list below a fold, then a list lifted onto the first
// screen — were both answering the wrong question. A landing page that shows a learner their
// backlog invites them to browse it; the point of the product is that they arrive with something
// to learn and start immediately.
//
// So what remains is what the owner circled: the question, the composer, and the one line saying
// what the composer accepts. Everything else was removed rather than rearranged.

import { advance as advanceRead } from "@/lib/workspace/read-progress";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { NemesisAvatar } from "@/components/avatar/nemesis-avatar";
import { CHARACTER_SILHOUETTE } from "@/lib/character/body";
import { stateForCanvas } from "@/lib/character/stations";
import { useMontage } from "@/components/character/use-montage";
import { usePoke } from "@/components/character/use-poke";
import { Codicon } from "@/components/desktop-ui/codicon";
import { useTheme } from "@/components/theme-provider";
import { ACCEPTED_MATERIAL } from "@/lib/learn/canvas-tasks";
import { createFolder, listFolders, type Folder } from "@/lib/learn/canvas-store";
import { connectionStatus, NOT_CONFIGURED } from "@/lib/workspace/composio-client";
import { CAPABILITY_COPY, COMPOSER_CAPABILITIES, type ComposerCapability } from "@/lib/learn/composer-capability";
import { CANVAS_FILING_FOLDER } from "@/lib/learn/canvas-sources";
import { extractFile, type ExtractedFile } from "@/lib/workspace/chat-attachments";
import { cn } from "@/lib/utils";
import { AddMenuRow, ADD_MENU, useMenuSide } from "./add-menu-row";
import { backspaceClearsToken, CapabilityChip, ProjectToken } from "./capability-chip";
import { AttachmentCard, AttachmentRow, type AttachmentState } from "./attachment-card";
import { ComposerSend } from "./composer-controls";
import { ProjectPicker } from "./project-picker";
import { FileDropOverlay } from "./file-drop-overlay";
import { CanvasRecorder } from "./canvas-recorder";
import { stageArrival } from "@/lib/learn/arrival";
import { LearnHeading } from "./learn-heading";
import { CanvasVoiceBars } from "./canvas-voice-bars";
import { IDLE_REPLY_AUDIO, VoiceBarsGlyph, VoiceSessionGlow, VoiceStopButton } from "./canvas-composer";
import { useVoiceConversation } from "./use-voice-conversation";
import { pastedTextFile } from "@/lib/learn/composer-text";
import { putPending, type PendingAttachment } from "./pending-attachment";
import { RecordingRecoveryNotice } from "./recording-recovery-notice";
import { useCanvasDictation } from "./use-canvas-dictation";

/**
 * How long the composer takes to reach the bottom, and therefore how long the send waits.
 *
 * 🔴 SHORT ENOUGH TO READ AS A RESPONSE, NOT AS A DELAY. This sits in front of a navigation the
 * learner asked for, so every millisecond here is latency they did not ask for.
 *
 * 🔴 320, UP FROM 260 (owner 2026-08-20: *"The chat composer needs to drop smoother"*). At 260 the
 * composer covered most of a screen height in a quarter of a second, which is quick enough to read
 * as a JUMP with a blur rather than as a thing travelling. The extra 60ms is under the threshold
 * where a transition starts to feel like waiting, and it is what the arriving header now waits for.
 */
const DOCK_MS = 320;


/** How big the character is on the front door. Bigger than the canvas dock's resting size,
 *  because here it is the only thing on the page rather than a marker beside a composer. */
// 🔴 IT TRACKS `DOCK_SIZE`, WHICH IS WHY IT MOVED TOO. 64 against a 60px dock; 80 against a 76px
// one (owner 2026-08-26: "make the mascot bigger in the app"). The two are different components on
// different surfaces and the hand-off between them is only invisible while their sizes keep the
// same relationship — grow one alone and the character visibly changes size mid-flight.
const GREETER_SIZE = 80;


/**
 * The text of an element as a person sees it, skipping anything faded out.
 *
 * 🔴 `opacity`, NOT JUST `visibility`. See the call site: the greeting cross-fades between subjects
 * by holding all of them and taking nine to `opacity: 0`, which every built-in text accessor still
 * reports. This is only ever used to copy a label so it can fade rather than be cut, so "what is
 * legible right now" is exactly the right question.
 */
function visibleText(root: HTMLElement): string {
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  let node: Node | null;
  while ((node = walk.nextNode())) {
    const text = node.nodeValue?.trim();
    if (!text) continue;
    let el: HTMLElement | null = node.parentElement;
    let shown = true;
    while (el && shown) {
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) < 0.05) shown = false;
      el = el === root ? null : el.parentElement;
    }
    if (shown) parts.push(text);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function CanvasHome({ accessToken = null, userId }: { accessToken?: string | null; userId: string | null }) {
  const router = useRouter();
  // The character's look is a device preference, the same as the theme and the scale.
  const { accent } = useTheme();
  const [text, setText] = useState("");
  /**
   * Material the learner has picked but not sent.
   *
   * 🔴🔴 REPORTED 2026-08-21: *"it still will automatically send the attachment and not attach to
   * the chat composer so that i can add more."* Picking a file used to `putPending` and navigate in
   * the same breath, so one PDF WAS the whole instruction: no second file, no "focus on chapter 4",
   * no chance to change your mind. A learner with three lecture PDFs had to open three canvases.
   *
   * 🔴 STAGED, NOT ATTACHED. Nothing is uploaded, parsed or paid for until Start — extraction is
   * the expensive step, and a file sitting in a chip has not begun it. Removing one is free, which
   * is the whole reason a chip beats a progress bar here.
   */
  const [staged, setStaged] = useState<File[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  /** The whole page is a drop target, not just the composer — the copy has always said "drop a
   *  file in", and a learner dragging a PDF aims at the page, not at a 28px control. */
  const [draggingOver, setDraggingOver] = useState(false);
  const dictation = useCanvasDictation();
  /** Text typed before dictation started, so switching between talking and the keyboard
   *  mid-sentence throws away neither half. Same contract as the session composer. */
  const typedBefore = useRef("");
  const listening = dictation.listening;

  /** Record mode on the front door. A lecture recorded here has no canvas yet, so it starts one —
   *  the same thing dropping a file here does. */
  const [recording, setRecording] = useState(false);
  const filePicker = useRef<HTMLInputElement>(null);
  const composerBox = useRef<HTMLDivElement>(null);
  /**
   * The text field itself, because ENTER LIVES ON IT.
   *
   * 🔴🔴 THE SEND KEY IS THE FIELD'S OWN `onKeyDown`, so it only fires while the field has focus —
   * and dropping a file focuses NOTHING (measured on production 2026-08-31: `document.activeElement`
   * is BODY before the drop and still BODY after it). A learner who dragged material in and pressed
   * Enter got silence: chips on screen, no upload, no canvas, no error. Owner, 2026-08-31: *"I drop
   * many in today… I didn't even ingest them at all."* Proved as a three-way A/B on the live site —
   * drop+Enter did nothing, drop+click-the-box+Enter worked, drop+Start worked.
   */
  const composerField = useRef<HTMLInputElement>(null);
  /**
   * The read running for each staged file, keyed the way the cards are keyed.
   *
   * 🔴🔴 READING STARTS ON DROP, NOT ON SEND (owner 2026-08-31: *"read them on drop, like
   * chatgpt"*). Measured on production before this: the front door made ZERO network calls while
   * material sat staged, so every second the learner spent typing their question was a second the
   * upload and the parse had not begun. The reference reads while you type; the whole wait then
   * overlaps with something the learner was doing anyway.
   *
   * 🔴 A REF, BECAUSE A PROMISE IS NOT RENDER STATE. What the card draws is `reading`/`ready`/
   * `failed` below; the promise itself is machinery for the handoff, and putting it in state would
   * re-render the composer every time one settled for no visible reason.
   */
  const reads = useRef(new Map<string, Promise<ExtractedFile>>());
  /** What each card should say about itself. Keyed identically to `reads`. */
  const [readState, setReadState] = useState<Record<string, AttachmentState>>({});
  /** How far each card's arc has filled. Keyed identically to `readState`, and never rewound. */
  const [readProgress, setReadProgress] = useState<Record<string, number>>({});
  /** The send is on its way out: the greeting fades and the composer travels down. */
  const [departing, setDeparting] = useState(false);

  // 🔴 IT DOES NOT LEAVE WITH THE GREETING ANY MORE (owner 2026-08-20: "when the chat composer
  // animates downward the blob should also just stay centered with thinking animations"). It
  // used to fade on the same curve as the question, on the reasoning that it belonged to the
  // block with no counterpart on the canvas. Watching the real transition says otherwise: the
  // send is the moment the character has the most to say, and fading it out left the composer
  // travelling alone while a SECOND character faded in on the far side. It stays put and starts
  // thinking instead, so one character carries the whole handoff.
  const greeter = usePoke(stateForCanvas({ thinking: departing, preparing: false, listening }));
  // 🔴🔴 THE MONTAGE RUNS HERE TOO, AND ITS ABSENCE IS MOST OF WHY THE OWNER KEPT SAYING HE COULD
  // NOT SEE IT (2026-08-27: *"its still not doing the expression montage i want"*). It was wired
  // into `CharacterDock` only — the canvas — and this page, the front door, is the surface anyone
  // sees first and sits on longest before typing anything. The character was doing its montage on
  // the one screen the owner was not looking at.
  //
  // 🔴 THE GREETER IS NOT THE DOCK. It renders `NemesisAvatar` directly, so every layer the dock
  // composes has to be repeated here or it does not apply. That is a real seam and this is the
  // second thing to fall through it; `montage.test.ts` now pins both surfaces.
  //
  // 🔴🔴 IT GOES ABSORBED HERE TOO NOW, AND THE CARVE-OUT THAT USED TO STAND HERE WAS WRONG IN ITS
  // OWN WORDS. It read *"this one is on screen for the few seconds between arriving and typing"*,
  // two paragraphs below the note calling this *"the surface anyone sees first and sits on
  // longest before typing anything"*. Both cannot be true, and the second is the one that matches
  // what the front door is for. What the carve-out was actually protecting — that the first
  // seconds are the character looking at you — is now free: `attentionAt` runs off the REST clock
  // and opens on `FOLLOW_MS` of watching, so a character that has just arrived always watches
  // first. A surface-specific exception to a rule about the character is how the two surfaces
  // came to disagree in the first place.
  const greeterFace = useMontage(greeter.state, !departing && !listening, greeter.poking);
  /**
   * Where the composer travels, in px. Measured at the moment of the send; see `start`.
   *
   * 🔴🔴 IT DROPS STRAIGHT DOWN, AND THE SIDESTEP THAT USED TO BE HERE WAS AIMING AT THE RIGHT
   * PLACE AT THE WRONG TIME. The canvas is an immersive surface: it takes the nav rail away, so
   * this page's composer — centred inside a railed column — sits 26px right of where the canvas's
   * composer eventually settles inside the whole window. The old code therefore travelled 26px
   * LEFT on the way down, to land on that eventual position.
   *
   * The flaw is that "eventually" is not "on arrival". The rail is not taken away until
   * `CanvasSurface` mounts and claims the immersive surface in an EFFECT — a frame after the route
   * swap — and the column then animates 52px→0 over 240ms (`[data-pane-shell-animate]`, globals.css).
   * So at the instant of the swap the canvas's own composer is still centred in a railed column, at
   * +26, while this one had just finished travelling to 0. The learner saw the composer arrive,
   * jump 26px right as the page changed, and then slide 26px left again as the chrome caught up.
   * Two corrections to fix an offset that was never wrong.
   *
   * Both ends now measure the SAME rectangle — the surface this page fills, which is the same
   * column the canvas's `<main>` will fill (see `start`). The composer lands exactly where the
   * canvas's composer begins, so the swap shows nothing at all; the rail then slides away and
   * carries both the composer and the character with it, as one deliberate movement of chrome
   * rather than as a correction. `x` is kept because the two rectangles can still differ — a
   * scrollbar, a narrow viewport — and zero is the common case rather than the assumption.
   */
  const greeterBox = useRef<HTMLDivElement>(null);
  /** The two labels that do not survive into a canvas. They exist here only to be MEASURED at the
   *  moment of the send and handed to the arriving canvas, which redraws them where they stood and
   *  fades them out — so they LEAVE rather than being cut. See lib/learn/arrival.ts.
   *  (The learner's own sentence needs no ref of its own: it is `composerField`.) */
  const headingBox = useRef<HTMLDivElement>(null);
  const hintBox = useRef<HTMLParagraphElement>(null);

  // 🔴 THE MENU IS BACK, BECAUSE IT HAS TWO OFFERS AGAIN. It was removed on 2026-08-20 when
  // "record a lecture" was withdrawn and upload stood alone — "a one-item menu is a second click
  // charged for nothing". The Course capability is the second offer (owner, 2026-08-23: *"you
  // can't access the course mode from the landing page"*), so the choice is real again and the
  // state, the ref and the dismiss listeners return with it.
  const [addOpen, setAddOpen] = useState(false);
  // 🔴🔴 "above" — OPTION A, CHOSEN BY THE OWNER FROM FOUR DRAWN ALTERNATIVES, 2026-09-01.
  // *"it should like just be in front of the mascot… it should open up."*
  //
  // 🔴 THIS IS NOT A REVERSAL OF THE DOWNWARD PREFERENCE, IT IS THE THING THAT PREFERENCE WAS
  // SUBSTITUTING FOR. He had already asked for the same outcome — *"the plus icon menu should be
  // in front of mascot"* — and the menu was sent downward instead, because a popover inside the
  // composer card could not paint over the character (see that card's own note). The card now
  // rises while the menu is open, so "in front" is achievable and the direction can be the one he
  // asked for both times.
  //
  // 🔴 IT STILL FLIPS WHEN THERE IS GENUINELY NO ROOM. `menuSide` moves only when the preferred
  // side is too cramped to read as a menu AND the other side is roomier — measured at 326px
  // against 348px of room above on a 760px window, so the ordinary laptop keeps it up.
  const addSide = useMenuSide(addOpen, "above");
  const addMenu = useRef<HTMLDivElement>(null);
  /** The one-shot capability staged on the NEXT send — the same contract as the session
   *  composer's chip (§38: cleared by the send, never a persistent mode). It rides to the canvas
   *  as `&cap=` beside `?ask=`, and the canvas's opening effect consumes both at once. */
  const [capability, setCapability] = useState<ComposerCapability | null>(null);
  /** The project this chat will be filed into, chosen before the canvas exists. Rides as `&folder=`. */
  const [project, setProject] = useState<string | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  /**
   * The chosen project as a row, for the token on the composer's line.
   *
   * 🔴 RESOLVED HERE RATHER THAN CARRIED, so a project renamed in the sidebar while the front door
   * is open shows its new name on the line. `project` is an id for exactly that reason.
   */
  const chosenProject = folders.find((folder) => folder.id === project) ?? null;
  // 🔴 READ ONCE, NOT SUBSCRIBED. The front door is a surface a learner passes through in seconds;
  // the sidebar owns the live list. A stale name here costs nothing — the id is what travels.
  useEffect(() => {
    let alive = true;
    void listFolders(userId).then((rows) => { if (alive) setFolders(rows); });
    return () => { alive = false; };
  }, [userId]);
  /** What the row below the composer shows about connected apps. Read once, same as the folders. */
  const [connections, setConnections] = useState(NOT_CONFIGURED);
  useEffect(() => {
    let alive = true;
    // 🔴 A FAILED READ IS "NOTHING CONNECTED", NOT AN ERROR. Without a key on the server this
    // reports `configured: false`, which is a normal state for a fresh deployment — see
    // `composio-client.ts`. The row simply offers to connect.
    void connectionStatus().then((status) => { if (alive) setConnections(status); }, () => {});
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!addOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (!addMenu.current?.contains(event.target as Node)) setAddOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setAddOpen(false); };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [addOpen]);

  // Dictation writes into the same box typing does — the composer has one value, whatever produced
  // it. Keyed on both flags so the final transcript still lands after recognition stops.
  useEffect(() => {
    if (!dictation.listening && !dictation.transcript) return;
    setText([typedBefore.current, dictation.transcript].filter(Boolean).join(" ").trimStart());
  }, [dictation.listening, dictation.transcript]);

  /**
   * Send, and let the composer travel to where it is about to be.
   *
   * 🔴🔴 THE MOVE IS THE RECEIPT. Owner call, 2026-08-20: "since user prompts aren't supposed to
   * show up as a chat" there is nothing else to acknowledge a send with. Pressing send on the front
   * door used to swap one route for another instantly, and because the learner's own words are
   * never rendered, the only evidence anything happened was the next screen arriving seconds later.
   *
   * 🔴 MEASURED, NOT GUESSED. The distance is read off the composer's real rectangle against the
   * real viewport, because the front door centres its block with `my-auto` — a value that depends
   * on the greeting's height, the window's height, and whether the Library list below it is long
   * enough to push things. Any hard-coded translate would be right at exactly one window size.
   *
   * 🔴 THE NAVIGATION IS DELAYED BY THE LENGTH OF THE MOVE, AND THAT IS THE WHOLE TRICK. The canvas
   * mounts with its composer already docked at the bottom, so if this one arrives there first the
   * two line up and the swap is invisible. Pushing immediately would play the move against a page
   * that had already been replaced.
   */
  /**
   * Material that is not ready to be learned from yet.
   *
   * 🔴🔴 SEND IS BLOCKED UNTIL EVERY STAGED FILE HAS BEEN READ (owner, 2026-08-31: *"block the send
   * button until it process everything all the documents… that just sounds like, to assure
   * quality"*, naming ChatGPT and NotebookLM, both of which do exactly this). The argument that
   * settled it is his: **a file that failed to read would otherwise ride along silently**, and the
   * answer comes back thinner than the learner's material with nothing on screen saying why. A
   * disabled button that explains itself is a better failure than a confident partial answer.
   *
   * 🔴 A FAILURE BLOCKS TOO, AND IT IS NOT A TRAP. "Couldn't read" has two exits on the card
   * itself: Try again, and ×. Letting a failed card through would restore exactly the silent
   * partial send this exists to prevent; refusing to say why would be the trap.
   *
   * 🔴 THE CANVAS COMPOSER IS DELIBERATELY NOT GATED THIS WAY. Owner, 2026-08-27: *"attaching a
   * document mid chat should not immediately make the chat go into processing mode"* (#888). There,
   * attaching is an aside to a conversation already running and the turn waits internally
   * (`settledAttachments`); here, the material IS the thing being started. Same guarantee, two
   * surfaces, and the difference is on purpose.
   */
  const notReady = staged.filter((file) => {
    const state = readState[`${file.name}:${file.size}`];
    return state === "reading" || state === "failed";
  });
  const reading = notReady.some((file) => readState[`${file.name}:${file.size}`] === "reading");
  const blocked = notReady.length > 0;
  /** Why the send is dark, said in the button's own label rather than left to be guessed. */
  const sendLabel = reading
    ? notReady.length > 1
      ? `Reading ${notReady.length} documents…`
      : "Reading your document…"
    : blocked
      ? "One document couldn't be read. Try again or remove it."
      : "Start";

  const start = (options?: { spoken?: boolean }) => {
    // 🔴 THE KEYBOARD OBEYS THE SAME GATE AS THE BUTTON. Enter calls this directly, so a check that
    // lived only on the button's `disabled` would leave the one route the owner's own report came
    // in through wide open.
    if (blocked) return;
    const topic = text.trim();
    // 🔴 THE HANDOVER HAPPENS HERE NOW, NOT WHEN THE FILE WAS PICKED. `putPending` is a module-level
    // stash the canvas claims once, so the files ride across the navigation without a query string —
    // which is what lets the topic keep using one.
    // 🔴 THE READ TRAVELS WITH THE FILE. Each entry carries the `extractFile` call started when the
    // material landed, so the canvas claims a finished result instead of uploading the same bytes
    // again. A file with no read (signed out when it was dropped) hands over `null` and the canvas
    // reads it itself, exactly as it did before any of this existed.
    if (staged.length > 0) {
      putPending(
        staged.map<PendingAttachment>((file) => ({
          file,
          read: reads.current.get(`${file.name}:${file.size}`) ?? null,
        })),
      );
    }
    // A canvas is addressed by query string, and a brand-new one has no id yet — the canvas
    // surface mints it. The opening instruction rides along so the learner does not have to
    // retype what they already said.
    //
    // 🔴 `?new=1` WHEN THERE IS MATERIAL BUT NO TOPIC. Bare `/learn` renders this page, so files
    // staged without a word typed would have been stashed for a canvas that never mounted — and
    // `takePending` clears as it reads, so they would have been silently lost on the next visit.
    //
    // 🔴 THE CAPABILITY RIDES ONLY BESIDE A TOPIC. Send is disabled while a capability is staged
    // with nothing typed (the session composer's own §3 rule, same reason), so the `?new=1` and
    // bare branches never have one to carry — a declaration about words needs the words.
    // 🔴 IT RIDES BOTH DOORS. A chat started from typed words and one started from dropped material
    // are the same new canvas, so a project chosen before either must file either. Only the bare
    // `/learn` — nothing typed, nothing staged — has nothing to file.
    const filing = project ? `&folder=${encodeURIComponent(project)}` : "";
    // 🔴 `&voice=1` RIDES ONLY BESIDE A TOPIC, exactly as `&cap=` does: the modality is a fact
    // about the words, and the loop cannot fire without words (the silence rule watches the
    // transcript). The canvas reads it and ADOPTS the conversation — speaks the reply, then
    // opens the microphone again — so the session survives the route swap.
    const href = topic
      ? `/learn?ask=${encodeURIComponent(topic)}${options?.spoken ? "&voice=1" : ""}${capability ? `&cap=${capability}` : ""}${filing}`
      : staged.length > 0
        ? `/learn?new=1${filing}`
        : "/learn";
    const box = composerBox.current;
    // 🔴 REDUCED MOTION SKIPS THE TRAVEL, NOT THE SEND. Someone who asked the system to stop moving
    // gets the canvas immediately; they must not get a slower version of the same animation.
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!box || still) {
      router.push(href);
      return;
    }
    // 🔴🔴 FOLD FIRST, THEN MEASURE. The start screen's pill is two rows and 128px tall; the canvas
    // composer it becomes is one row and 52px. Measuring before the fold aims the travel with a
    // rectangle 76px taller than the one that actually lands, so the pill would stop 76px low and
    // the swap would show it jump. Setting `departing` collapses it to the one-row form, and the
    // rectangle read on the next frame is the one it will arrive with.
    //
    // 🔴 THE TRANSFORM IS APPLIED ON THIS SAME COMMIT WITH `travel` STILL AT ZERO, WHICH IS WHY THE
    // FOLD IS FREE. `translate3d(0,0,0)` is where the pill already is, so the frame that changes
    // its shape moves it nowhere; the journey starts on the frame after, when `travel` lands.
    setDeparting(true);
    requestAnimationFrame(() => {
    const rect = box.getBoundingClientRect();
    // 🔴🔴 THE SURFACE, NOT THE VIEWPORT, AND THAT DISTINCTION WAS THE WHOLE GLITCH. Both halves of
    // this handoff aim at a centre, and they were aiming at two different ones. This page measured
    // against `window` while the canvas's `CharacterDock` measures against its `offsetParent` —
    // `CanvasSurface`'s `<main>`, which lives in the shell's SECOND grid column. Those two
    // rectangles differ by exactly the nav rail's width (`--nav-rail-width`, 52px) whenever the
    // rail is on screen, which it always is on the front door, because nothing here claims the
    // immersive surface. So the composer and the character were each sent 26px past where the
    // canvas was about to put them, and both then slid back once the canvas had mounted and the
    // rail had collapsed. A move that ends with a correction is not a move.
    //
    // The scroller is `h-full` inside the same column the canvas `<main>` will fill, so its
    // rectangle IS the arrival rectangle, whatever the rail is doing. Measuring it costs one more
    // `getBoundingClientRect` and makes the two surfaces agree by construction rather than by both
    // happening to be full-width.
    // 🔴🔴 THIS SIDE NO LONGER AIMS AT ANYTHING, AND THAT IS THE POINT OF THE REWRITE. Owner chose
    // direction A off the motion study, 2026-09-01: one continuous move, nothing appearing and
    // nothing vanishing. What used to happen here was the opposite in structure even when it looked
    // right for its first 210ms: this page computed where the canvas's composer and character were
    // ABOUT TO BE, flew its own copies most of the way there, and then died — and the canvas faded
    // in from zero over the following 440ms. Measured on production: 300ms of blank screen, and a
    // character that reached its corner without crossing the room.
    //
    // Two rectangles cannot be made to agree across a component that unmounts mid-gesture. So the
    // journey moved: this page measures where its furniture STANDS, hands that over, and leaves on
    // the same frame. `learning-canvas.tsx` paints its own composer and character at these
    // coordinates before its first paint and eases them home, so the destination is the canvas's
    // real layout instead of a prediction of it. `centreStation`, `canvasComposerInset` and
    // `DOCK_CENTRE_SCALE` are no longer imported here for exactly that reason — nothing on this
    // side needs to know what the far side looks like any more.
    const rectOf = (r: DOMRect) => ({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });
    const bot = greeterBox.current?.getBoundingClientRect();
    const said = composerField.current?.getBoundingClientRect();
    stageArrival({
      composer: rectOf(rect),
      // 🔴 A MISSING CHARACTER FALLS BACK TO THE COMPOSER, NOT TO ZERO. An unmeasurable rectangle
      // used to mean "skip the handoff"; with the journey on the far side it would instead mean
      // "fly in from the top-left corner of the window", which is worse than not moving.
      character: bot ? rectOf(bot) : rectOf(rect),
      // Null when nothing was typed. Material dropped on the front door opens a canvas by way of
      // `?new=1`, and there is no sentence to fly.
      say: said && said.width > 0 ? rectOf(said) : null,
      // The two things with no counterpart in a canvas. They are redrawn on the far side purely so
      // they can fade instead of being cut; see `ARRIVAL_LABEL_MS`.
      labels: [headingBox, hintBox]
        .map((ref) => {
          const el = ref.current;
          // 🔴🔴 WHAT IS ACTUALLY ON SCREEN, WHICH IS NEITHER `textContent` NOR `innerText`.
          // `LearnHeading` keeps all ten subjects in the DOM at once and shows one. `textContent`
          // returns every one of them run together — filmed 2026-09-01, the departing copy read
          // "Learn anything.Learn…". `innerText` was the obvious fix and is only half of one: it
          // drops `display:none` and `visibility:hidden` but keeps anything merely TRANSPARENT, so
          // the next film read "Learn anything. Learn  Calculus Biology". The slots are faded, not
          // hidden, so opacity is the property that has to be tested.
          const text = el ? visibleText(el) : "";
          if (!el || !text) return null;
          const style = getComputedStyle(el);
          return { box: rectOf(el.getBoundingClientRect()), colour: style.color, font: style.fontSize, text, weight: style.fontWeight };
        })
        .filter((label) => label !== null),
    });
    // 🔴 IMMEDIATELY, NOT AFTER A TIMER. The old `setTimeout(…, DOCK_MS)` held the route back 320ms
    // so this page could finish its own animation first. Now the animation IS the arrival, so every
    // millisecond spent here is a millisecond the canvas has not started loading in.
    router.push(href);
    });
  };

  /**
   * Material dropped or picked on the front door.
   *
   * 🔴 THIS REPLACES A CONTROL THAT DID NOTHING. The `+` here was labelled "Add material" and its
   * handler was `router.push("/learn")` — the page it was already on. It rendered, it hovered, it
   * accepted the click, and nothing happened. Upload was still reachable one step in (start a
   * canvas, then attach), so nothing was lost; the front door simply lied about having it.
   *
   * `?new=1` is what makes the canvas surface mount instead of this page. It carries no id, so
   * `useCanvasSession(null)` mints a fresh canvas, and the files are claimed once it exists.
   */
  const stageFiles = (files: FileList | readonly File[]) => {
    const picked = Array.from(files);
    if (picked.length === 0) return;
    // 🔴🔴 MATERIAL ARRIVING PUTS THE CARET IN THE BOX, AND THAT IS THE SEND KEY WORKING AT ALL.
    // Enter is the field's own handler (see `composerField`), so until something focuses the
    // field, the most natural gesture after dragging a lecture in — press Enter — is a dead end
    // that reports nothing. It also lands the caret where the screen is already inviting them to
    // type ("Ask Nemesis…"), which is where someone who wants to add an instruction is going next.
    composerField.current?.focus();
    setStaged((current) => {
      // 🔴 DEDUPED BY NAME AND SIZE, because the two ways in overlap. A learner who drops a file and
      // then picks the same one from the dialog has not asked for it twice, and ingesting a lecture
      // deck twice is the most expensive mistake this screen can make.
      const seen = new Set(current.map((file) => `${file.name}:${file.size}`));
      const fresh = picked.filter((file) => !seen.has(`${file.name}:${file.size}`));
      // 🔴 THE READ IS STARTED FROM INSIDE THE UPDATER'S RESULT, over the DEDUPED list, so a file
      // dropped twice is read once. Starting it above, over `picked`, would upload the same deck
      // twice while the cards correctly showed one.
      for (const file of fresh) beginRead(file);
      return [...current, ...fresh];
    });
  };

  /**
   * Start reading one file immediately, and remember the call so the canvas can claim its result.
   *
   * 🔴 THE SAME CHOKEPOINT EVERY OTHER LANE USES (`extractFile` with `keep`), not a second
   * ingestion path. Library import, chat attachments, the syllabus reader and the canvas itself
   * all go through it, which is what makes a document filed here indistinguishable from one filed
   * anywhere else — same row, same parse, same content hash.
   *
   * 🔴 `keep: true`, WHICH MEANS A DROPPED FILE IS A KEPT FILE. Reading on drop and storing on
   * drop are the same act: there is nowhere to put a parse except against a filed row. So a
   * learner who drops a lecture and then changes their mind has still added it to their Library.
   * That is the reference's behaviour and the owner's explicit call (2026-08-31), and it is why
   * removing a card does NOT delete anything: the row is deduped by content hash and may already
   * be cited by another canvas, so a × here that deleted would be a × that reaches into work it
   * cannot see.
   *
   * 🔴 SIGNED OUT, NOTHING STARTS. `userId` is null before auth resolves; the card then simply
   * waits at "Reading…" and the canvas does the read itself after send, which is the old
   * behaviour and still correct.
   */
  const beginRead = (file: File) => {
    if (!userId) return;
    const key = `${file.name}:${file.size}`;
    if (reads.current.has(key)) return;
    setReadState((current) => ({ ...current, [key]: "reading" }));
    setReadProgress((current) => ({ ...current, [key]: 0 }));
    // 🔴 EVERY STOP IS A STEP THAT FINISHED, never a timer — see `lib/workspace/read-progress.ts`.
    const run = extractFile(file, userId, {
      folderPath: CANVAS_FILING_FOLDER,
      keep: true,
      onPhase: (phase) => setReadProgress((current) => ({ ...current, [key]: advanceRead(current[key] ?? 0, phase) })),
    });
    reads.current.set(key, run);
    // 🔴 THE STATE HANDLER IS ALSO WHAT MARKS THE PROMISE HANDLED. Without it a read that fails
    // while the learner never sends would surface as an unhandled rejection in their console. The
    // rejection still reaches the canvas if they DO send, because that awaits `run` itself.
    void run.then(
      () => {
        setReadProgress((current) => ({ ...current, [key]: 1 }));
        setReadState((current) => ({ ...current, [key]: "ready" }));
      },
      // 🔴 THE ARC STAYS WHERE IT DIED. A full circle behind "couldn't read" is a card arguing
      // with itself; the failed state repaints the same arc red.
      () => setReadState((current) => ({ ...current, [key]: "failed" })),
    );
  };

  const startDictation = () => {
    typedBefore.current = text;
    dictation.reset();
    dictation.start();
  };

  /** × — throw the capture away and put the composer back as it was. */
  const cancelDictation = () => {
    dictation.stop();
    dictation.reset();
    setText(typedBefore.current);
  };

  /** ✓ — accept what was heard. It lands in the composer as editable text and does NOT start a
   *  canvas: speech recognition mishears, and auto-submitting would open a canvas on a topic the
   *  learner never said. */
  const acceptDictation = () => dictation.stop();

  // ── The voice conversation, from the front door ─────────────────────────────
  // Owner, 2026-08-31: *"by the landing page i meant the webapp landing chat."* Same loop, same
  // microphone, same silence rule as the session composer — but no reply ever plays HERE: the
  // auto-send STARTS the canvas, and the canvas adopts the session (see `&voice=1` in `start`).
  // `departing` stands in for busy, so the quiet-turn grace cannot re-open the microphone while
  // the pill is already travelling; the route swap unmounts everything a beat later.
  const voiceLoop = useVoiceConversation({
    busy: departing,
    dictation,
    replyAudio: IDLE_REPLY_AUDIO,
    submit: () => {
      if (blocked) return "retry";
      if (!text.trim() && staged.length === 0) return "retry";
      start({ spoken: true });
      // 🔴 THE TRANSCRIPT IS SPENT WITH THE SEND (canvas-composer's own rule, PR #979): this
      // pill stays mounted while it folds and travels, and the sync effect above would paint
      // the sent words straight back into it for the whole journey.
      if (dictation.transcript) dictation.reset();
      typedBefore.current = "";
      return "sent";
    },
  });

  return (
    <main
      className="relative h-full min-h-0 bg-(--ui-bg-editor)"
      onDragLeave={(event) => {
        // 🔴 GUARDED BY `currentTarget`. Dragging across a child fires dragleave on the parent, so
        // an unguarded handler flickers the highlight off and on for the whole traversal.
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDraggingOver(false);
      }}
      onDragOver={(event) => {
        // Only a file drag. Dragging selected TEXT across the page must not offer to ingest it.
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setDraggingOver(true);
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.files.length) return;
        event.preventDefault();
        setDraggingOver(false);
        stageFiles(event.dataTransfer.files);
      }}
      style={{ ["--canvas-column" as string]: "822px" }}
    >
      {/* 🔴 THE RING NOW COMES WITH A SENTENCE. It used to be the whole feedback — a 2px accent
          outline and nothing else, which says "this is a target" and never says what dropping
          does. `FileDropOverlay` keeps the ring and adds the answer. Not a modal: the page stays
          readable underneath and nothing has to be dismissed if the learner changes their mind
          mid-drag. */}
      {draggingOver && <FileDropOverlay note="Drop your material here and Nemesis will start from it" />}
      {/* 🔴 ONE SCREEN, AND THE CANVASES ARE ON IT (owner 2026-08-14: "remove the scrolldown to see
          canvases list"). This was a full-viewport first screen with the learner's own canvases
          underneath, so their work was invisible until they scrolled — and the previous pass tried
          to fix that by leaving a 56px sliver peeking, which is a hint about scrolling drawn in
          layout rather than written in words. The honest fix was to stop hiding them.
          🔴 THE COMPOSER IS IN NORMAL FLOW NOW, AND THE DOCKING MACHINERY IS GONE WITH IT. It was
          absolutely positioned and morphed between two positions as the page scrolled; with
          nothing below the fold there is no scroll to track, no second position to morph to, and
          no `--first-screen-lift` for the two of them to share. A moving part that exists to
          manage a problem the page no longer has is just a moving part.
          🔴 THE BLOCK IS CENTRED, NOT PUSHED DOWN FROM THE TOP (owner 2026-08-15: "composer is not
          centered"). It was `pt-[18vh]`, which is not a centring rule — it is a fixed fraction of
          the viewport, so the greeting and composer sat wherever 18% happened to land and the space
          left underneath was whatever remained. Measured against the reference at the same width:
          it balances its block almost exactly, 264.9px above and 264.1px below — 1 : 1.00. Ours was
          130.9 above and 417.6 below, 1 : 3.19, so the whole composition hung in the upper third
          with a void beneath it. `18vh` also could not be right at two viewport heights at once.
          🔴 `my-auto`, NOT `justify-center`. Auto margins centre while there is free space and
          collapse to zero when there is not, so a short viewport scrolls from the true top of the
          greeting. `justify-center` on a scroll container centres past the top edge instead, and
          the overflowing part becomes unreachable — the greeting would be the part it ate. */}
      <div className="flex h-full flex-col items-center overflow-y-auto px-6 py-12" ref={scroller}>
        <section className="my-auto flex w-full flex-col items-center">
          {/* 🔴 THE GREETING LEAVES FIRST, AND FASTER THAN THE COMPOSER TRAVELS. It is the one
              thing on this page with no counterpart on the canvas, so carrying it down would mean
              animating it out at the far end instead. Fading it here makes the composer the only
              thing that survives the transition, which is exactly what the learner should be
              following with their eye. */}
          {/* 🔴 A GREETER, NOT THE DOCK. Everywhere else the character is parked lower-left
              above a composer pinned to the foot of the page; this composer is centred in normal
              flow, so a corner dock would put it in an empty corner far from the only thing on
              screen. It stands above the question instead, which is where the eye already is.

              🔴 AND IT DOES NOT LEAVE — IT WALKS TO THE MIDDLE. This comment used to say the
              opposite ("it leaves with the greeting, on the same curve"), which was already
              overruled once (see `greeter` above: it stays put and starts thinking) and is now
              overruled again in the direction that finishes the job. Staying put was better than
              fading, and still left a step: the character sat where the greeting had been while
              the canvas's own character mounted somewhere else entirely. It now travels, on the
              composer's beat, to the exact point the dock is about to occupy — so the swap
              between the two components has nothing left to show. See `handoff`.

              🔴🔴 AND IT ARRIVES FACING YOU. This used to pass `entrance`, which turns the head a
              full 360° on the way in — the eyes go right round the body and come back. It was the
              one place that was defensible, and it is gone on the owner's 2026-08-28 instruction:
              *"remove the spinning animation."* That sentence is about the click (see `use-poke.ts`)
              and this is the only other thing in the app that spins, so leaving it would have
              answered half a sentence. It also sat badly beside every other ruling made about this
              character in the same week: the entrance is a full second with NO FACE, on the first
              character anyone ever sees, and the standing complaint has been that it looks away.
              🔴 One prop to restore. `entrance` still exists and is still off by default. */}
          {/* 🔴 THE HOP GETS ITS OWN ELEMENT HERE TOO, AND FOR THE SAME REASON AS IN `CharacterDock`:
              the wrapper above already carries the greeting's own margin and its departure, so a
              jump written onto it would have to share a transform with the transition. Nested
              elements multiply, so each keeps one job. See `use-poke.ts` for what a poke draws. */}
          {/* 🔴 `z-30` MATCHES `.character-dock`'s, so the character passes OVER the composer on its
              way to the middle rather than under it — the composer is travelling the other way
              and the two cross. `relative` is what makes the z-index apply at all. */}
          {/* 🔴🔴 THE TRAVEL AND THE FADE BOTH MOVED TO THE CANVAS (direction A, owner 2026-09-01),
              AND THE COMMENTARY ABOVE IS KEPT BECAUSE IT RECORDS WHY THREE EARLIER ANSWERS WERE
              WRONG. In order, this character has: left with the greeting; stayed put and started
              thinking; walked to a point this file computed for the far side while fading out. The
              third was the closest and still could not work, because it required this page to
              predict the canvas's layout and then die before the prediction could be checked. It
              now does none of them. It stands still and is MEASURED (`greeterBox` above, read in
              `start`), and the canvas's own dock is the thing that walks — from here to its corner,
              in one move, in a tree that is still alive when the move finishes. */}
          <div className="relative z-30 mb-5" ref={greeterBox}>
            {/* 🔴🔴 THE CHARACTER NO LONGER STEPS ASIDE FOR THE `+` MENU, AND THE REASON IS THAT THE
                MENU NO LONGER REACHES IT. Owner, 2026-08-30, seeing the menu clip the greeter's
                corner: *"opening the plus icon … should not go behind the mascot because it kinda
                looks messy"*; the answer at the time was to fade the character out while the menu
                was open. That answer was wrong in a way only the second report showed — owner,
                2026-09-01: *"the plus menu causes the mascot to disappear (the plus icon menu show
                be infront of mascot)."*

                🔴 AND RAISING THE MENU'S Z-INDEX COULD NEVER HAVE FIXED IT, which is why hiding the
                character looked like the only move. The composer card is `relative z-[1]`, so it
                opens a stacking context; a popover INSIDE it is pinned to level 1 against this
                greeter's `z-30` whatever z-index the popover gives itself. The menu now opens
                DOWNWARD, below the composer, where the character is not — the reference's own
                placement on this same screen — so there is nothing left to fade and no z-order to
                win. See the `+` wrapper below. */}
            <div
              className={greeter.motion === "jump" ? "character-jump" : greeter.motion === "spin" ? "character-spin" : undefined}
            >
              {/* 🔴 `facing` MUST MATCH THE DOCK'S, AND THE HAND-OFF IS WHY IT IS NOT OPTIONAL.
                  This character flies into the canvas and BECOMES the dock's character; if the two
                  ends disagreed about facing, the head would swing about 28° at the exact frame of
                  the route swap — a fresh version of the glitch the whole handoff sequence was
                  rebuilt to remove. Both were `"forward"`; both are `"free"` since 2026-08-27.
                  `character-place.test.ts` pins that they agree. See the prop's own note.

                  🔴 AND `track` IS NOT A CONSTANT ANY MORE. The cursor is let go of for exactly
                  as long as a face is on — the other half of the owner's 2026-08-30 rule, which
                  the hook cannot enforce on its own (see `Montage.absorbed`). A flat `track`
                  here is precisely what the bug looked like. */}
              <NemesisAvatar
                accent={accent}
                face={greeter.face}
                onPoke={greeter.poke}
                size={GREETER_SIZE}
                animation={greeterFace.state}
                facing="free"
                silhouette={CHARACTER_SILHOUETTE}
                track={!greeterFace.absorbed}
                waggle={greeter.motion === "waggle"}
              />
            </div>
          </div>
          {/* 🔴 THE GREETING NAMES THE THING THE PRODUCT DOES — owner, 2026-09-01. It asked a
              question and waited; it now says "Learn calculus" with the subject changing under it,
              across ten faculties. See learn-heading.tsx for why the list is what it is. */}
          <LearnHeading departing={departing} ref={headingBox} />
          {/* 🔴 NO TRANSFORM AND NO TRANSITION ANY MORE. This used to fly itself to a rectangle it
              had computed for the canvas's composer and then unmount mid-flight. `departing` still
              fires, and still does the one thing it was always needed for a frame BEFORE the
              measurement: it folds this two-row pill down to the canvas's one-row shape, so the
              rectangle handed over is the shape that actually arrives rather than one 76px taller.
              The travel itself is the canvas's now. See lib/learn/arrival.ts. */}
          <div className="mt-9 flex w-full flex-col items-center" ref={composerBox}>
        {/* 🔴 THE RECORDER REPLACES THE COMPOSER, IT DOES NOT SIT BESIDE IT. While a lecture is
            being captured there is exactly one thing to do; leaving the text box live underneath
            offers a second. Same position, same width. */}
        {/* 🔴🔴 THE CHIPS SIT ABOVE THE PILL, NOT INSIDE IT. Owner, 2026-08-20: *"i dont want the
            attachments to be above the composer"* — which was about the canvas session's composer,
            where a file row pushed the text box down the screen every time one landed. This is the
            front door, the pill is already centred in open space, and a row that grows here pushes
            nothing: the block is centred as a whole. Putting them inside a 52px pill would shrink
            the text field to nothing at two files.

            🔴 AND THEY ONLY EXIST WHILE SOMETHING IS STAGED, so the resting front door is byte for
            byte what it was — one greeting, one composer, one line of help. */}
        {recording ? (
          <div className="pointer-events-auto w-full max-w-[var(--composer-max-width)]">
            <CanvasRecorder
              // No canvas exists yet on the front door, so a finished recording STARTS one — the
              // identical thing dropping a file here does, through the identical door.
              attach={async (files) => { stageFiles(files); setRecording(false); }}
              onClose={() => setRecording(false)}
            />
          </div>
        ) : (
        // Was 770 × 54 at radius 27, hand-tuned within 2px of the reference's 768 × 52 at 28.
        // Reading the tokens instead is what keeps it aligned with the Library frame below it.
        //
        // 🔴 `relative z-[1]`: the project/apps tray tucks 20px UNDER this pill (see TRAY in
        // project-picker.tsx); without a stacking order the tray, a later sibling, would wash the
        // pill's bottom edge with its translucent grey — 8% white in dark, visibly.
        // 🔴🔴🔴 AND `z-40` WHILE THE MENU IS OPEN, WHICH IS THE FIX THE DOWNWARD MENU WAS
        // STANDING IN FOR. The note above the greeter said raising the MENU's z-index "could never
        // have fixed it", and that was exactly right and only half the sentence: a popover inside
        // this card is pinned to level 1 against the greeter's `z-30` however high it sets its own
        // z-index — because the trap is THIS element's stacking context, not the popover's number.
        // So the thing to raise is the CARD.
        //
        // Owner, twice: *"the plus icon menu should be in front of mascot"* (2026-09-01), then
        // *"it should like just be in front of the mascot… it should open up"* after choosing
        // option A from four drawn alternatives. Opening downward was a way to have no z-order to
        // win; this gives the card the z-order instead, and the menu opens upward over the
        // character exactly as asked.
        //
        // 🔴 ONLY WHILE OPEN, AND THE INTERNAL ORDER IS UNTOUCHED. `relative z-[1]` exists so the
        // project/apps tray tucks under this pill; raising the WHOLE subtree keeps the pill above
        // the tray, because their order is decided inside this context and nothing here changes
        // that. At rest the card returns to level 1, so nothing else on the screen is reordered
        // for a menu that is not on screen.
        <div className={cn(
          "pointer-events-auto relative flex w-full max-w-[var(--composer-max-width)] flex-col rounded-[var(--composer-radius)] bg-(--composer-fill) shadow-[var(--composer-edge)]",
          addOpen ? "z-40" : "z-[1]",
        )}>
          {/* The session's lamp — the same component, the same subtle tuning, the same gate as
              the canvas composer's. It rides the fold and the travel with the pill. */}
          {voiceLoop.active && <VoiceSessionGlow />}
          {/* 🔴🔴 INSIDE THE BOX, LIKE THE CANVAS COMPOSER AND LIKE THE REFERENCE. These were a row
              of detached pills floating ABOVE the composer — which is both what the owner said he
              did not want on 2026-08-20 and what does not match. The pill became a card because a
              pill says "tag" and a card with a type line under the name says "file"; the geometry
              is measured off a real ChatGPT file card, see `attachment-card.tsx`.
              🔴 AND THE BOX IS A COLUMN NOW, WHICH IS THE ONLY STRUCTURAL CHANGE. It was a single
              centred row, so there was nowhere inside it for anything to sit above the input. The
              row's own classes moved unchanged onto the inner element below, so the composer's
              shape, height and padding are exactly what they were. */}
          {!recording && staged.length > 0 && (
            <AttachmentRow>
              {staged.map((file) => (
                <AttachmentCard
                  className="max-w-[260px] shrink-0"
                  key={`${file.name}:${file.size}`}
                  name={file.name}
                  // 🔴 REMOVING FORGETS THE READ TOO. Without this, dropping the same file again
                  // after removing it finds its old entry in `reads`, so `beginRead` declines to
                  // start — and a card that failed the first time would sit at "Couldn't read"
                  // holding the send with nothing actually running behind it.
                  onRemove={() => {
                    const key = `${file.name}:${file.size}`;
                    reads.current.delete(key);
                    setReadState((current) => {
                      const { [key]: gone, ...rest } = current;
                      return rest;
                    });
                    setStaged((current) =>
                      current.filter((entry) => entry.name !== file.name || entry.size !== file.size),
                    );
                  }}
                  // 🔴 THE WAY OUT OF A BLOCKED SEND, on the card that is blocking it. `beginRead`
                  // refuses a file it has already started, so the previous attempt is forgotten
                  // first — otherwise Try again would silently do nothing, which is the worst
                  // possible control to put next to an error.
                  onRetry={() => {
                    reads.current.delete(`${file.name}:${file.size}`);
                    beginRead(file);
                  }}
                  // 🔴 THE CARD IS WHERE PROGRESS BELONGS, one line per file. A single composer-wide
                  // "reading your files" would be a lie the moment one of three finishes.
                  progress={readProgress[`${file.name}:${file.size}`] ?? 0}
                  state={readState[`${file.name}:${file.size}`] ?? "ready"}
                />
              ))}
            </AttachmentRow>
          )}
          {/* 🔴🔴 TWO ROWS ON THE START SCREEN, ONE ROW EVERYWHERE ELSE (owner 2026-08-29: *"I want
              our composer to look better. I mean, bigger like that one"*, pointing at ChatGPT's
              Work mode). Measured there the same day: 768 x 128, the words on their own line 15px
              down and 18px in, the controls on a 36px row along the bottom. The canvas keeps the
              52px row — the reference is short there too, and 128px inside a conversation costs
              76px of the answer on every screen.

              🔴 IT FOLDS BACK TO ONE ROW THE INSTANT THE SEND STARTS, AND THAT IS LOAD-BEARING.
              This pill travels down and the route swaps under it; the canvas's own composer is
              52px. A 128px pill replaced by a 52px one at the end of the journey is a 76px pop on
              the one seam the whole handoff sequence exists to make invisible. Folding at the START
              of the 320ms travel, while the greeting is fading and everything is already moving,
              is the same change made where nobody is looking — and it lets `start()` measure the
              rectangle it will actually land with. See `start`.

              🔴 GRID, NOT REORDERED JSX. The children are unchanged and in the same order; only
              their placement moves. `grid-area` is inert inside a flex container, so the one-row
              form needs no undoing and the two forms cannot drift apart. */}
          <div
            className={cn(
              "gap-0 px-[var(--composer-pad-x)]",
              departing
                // 🔴 BOTTOM-ALIGNED BECAUSE THE PILL IT FLIES INTO IS (owner 2026-08-31). The
                  // canvas composer's controls sit on the floor of the box so they cannot drift as
                  // it grows; this is the same pill mid-flight, so a centred row here would pop at
                  // the instant of the route swap — the exact defect the shared tokens beside it
                  // were introduced to end.
                  ? "flex min-h-[var(--composer-min-height)] items-end py-[8px]"
                : cn(
                    "grid min-h-[var(--composer-tall-height)]",
                    // 🔴 THE WORDS SPAN EVERY COLUMN. Placed after an `auto` column that the `+`
                    // sizes, the text line started 54px in against the reference's 18 — the button
                    // below it was reserving a track on the line above.
                    "grid-cols-[1fr_auto_auto] grid-rows-[1fr_var(--composer-control)]",
                    "[grid-template-areas:'text_text_text''add_mic_send']",
                    "pt-[var(--composer-tall-pad-top)] pb-[var(--composer-tall-pad-bottom)]",
                  ),
            )}
          >
          {/* 🔴 A REAL FILE INPUT, NOT A BUTTON THAT ROUTES. `sr-only`, never `hidden`: a hidden
              input leaves the tab order and the accessibility tree, which makes the label wrapping
              it unreachable by keyboard — the same rule the session composer's attach control
              carries, for the same reason. */}
          <input
            accept={ACCEPTED_MATERIAL}
            className="sr-only"
            multiple
            onChange={(event) => {
              if (event.target.files?.length) stageFiles(event.target.files);
              event.target.value = "";
            }}
            ref={filePicker}
            tabIndex={-1}
            type="file"
          />
          {/* 🔴🔴 THE ROWS COME FROM THE LIST, AND THAT IS THE DEFECT THIS FIXES. The capability
              row used to be written out once, by name, as `setCapability("course")`. So when Deep
              research was added to `COMPOSER_CAPABILITIES` (#824) and to the session composer, the
              front door kept offering exactly one capability and nothing failed — the owner opened
              the `+` on the landing page, saw Upload material and Course, and asked where Deep
              research was. It was in the canvas, reachable only by someone already inside one.

              A hard-coded row cannot be wrong about itself, which is precisely why it is dangerous:
              it silently stops being the whole menu. `canvas-composer.tsx` already builds its `+`
              by looping its offers for the same reason, in a comment that predicted this exact
              shape of miss. This surface now does too, so a third capability appears in both
              places or in neither. `front-door-capabilities.test.ts` pins it.

              The capability row STAGES and starts nothing — §38's rule that a capability is a
              declaration, never a mode. */}
          {/* 🔴🔴 NOT `relative` — THE MENU IS ANCHORED TO THE COMPOSER, NOT TO THIS BUTTON, AND
              THAT IS THE WHOLE FIX. Owner, 2026-09-01, circling this region: *"there is a spacing
              issue as circled."* The popover was placed `bottom-[52px]` from the `+`, which was
              correct while the front door's composer was one 52px row and became wrong the day
              #902 made it 128px tall: 52px up from a button sitting on the FLOOR of a 128px box
              lands INSIDE the box, so the menu covered its own composer, then the heading, then the
              character. Dropping `relative` here makes the nearest positioned ancestor the composer
              card itself, so `top-full` means "below the whole pill" at any height it ever grows
              to. Measured on the reference the same day: card 768x128 at radius 28, menu top edge
              exactly 8px below the card's bottom, left edges flush. */}
          <div className="shrink-0 justify-self-start self-end [grid-area:add]" ref={addMenu}>
            <button
              aria-expanded={addOpen}
              aria-haspopup="menu"
              aria-label="Add"
              className="flex size-[var(--composer-control)] shrink-0 items-center justify-center rounded-full text-(--ui-text-primary) hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary) focus-visible:outline focus-visible:outline-2 focus-visible:outline-(--ui-action)"
              onClick={() => setAddOpen((open) => !open)}
              title="Add"
              type="button"
            >
              <Codicon name="add" size="var(--composer-icon)" />
            </button>
            {addOpen && (
              <div
                // 🔴 BELOW BY PREFERENCE, NOT BY DECREE. Below is the reference's placement on this
                // screen and the only one that leaves the character alone, but at 1280x760 an
                // eight-row menu ran 61px past the bottom of a page that does not scroll. It flips
                // when it has to, and `maxHeight` makes a cramped window scroll instead of cut.
                className={cn("absolute left-0", addSide.side === "below" ? "top-full mt-[8px]" : "bottom-full mb-[8px]", ADD_MENU)}
                ref={addSide.ref}
                style={{ maxHeight: addSide.maxHeight }}
                // 🔴 THE SENTINEL THE CHARACTER'S DOCK MEASURES, carried here so the front door and
                // the session composer describe an open menu the same way. See its note in
                // `canvas-composer.tsx`; renaming it re-creates that clash silently.
                data-canvas-composer-popover=""
                role="menu"
              >
                <AddMenuRow
                  detail="From your computer"
                  icon="file"
                  label="Upload material"
                  onClick={() => { setAddOpen(false); filePicker.current?.click(); }}
                />
                {COMPOSER_CAPABILITIES.map((offered) => (
                  <AddMenuRow
                    detail={CAPABILITY_COPY[offered].detail}
                    icon={CAPABILITY_COPY[offered].icon}
                    key={offered}
                    label={CAPABILITY_COPY[offered].label}
                    onClick={() => { setAddOpen(false); setCapability(offered); }}
                    tint={CAPABILITY_COPY[offered].tint}
                  />
                ))}
              </div>
            )}
          </div>
          {listening ? (
            voiceLoop.active ? (
              <>
                {/* 🔴 IN A VOICE CONVERSATION THE WORDS THEMSELVES ARE THE FEEDBACK — the same
                    live treatment the canvas composer ships: "Listening…" until the first words,
                    then the words as heard, italic and softened, no caret. The waveform stays
                    the DICTATION treatment, where the learner reviews before sending. */}
                <div className="ml-[12px] flex max-h-[78px] min-w-0 flex-1 items-end self-center overflow-hidden">
                  {text.trim() ? (
                    <p className="w-full text-[length:var(--canvas-text-body)] italic leading-[26px] [color:color-mix(in_srgb,var(--ui-text-primary)_72%,transparent)]">
                      {text}
                    </p>
                  ) : (
                    <p className="w-full text-[length:var(--canvas-text-body)] leading-[26px] text-(--ui-text-quaternary)">Listening…</p>
                  )}
                </div>
                <VoiceStopButton className="ml-[10px] self-center" onClick={voiceLoop.end} />
              </>
            ) : (
            <>
              <div className="ml-[12px] flex min-w-0 flex-1 items-center">
                <CanvasVoiceBars live />
              </div>
              <button
                aria-label="Cancel dictation"
                className="flex size-[var(--composer-control)] shrink-0 items-center justify-center rounded-full text-(--ui-text-primary) hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
                onClick={cancelDictation}
                title="Cancel dictation"
                type="button"
              >
                <Codicon name="close" size="var(--composer-icon)" />
              </button>
              <button
                aria-label="Finish dictation"
                className="ml-[10px] flex size-[var(--composer-control)] shrink-0 items-center justify-center rounded-full bg-(--ui-action) text-(--ui-bg-editor) transition-opacity hover:opacity-90"
                onClick={acceptDictation}
                title="Finish dictation"
                type="button"
              >
                <Codicon name="check" size="var(--composer-icon)" />
              </button>
            </>
            )
          ) : (
            <>
              {/* The staged capability, inline where the words will start — the same COMPONENT the
                  session composer uses now, because it is the same declaration one screen earlier
                  and the two hand-written copies had already drifted. It is removed with Backspace,
                  not with a ✕; see `capability-chip.tsx` for the measurement that decided that. */}
              {/* 🔴 ONE CELL FOR THE WHOLE TEXT LINE. The staged capability and the words share a
                  line; two grid items cannot share one area, so they share a wrapper instead. It is
                  a flex row in both forms, so the one-row composer is unchanged by it. */}
              <div
                className={cn(
                  // 🔴🔴 `items-start`, NOT `items-center`, AND THAT ONE WORD WAS THE MISALIGNMENT
                  // IN THE OWNER'S SCREENSHOT (2026-09-01: *"the spacing is still bad… fix that
                  // spacing and alignment"*). The chip and the input are built to share a line —
                  // both are `text-[16px] leading-[26px]`, and `capability-chip.tsx` says so in its
                  // own header. But the INPUT is a 42px box with 16px of padding below its line
                  // (the reference's own field), so its words sit in the top 26px while
                  // `items-center` centred the 26px chip in the full 42. The chip landed 8px below
                  // the words it is supposed to be part of.
                  //
                  // 🔴 THE TWO MEASUREMENTS WERE BOTH RIGHT AND THE ALIGNMENT BETWEEN THEM WAS
                  // NEVER MADE. Aligning to the top makes two equal line boxes start together,
                  // which is what shared a line means; centring only agrees when the boxes are the
                  // same height, and here one carries the reference's padding and the other does not.
                  "flex min-w-0 flex-1 items-start",
                  // 🔴 10px EACH SIDE, ON TOP OF THE BOX'S OWN 8. The reference insets its text
                  // column 18px from BOTH edges (its field measures 732 inside a 768 box); ours
                  // had the left inset only, so the caret line ran 10px wider than theirs and the
                  // last character sat closer to the corner than the first. Measured 2026-08-29.
                  departing ? "" : "mx-[10px] self-start [grid-area:text]",
                )}
              >
              {/* 🔴 THE PROJECT SITS ON THE LINE, AHEAD OF THE CAPABILITY AND AHEAD OF THE WORDS
                  (owner, 2026-09-03: *"compare with ChatGPT because it looks different when you add
                  it"*). Measured on chatgpt.com the same day: choosing a project puts an inline
                  token at the head of the paragraph you are typing into, not a chip on a strip
                  below. It is the same component the capability already uses, because it is the
                  same object — see capability-chip.tsx for the measurement.
                  🔴 PROJECT FIRST, THEN CAPABILITY, and the Backspace order below depends on it. */}
              {chosenProject && <ProjectToken icon={chosenProject.icon} name={chosenProject.name} />}
              {capability && <CapabilityChip capability={capability} />}
              <input
                // §46.3-exempt: iOS Safari zooms the viewport on focus below 16px
                // 🔴 A LITERAL, NOT `--canvas-text-body`, EVEN THOUGH THAT TOKEN IS ALSO 16px TODAY.
                // The two agree by coincidence, not by contract: the token is a typographic choice
                // and may be retuned, while 16 here is a hard platform threshold — below it iOS
                // Safari zooms the whole viewport in on focus and there is no way back out that
                // reads as intentional. Binding this to the scale would make a future type tweak
                // silently break input focus on every iPhone. The session composer carries the same
                // literal for the same reason.
                // 8px after the control, matching the reference's gap — it was 12, which pushed the
                // caret 4px further from the `+` than the `+` sits from the pill's own edge.
                className={cn(
                  "min-w-0 flex-1 bg-transparent text-[16px] text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-quaternary)",
                  // 🔴 10px, NOT 8. The control row is inset by `--composer-pad-x` (8px) because
                  // that is where the reference puts its buttons; its TEXT is 18px in. 8 + 10 = 18.
                  // 🔴 42 TALL WITH 16 OF IT BELOW THE LINE, WHICH IS THE REFERENCE'S OWN FIELD.
                  // Theirs is a 26px line with `padding-bottom: 16` inside a 42px box; ours was a
                  // bare 26px box, so the words sat 16px closer to the controls than theirs and the
                  // composer read as tighter even though its outer height matched to the pixel.
                  departing ? "ml-[var(--composer-pad-x)]" : "h-[42px] pb-[16px] leading-[26px]",
                )}
                onChange={(event) => {
                  setText(event.target.value);
                  typedBefore.current = event.target.value;
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    start();
                  }
                  // 🔴 BACKSPACE AT THE HEAD OF THE LINE TAKES THE CAPABILITY OFF IT, which is the
                  // reference's own gesture and the reason its pill needs no ✕ (owner, 2026-09-01:
                  // *"user should be able to backspace to delete the mode"*). `preventDefault` so
                  // the same keypress cannot also eat a character of a sentence the learner walked
                  // the caret back through.
                  const clears = backspaceClearsToken(event, { capability, project: chosenProject });
                  if (clears) {
                    event.preventDefault();
                    if (clears === "capability") setCapability(null);
                    else setProject(null);
                  }
                }}
                // 🔴 THE SAME PASTE RULE THE CANVAS COMPOSER CARRIES, FROM THE SAME FUNCTION. This
                // field is one line, so a pasted syllabus would fill it with a sliver of itself and
                // hide the rest; `stageFiles` is this door's `onFiles`, and a paste that still fits
                // is left alone. Two doors, one rule — a per-door copy is exactly the drift the
                // `+` menu's own comment in this file records being bitten by.
                onPaste={(event) => {
                  if (event.clipboardData.files.length > 0) return;
                  const file = pastedTextFile(event.clipboardData.getData("text/plain"));
                  if (!file) return;
                  event.preventDefault();
                  stageFiles([file]);
                }}
                placeholder={capability ? CAPABILITY_COPY[capability].prompt : "Ask Nemesis…"}
                ref={composerField}
                value={text}
              />
              </div>
              {dictation.supported && (
                <button
                  aria-label="Dictate"
                  className="flex size-[var(--composer-control)] shrink-0 items-center justify-center self-end rounded-full text-(--ui-text-primary) hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary) [grid-area:mic]"
                  onClick={startDictation}
                  title="Dictate"
                  type="button"
                >
                  <Codicon name="mic" size="var(--composer-icon)" />
                </button>
              )}
              {/* 🔴 THE SAME CONTROL AS THE SESSION COMPOSER'S, not a second one that looks similar.
                  This was a plain transparent circle while the canvas's was a filled accent one, so
                  the primary action changed appearance between the front door and the room behind
                  it. See `ComposerSend`. */}
              {/* 🔴 MATERIAL ALONE IS ENOUGH TO SEND. Requiring text would make a staged file
                  unsendable, which is the old behaviour with an extra step rather than a fix.
                  🔴 EXCEPT UNDER A STAGED CAPABILITY, which is a declaration ABOUT words — the
                  session composer's own rule, held here so the `&cap=` can only ever ride beside
                  a real `?ask=`. */}
              {/* 🔴 AND NOTHING IS SENT UNTIL EVERY STAGED FILE HAS BEEN READ — see `blocked`. The
                  label carries the reason, so a dark button is never a mystery. */}
              {/* 🔴 THE SEND SLOT IS THE VOICE DOOR WHILE THE BOX IS EMPTY — the same grammar
                  the canvas composer ships (owner 2026-08-30: the send button "becoming the
                  voice button until text is manually [typed]"). Same circle, same accent, so
                  the slot keeps its shape on the first keystroke. The stop lives in the
                  listening branch above; material or a capability brings the arrow back,
                  because those sends need the button. */}
              {voiceLoop.active ? (
                <VoiceStopButton className="self-end [grid-area:send]" onClick={voiceLoop.end} />
              ) : !text.trim() && staged.length === 0 && !capability && !blocked && voiceLoop.offered ? (
                <button
                  aria-label="Start a voice conversation"
                  className="flex size-[var(--composer-control)] shrink-0 items-center justify-center self-end rounded-full bg-(--ui-action) text-(--ui-bg-editor) transition-opacity [grid-area:send] hover:opacity-90"
                  onClick={() => {
                    typedBefore.current = "";
                    voiceLoop.begin();
                  }}
                  title="Start a voice conversation"
                  type="button"
                >
                  <VoiceBarsGlyph />
                </button>
              ) : (
              <ComposerSend
                // 🔴 THE COMPOSER ITSELF SAYS IT IS WORKING — owner, 2026-09-01: *"when the chat
                // composer is reading and parsing documents there should be an animation"*. The
                // control already had a spinner state and this surface simply never set it, so a
                // send held open by a document being read looked identical to a send held open by
                // an empty box: dimmed, still, and silent about which. `reading` is true only while
                // a file is actually being extracted, never while one has failed — a failure is a
                // thing to act on, not a thing to wait for.
                className="self-end [grid-area:send]"
                disabled={blocked || (capability ? !text.trim() : !text.trim() && staged.length === 0)}
                label={sendLabel}
                onClick={() => start()}
              />
              )}
            </>
          )}
          </div>
        </div>
        )}
        {/* 🔴 A DENIED MICROPHONE HAS TO SAY SO. Without this the mic button is pressed, nothing
            starts, and nothing appears — indistinguishable from a broken control. Observed exactly
            that while verifying: `SpeechRecognition` exists, so the button renders, but the capture
            never begins and the learner is told nothing. The session composer already prints this;
            the front door was the surface missing it. */}
{/* 🔴 THE GAP BETWEEN STOPPING AND THE WORDS ARRIVING HAS TO BE VISIBLE. On the browser
            lane there is none — it writes as it hears — but where Nemesis falls back to recording
            and sending, the microphone goes quiet and nothing appears for a second or two. Silence
            there reads as a control that ate the sentence. */}
        {dictation.transcribing && (
          <p className="mt-2 text-center text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">Turning that into words…</p>
        )}
        {dictation.error && !listening && (
          <p className="mt-2 text-center text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">{dictation.error}</p>
        )}
          </div>
          {/* 🔴 THIS LEAVES WITH THE GREETING, BECAUSE IT HAS NOWHERE TO TRAVEL TO. It sits OUTSIDE
              `composerBox`, so the departure did not carry it and did not fade it: the help line
              stayed at full opacity while the composer flew out from under it, and then vanished on
              the route swap. A hard cut at the end of a move the learner was watching is the exact
              abruptness the rest of this sequence exists to avoid. Same fade and same timing as the
              greeting above — one departure, not two. (It was TWO things until 2026-08-26; the
              day's strip that used to sit below it is gone, see the note further down.) */}
          <div
            className="flex w-full flex-col items-center"
            style={{
              opacity: departing ? 0 : 1,
              transition: `opacity ${Math.round(DOCK_MS * 0.55)}ms ease-out`,
            }}
          >
          {/* 🔴🔴 THE ONE THING THAT MAY SIT UNDER THE COMPOSER, AND THE STANDING RULE BELOW STILL
              HOLDS. The owner cut a whole strip from this position on 2026-08-26 — cards due, dates
              coming, rows for half-finished canvases. That was CONTENT competing with the single
              question this page asks. This is a CONTROL belonging to the composer: it says nothing
              until there is something to send, and the owner asked for it here by name on
              2026-08-29, pointing at the same position on ChatGPT's Work start screen. See
              `project-picker.tsx`, and the note further down that keeps the strip deleted. */}
          <ProjectPicker
            folders={folders}
            onChange={setProject}
            onCreate={async (name, icon) => {
              const made = await createFolder(userId, name, null, icon);
              if (made) setFolders((rows) => [...rows, made]);
              return made?.id ?? null;
            }}
            apps={connections.apps}
            connected={connections.connected}
            // 🔴 THE PLUGINS PAGE, NOT SETTINGS (owner 2026-08-30: *"when clicking on manage plugins, it
            // should take users to the plugin page, not to the settings"*). When this was wired the
            // only surface for connections WAS a card buried in Settings; /plugins has since become
            // a real destination with a rail row of its own, and a menu that dumps a learner into
            // Settings for a thing that has a page is a wrong turn.
            onOpenApps={() => router.push("/plugins")}
            shown={!departing && !recording}
            value={project}
          />
          <p className="mt-6 text-[length:var(--canvas-text-small)] text-(--ui-text-quaternary)" ref={hintBox}>
            {/* 🔴 THIS NO LONGER PROMISES RECORDING, BECAUSE THIS SURFACE CANNOT DO IT. The line
                used to read "Type it, drop a file in, or record a lecture." Recording is started by
                `RecordWorkspace`, which is hosted only on /sessions and /notebooks — the Canvas has
                no path to it. `recording-recovery-notice.tsx` sits on this very page and says so in
                its own header: it can only offer back a capture that already happened.

                Two of those three were also untrue until this pass: the `+` did nothing and there
                was no dictation. Those are now real, so the copy describes four things this
                composer genuinely does. Wording is my call; the constraint is that it not name a
                capability the front door does not have. */}
            Type a topic, ask a question, talk it through, or drop your material in.
          </p>

          {/* 🔴🔴 NOTHING GOES HERE. There WAS a strip under the composer — workstream D's "what is
              waiting": cards due, dates coming up, and a row per canvas the learner had left half
              finished. The owner cut it on 2026-08-26: *"the landing page has some previous chats
              in there, which I don't want that in there. It's the things that are below the chat
              composer, which I don't want."* Those "previous chats" were the `Left unfinished`
              rows.

              The strip and its reader (`today-strip.tsx`, `lib/learn/today.ts`) are DELETED rather
              than hidden behind a flag, because an unreachable surface that still passes its own
              tests reads as shipped to everyone who greps for it later. Git has them if the front
              door ever wants to report the day again. */}
          </div>
        </section>

      </div>

      {/* An interrupted recording is offered back here, above the composer — the one place the
          learner is guaranteed to look, so recovery is never something they have to find. It
          renders nothing at all when there is no crashed session, which is almost always. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 px-4 pt-4">
        <div className="pointer-events-auto">
          {/* 🔴 A RECOVERED LECTURE NOW LANDS ON A CANVAS, NOT IN A SESSIONS CHAT. This notice only
              ever renders here, and it used to file what it recovered as a new Sessions
              conversation — a surface the sidebar does not list. Starting a canvas from the
              transcript is the same thing dropping a file on this page does. */}
          <RecordingRecoveryNotice
            accessToken={accessToken}
            onRecovered={(file) => stageFiles([file])}
            uid={userId}
          />
        </div>
      </div>

    </main>
  );
}
