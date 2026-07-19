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
import { Textarea } from "@/components/desktop-ui/textarea";
import { type StudyDeck, useCloudStudy } from "@/lib/workspace/study-cloud-store";

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
  const { createCard, createDeck } = useCloudStudy();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(titleFromSource(sourcePath));
    setDescription("");
    setFront("");
    setBack("");
    setError(null);
  }, [open, sourcePath]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (kind === "deck") {
        await createDeck({ name, description, sourcePath });
      } else {
        if (!deck) throw new Error("Choose a deck first.");
        await createCard({ deckId: deck.id, front, back, sourcePath: deck.sourcePath ?? sourcePath });
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
            <DialogTitle>{isDeck ? "New deck" : `Add card to ${deck?.name ?? "deck"}`}</DialogTitle>
            <DialogDescription>
              {isDeck
                ? "Create a cloud deck that stays available anywhere you use Nemesis."
                : "Cards are due immediately and enter spaced repetition after their first review."}
            </DialogDescription>
          </DialogHeader>
          {isDeck ? (
            <>
              <label className="grid gap-1.5 text-xs font-medium">
                Deck name
                <Input autoFocus onChange={(event) => setName(event.target.value)} placeholder="Cardiovascular pharmacology" value={name} />
              </label>
              <label className="grid gap-1.5 text-xs font-medium">
                Description <span className="font-normal text-muted-foreground">optional</span>
                <Textarea onChange={(event) => setDescription(event.target.value)} placeholder="What this deck covers" value={description} />
              </label>
            </>
          ) : (
            <>
              <label className="grid gap-1.5 text-xs font-medium">
                Prompt
                <Textarea autoFocus onChange={(event) => setFront(event.target.value)} placeholder="What should you recall?" value={front} />
              </label>
              <label className="grid gap-1.5 text-xs font-medium">
                Answer
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
            <Button disabled={saving || (isDeck ? !name.trim() : !front.trim() || !back.trim())} type="submit">
              {saving ? "Saving…" : isDeck ? "Create deck" : "Add card"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
