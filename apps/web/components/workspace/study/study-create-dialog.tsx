"use client";

import {
  IconBold,
  IconBrackets,
  IconCode,
  IconHighlight,
  IconItalic,
  IconList,
  IconTypography,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/desktop-ui/dialog";
import { Input } from "@/components/desktop-ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/desktop-ui/select";
import { Textarea } from "@/components/desktop-ui/textarea";
import { OcclusionEditor } from "@/components/workspace/study/occlusion-editor";
import { type StudyCardType, type StudyDeck, useCloudStudy } from "@/lib/workspace/study-cloud-store";

export type StudyCreateKind = "deck" | "card";

interface StudyCreateDialogProps {
  kind: StudyCreateKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deck?: StudyDeck | null;
  sourcePath?: string | null;
}

function titleFromSource(path: string | null | undefined) {
  const leaf = path?.split("/").pop() ?? "";
  return leaf.replace(/\.md$/i, "");
}

type CardFormat = "bold" | "italic" | "highlight" | "code" | "cloze" | "list";

const FORMAT_BUTTONS: Array<{ format: CardFormat; label: string; icon: React.ReactNode }> = [
  { format: "bold", label: "Bold", icon: <IconBold /> },
  { format: "italic", label: "Italic", icon: <IconItalic /> },
  { format: "highlight", label: "Highlight", icon: <IconHighlight /> },
  { format: "code", label: "Inline code", icon: <IconCode /> },
  { format: "cloze", label: "Cloze deletion", icon: <IconBrackets /> },
  { format: "list", label: "Bulleted list", icon: <IconList /> },
];

export function StudyCreateDialog({ kind, open, onOpenChange, deck, sourcePath }: StudyCreateDialogProps) {
  const { createCard, createDeck, decks } = useCloudStudy();
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [description, setDescription] = useState("");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [deckId, setDeckId] = useState("");
  const [cardType, setCardType] = useState<StudyCardType>("basic");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toolbarOn, setToolbarOn] = useState(false);
  const frontRef = useRef<HTMLTextAreaElement>(null);
  const backRef = useRef<HTMLTextAreaElement>(null);
  const lastFieldRef = useRef<"front" | "back">("front");

  useEffect(() => {
    if (!open) return;
    setName(titleFromSource(sourcePath));
    setDescription("");
    setGroup("");
    setFront("");
    setBack("");
    setDeckId(deck?.id ?? decks[0]?.id ?? "");
    setCardType("basic");
    setTags("");
    setError(null);
    lastFieldRef.current = "front";
  }, [deck?.id, decks, open, sourcePath]);

  // Formatting acts on whichever field was focused last; the text lives in
  // markdown, which review mode already renders (AssistantMarkdown).
  function applyFormat(format: CardFormat) {
    const el = lastFieldRef.current === "back" ? backRef.current : frontRef.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const selected = el.value.slice(start, end);
    let insert: string;
    if (format === "list") {
      const body = selected || "item";
      insert = body.split("\n").map((line) => (line.trim() ? `- ${line.replace(/^\s*[-*+]\s+/, "")}` : line)).join("\n");
    } else if (format === "cloze") {
      const highest = (el.value.match(/\{\{c(\d+)::/g) ?? []).reduce((max, mark) => Math.max(max, Number(/\d+/.exec(mark)?.[0] ?? 0)), 0);
      insert = `{{c${highest + 1}::${selected || "hidden text"}}}`;
    } else {
      const wrap = format === "bold" ? "**" : format === "italic" ? "*" : format === "highlight" ? "==" : "`";
      insert = `${wrap}${selected || `${format} text`}${wrap}`;
    }
    el.setRangeText(insert, start, end, "select");
    el.focus();
    if (lastFieldRef.current === "back") setBack(el.value);
    else setFront(el.value);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Occlusion cards save through the editor's own button, not this form.
    if (kind === "card" && cardType === "image_occlusion") return;
    setSaving(true);
    setError(null);
    try {
      if (kind === "deck") {
        const fullName = group.trim() ? `${group.trim()}::${name.trim()}` : name;
        await createDeck({ name: fullName, description, sourcePath });
      } else {
        const targetDeck = decks.find((item) => item.id === deckId);
        if (!targetDeck) throw new Error("Choose a deck first.");
        const tagList = tags.split(/[\s,]+/);
        await createCard({ deckId: targetDeck.id, front, back, cardType, sourcePath: targetDeck.sourcePath ?? sourcePath, tags: tagList });
        if (cardType === "reversed") await createCard({ deckId: targetDeck.id, front: back, back: front, cardType, sourcePath: targetDeck.sourcePath ?? sourcePath, tags: tagList });
      }
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Couldn't create the ${kind}.`);
    } finally {
      setSaving(false);
    }
  }

  const isDeck = kind === "deck";
  const isOcclusion = !isDeck && cardType === "image_occlusion";
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className={isDeck ? "max-w-lg" : "max-w-2xl"}>
        <form className="grid gap-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{isDeck ? "New deck" : "Add card"}</DialogTitle>
            <DialogDescription>
              {isDeck
                ? "Create a cloud deck that stays available anywhere you use Nemesis."
                : "Choose the destination deck and note type before adding the content."}
            </DialogDescription>
          </DialogHeader>
          {isDeck ? (
            <>
              <label className="grid gap-1.5 text-xs font-medium">
                Deck name
                <Input autoFocus onChange={(event) => setName(event.target.value)} placeholder="Cardiovascular pharmacology" value={name} />
              </label>
              <label className="grid gap-1.5 text-xs font-medium">
                Group <span className="font-normal text-muted-foreground">optional</span>
                <Input onChange={(event) => setGroup(event.target.value)} placeholder="Pharmacy School::Exam 7" value={group} />
              </label>
              <label className="grid gap-1.5 text-xs font-medium">
                Description <span className="font-normal text-muted-foreground">optional</span>
                <Textarea onChange={(event) => setDescription(event.target.value)} placeholder="What this deck covers" value={description} />
              </label>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
                <label className="grid gap-1.5 text-xs font-medium">
                  Deck
                  <Select onValueChange={setDeckId} value={deckId}><SelectTrigger className="h-10 w-full rounded-xl border border-(--ui-stroke-tertiary) bg-background px-3"><SelectValue placeholder="Choose a deck" /></SelectTrigger><SelectContent>{decks.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
                </label>
                <label className="grid gap-1.5 text-xs font-medium">
                  Card type
                  <Select onValueChange={(value) => setCardType(value as StudyCardType)} value={cardType}><SelectTrigger className="h-10 w-full rounded-xl border border-(--ui-stroke-tertiary) bg-background px-3"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="basic">Basic (front/back)</SelectItem><SelectItem value="reversed">Basic reversed</SelectItem><SelectItem value="cloze">Cloze</SelectItem><SelectItem value="image_occlusion">Image occlusion</SelectItem></SelectContent></Select>
                </label>
              </div>
              {cardType === "image_occlusion" ? (
                <>
                  <label className="grid gap-1.5 text-xs font-medium">
                    Tags <span className="font-normal text-muted-foreground">optional</span>
                    <Input onChange={(event) => setTags(event.target.value)} placeholder="#pharmacology #exam-2" value={tags} />
                  </label>
                  <OcclusionEditor
                    deckId={deckId}
                    onCancel={() => onOpenChange(false)}
                    onSaved={() => onOpenChange(false)}
                    sourcePath={decks.find((item) => item.id === deckId)?.sourcePath ?? sourcePath ?? null}
                    tags={tags}
                  />
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1">
                    <Button
                      aria-label="Formatting toolbar"
                      aria-pressed={toolbarOn}
                      onClick={() => setToolbarOn((value) => !value)}
                      size="icon-xs"
                      title="Formatting toolbar"
                      type="button"
                      variant={toolbarOn ? "secondary" : "ghost"}
                    >
                      <IconTypography />
                    </Button>
                    {toolbarOn && (
                      <div aria-label="Card formatting" className="flex items-center gap-0.5 rounded-lg border border-(--ui-stroke-tertiary) bg-[color-mix(in_srgb,var(--ui-base)_5%,transparent)] p-0.5" role="toolbar">
                        {FORMAT_BUTTONS.map(({ format, label, icon }) => (
                          <Button aria-label={label} key={format} onClick={() => applyFormat(format)} size="icon-xs" title={label} type="button" variant="ghost">{icon}</Button>
                        ))}
                      </div>
                    )}
                  </div>
                  <label className="grid gap-1.5 text-xs font-medium">
                    {cardType === "cloze" ? "Cloze text" : "Front"}
                    <Textarea autoFocus className="min-h-28" onChange={(event) => setFront(event.target.value)} onFocus={() => { lastFieldRef.current = "front"; }} placeholder={cardType === "cloze" ? "The {{c1::mitochondria}} is the powerhouse of the cell." : "What should you recall?"} ref={frontRef} value={front} />
                  </label>
                  <label className="grid gap-1.5 text-xs font-medium">
                    {cardType === "cloze" ? "Extra explanation" : "Back"}
                    {cardType === "cloze" && <span className="font-normal text-muted-foreground"> optional — the answers live inside the cloze text</span>}
                    <Textarea className="min-h-24" onChange={(event) => setBack(event.target.value)} onFocus={() => { lastFieldRef.current = "back"; }} placeholder="The concise answer or explanation" ref={backRef} value={back} />
                  </label>
                  <label className="grid gap-1.5 text-xs font-medium">
                    Tags <span className="font-normal text-muted-foreground">optional</span>
                    <Input onChange={(event) => setTags(event.target.value)} placeholder="#pharmacology #exam-2" value={tags} />
                  </label>
                </>
              )}
            </>
          )}
          {sourcePath && (
            <p className="truncate rounded-lg bg-(--ui-bg-tertiary) px-3 py-2 text-[0.6875rem] text-muted-foreground">
              Linked to {sourcePath}
            </p>
          )}
          {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">{error}</p>}
          {!isOcclusion && (
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">Cancel</Button>
              <Button disabled={saving || (isDeck ? !name.trim() : !front.trim() || (cardType !== "cloze" && !back.trim()))} type="submit" variant="secondary">
                {saving ? "Saving…" : isDeck ? "Create deck" : "Add card"}
              </Button>
            </DialogFooter>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
