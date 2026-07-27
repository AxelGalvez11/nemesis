"use client";

import { parseStudyTextImport, type StudyTextImportSource } from "@nemesis/shared";
import { useMemo, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/desktop-ui/dialog";
import { Input } from "@/components/desktop-ui/input";
import { useCloudStudy } from "@/lib/workspace/study-cloud-store";

export function TextStudyImportDialog({
  open,
  onOpenChange,
  source,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: StudyTextImportSource;
}) {
  const { importAnkiDecks } = useCloudStudy();
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = useMemo(() => parseStudyTextImport(text, source), [source, text]);
  const label = source === "anki" ? "Anki text" : "Quizlet";

  function close(next: boolean) {
    if (!next && busy) return;
    onOpenChange(next);
    if (!next) {
      setName("");
      setText("");
      setError(null);
    }
  }

  async function runImport() {
    const deckName = name.trim();
    if (!deckName || parsed.cards.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await importAnkiDecks([
        {
          cards: parsed.cards,
          name: deckName,
          source: source === "anki" ? "Anki" : "Quizlet",
        },
      ]);
      setBusy(false);
      setName("");
      setText("");
      setError(null);
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The import did not finish.");
      setBusy(false);
    }
  }

  return (
    <Dialog onOpenChange={close} open={open}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import from {label}</DialogTitle>
          <DialogDescription>
            {source === "anki"
              ? "In Anki, export Notes in Plain Text, then paste the tab-separated rows here."
              : "In Quizlet, open Export, choose tab between term and definition, then paste the rows here."}
          </DialogDescription>
        </DialogHeader>
        <label className="grid gap-1.5 text-xs font-medium">
          Deck name
          <Input onChange={(event) => setName(event.target.value)} placeholder="Biology review" value={name} />
        </label>
        <label className="grid gap-1.5 text-xs font-medium">
          Cards
          <textarea
            className="min-h-56 resize-y rounded-xl border border-(--ui-stroke-secondary) bg-background px-3 py-2 font-mono text-xs leading-relaxed outline-none focus:border-[var(--theme-primary)]"
            onChange={(event) => setText(event.target.value)}
            placeholder={"Term\tDefinition\nSecond term\tSecond definition"}
            value={text}
          />
        </label>
        <p className="text-[0.6875rem] text-(--ui-text-tertiary)">
          {parsed.cards.length.toLocaleString()} card{parsed.cards.length === 1 ? "" : "s"} ready
          {parsed.skipped ? ` · ${parsed.skipped.toLocaleString()} empty or duplicate row${parsed.skipped === 1 ? "" : "s"} skipped` : ""}
        </p>
        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
        <DialogFooter>
          <Button onClick={() => close(false)} type="button" variant="ghost">Cancel</Button>
          <Button disabled={busy || !name.trim() || parsed.cards.length === 0} onClick={() => void runImport()} type="button" variant="secondary">
            {busy ? "Importing…" : `Import ${parsed.cards.length.toLocaleString()} cards`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
