"use client";

import { useEffect, useState } from "react";

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

export function StudyCreateDialog({ kind, open, onOpenChange, deck, sourcePath }: StudyCreateDialogProps) {
  const { createCard, createDeck, decks } = useCloudStudy();
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [description, setDescription] = useState("");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [deckId, setDeckId] = useState("");
  const [cardType, setCardType] = useState<StudyCardType>("basic");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(titleFromSource(sourcePath));
    setDescription("");
    setGroup("");
    setFront("");
    setBack("");
    setDeckId(deck?.id ?? decks[0]?.id ?? "");
    setCardType("basic");
    setError(null);
  }, [deck?.id, decks, open, sourcePath]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (kind === "deck") {
        const fullName = group.trim() ? `${group.trim()}::${name.trim()}` : name;
        await createDeck({ name: fullName, description, sourcePath });
      } else {
        const targetDeck = decks.find((item) => item.id === deckId);
        if (!targetDeck) throw new Error("Choose a deck first.");
        await createCard({ deckId: targetDeck.id, front, back, cardType, sourcePath: targetDeck.sourcePath ?? sourcePath });
        if (cardType === "reversed") await createCard({ deckId: targetDeck.id, front: back, back: front, cardType, sourcePath: targetDeck.sourcePath ?? sourcePath });
      }
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Couldn't create the ${kind}.`);
    } finally {
      setSaving(false);
    }
  }

  const isDeck = kind === "deck";
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-lg">
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
              <label className="grid gap-1.5 text-xs font-medium">
                Deck
                <Select onValueChange={setDeckId} value={deckId}><SelectTrigger className="h-10 w-full rounded-xl border border-(--ui-stroke-tertiary) bg-background px-3"><SelectValue placeholder="Choose a deck" /></SelectTrigger><SelectContent>{decks.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
              </label>
              <label className="grid gap-1.5 text-xs font-medium">
                Card type
                <Select onValueChange={(value) => setCardType(value as StudyCardType)} value={cardType}><SelectTrigger className="h-10 w-full rounded-xl border border-(--ui-stroke-tertiary) bg-background px-3"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="basic">Basic (front/back)</SelectItem><SelectItem value="reversed">Basic reversed</SelectItem><SelectItem value="cloze">Cloze</SelectItem><SelectItem value="image_occlusion">Image occlusion</SelectItem></SelectContent></Select>
              </label>
              <label className="grid gap-1.5 text-xs font-medium">
                {cardType === "cloze" ? "Cloze text" : cardType === "image_occlusion" ? "Image or occlusion prompt" : "Front"}
                <Textarea autoFocus onChange={(event) => setFront(event.target.value)} placeholder={cardType === "cloze" ? "The {{c1::mitochondria}} is the powerhouse of the cell." : cardType === "image_occlusion" ? "Paste an image URL or describe the hidden region" : "What should you recall?"} value={front} />
              </label>
              <label className="grid gap-1.5 text-xs font-medium">
                {cardType === "image_occlusion" ? "Occluded answer" : cardType === "cloze" ? "Extra explanation" : "Back"}
                <Textarea onChange={(event) => setBack(event.target.value)} placeholder="The concise answer or explanation" value={back} />
              </label>
            </>
          )}
          {sourcePath && (
            <p className="truncate rounded-lg bg-(--ui-bg-tertiary) px-3 py-2 text-[0.6875rem] text-muted-foreground">
              Linked to {sourcePath}
            </p>
          )}
          {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">{error}</p>}
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">Cancel</Button>
            <Button disabled={saving || (isDeck ? !name.trim() : !front.trim() || !back.trim())} type="submit" variant="secondary">
              {saving ? "Saving…" : isDeck ? "Create deck" : "Add card"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
