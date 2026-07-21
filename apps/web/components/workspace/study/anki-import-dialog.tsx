"use client";

// Batch D: Anki .apkg import. Parsing happens fully in the browser (fflate
// unzip + sql.js WASM via /sql-wasm.js) so the deck file never uploads
// anywhere — only the cards the student confirms are written to their cloud
// study decks. Media (images/audio) is counted and reported, not imported.

import { IconFileUpload } from "@tabler/icons-react";
import { useRef, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/desktop-ui/dialog";
import { parseAnkiPackage, type AnkiImportResult } from "@/lib/workspace/anki-package";
import { loadSqlEngine } from "@/lib/workspace/sql-js-loader";
import { useCloudStudy } from "@/lib/workspace/study-cloud-store";

const MAX_FILE_BYTES = 250 * 1024 * 1024;

type Step = "pick" | "parsing" | "preview" | "importing" | "done";

interface AnkiImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AnkiImportDialog({ open, onOpenChange }: AnkiImportDialogProps) {
  const { importAnkiDecks } = useCloudStudy();
  const [step, setStep] = useState<Step>("pick");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnkiImportResult | null>(null);
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [summary, setSummary] = useState({ cardCount: 0, deckCount: 0 });
  const fileRef = useRef<HTMLInputElement | null>(null);

  function reset() {
    setStep("pick");
    setError(null);
    setResult(null);
    setExcluded(new Set());
    setProgress({ done: 0, total: 0 });
  }

  function close(next: boolean) {
    if (!next && (step === "parsing" || step === "importing")) return;
    onOpenChange(next);
    if (!next) reset();
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      setError("That file is over 250 MB. Export a smaller deck (or export without media) and try again.");
      return;
    }
    setStep("parsing");
    try {
      const [engine, buffer] = await Promise.all([loadSqlEngine(), file.arrayBuffer()]);
      const parsed = parseAnkiPackage(new Uint8Array(buffer), engine);
      setResult(parsed);
      setExcluded(new Set());
      setStep("preview");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't read that file.");
      setStep("pick");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function toggleDeck(name: string) {
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function runImport() {
    if (!result) return;
    const chosen = result.decks.filter((deck) => !excluded.has(deck.name));
    const total = chosen.reduce((sum, deck) => sum + deck.cards.length, 0);
    if (total === 0) return;
    setStep("importing");
    setError(null);
    setProgress({ done: 0, total });
    try {
      const outcome = await importAnkiDecks(chosen, (done, all) => setProgress({ done, total: all }));
      setSummary(outcome);
      setStep("done");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The import stopped partway.");
      setStep("preview");
    }
  }

  const chosenCount = result ? result.decks.filter((deck) => !excluded.has(deck.name)).reduce((sum, deck) => sum + deck.cards.length, 0) : 0;

  return (
    <Dialog onOpenChange={close} open={open}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Import from Anki</DialogTitle>
          <DialogDescription>
            {step === "done"
              ? "All set — your decks are ready to review."
              : "Pick a deck export (.apkg) from Anki. Decks keep their folders, tags, and cloze blanks."}
          </DialogDescription>
        </DialogHeader>

        {step === "pick" && (
          <div className="grid gap-3">
            <label className="grid cursor-pointer place-items-center gap-2 rounded-2xl border border-dashed border-(--ui-stroke-secondary) bg-[rgb(247_247_248)] px-4 py-8 text-center hover:border-(--ui-text-tertiary) dark:bg-[rgb(29_29_31)]">
              <IconFileUpload className="text-(--ui-text-tertiary)" size={22} />
              <span className="text-xs font-medium">Choose an .apkg file</span>
              <span className="text-[0.6875rem] text-(--ui-text-tertiary)">In Anki: File → Export → Anki Deck Package</span>
              <input
                accept=".apkg,.colpkg"
                className="sr-only"
                data-testid="anki-file-input"
                onChange={(event) => void handleFile(event.target.files?.[0])}
                ref={fileRef}
                type="file"
              />
            </label>
            <p className="text-[0.6875rem] leading-relaxed text-(--ui-text-tertiary)">
              The file is read privately on this device — nothing uploads until you confirm which decks to bring in.
            </p>
          </div>
        )}

        {step === "parsing" && <p className="py-6 text-center text-xs text-(--ui-text-secondary)">Reading the deck file…</p>}

        {step === "preview" && result && (
          <div className="grid gap-3">
            <div className="max-h-64 overflow-y-auto rounded-xl border border-(--ui-stroke-tertiary)">
              {result.decks.map((deck) => (
                <label className="flex cursor-pointer items-center gap-2.5 border-b border-(--ui-stroke-tertiary) px-3 py-2.5 text-xs last:border-b-0 hover:bg-black/[0.03] dark:hover:bg-white/[0.05]" key={deck.name}>
                  <input checked={!excluded.has(deck.name)} className="accent-[var(--theme-primary)]" onChange={() => toggleDeck(deck.name)} type="checkbox" />
                  <span className="min-w-0 flex-1 truncate font-medium">{deck.name}</span>
                  <span className="tabular-nums text-(--ui-text-quaternary)">{deck.cards.length} card{deck.cards.length === 1 ? "" : "s"}</span>
                </label>
              ))}
            </div>
            <p className="text-[0.6875rem] leading-relaxed text-(--ui-text-tertiary)">
              {result.cardCount} text cards found.
              {result.mediaCount > 0 && ` ${result.mediaCount} media file${result.mediaCount === 1 ? "" : "s"} (images/audio) will be skipped.`}
              {result.skippedNotes > 0 && ` ${result.skippedNotes} empty note${result.skippedNotes === 1 ? "" : "s"} skipped.`}
            </p>
          </div>
        )}

        {step === "importing" && (
          <div className="grid gap-2 py-4">
            <p className="text-center text-xs text-(--ui-text-secondary)" data-testid="anki-import-progress">
              Importing {progress.done} of {progress.total} cards…
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-(--ui-bg-quaternary)">
              <div className="h-full rounded-full bg-[var(--theme-primary)] transition-[width]" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
            </div>
          </div>
        )}

        {step === "done" && (
          <p className="py-4 text-center text-xs text-(--ui-text-secondary)" data-testid="anki-import-done">
            Imported {summary.cardCount} card{summary.cardCount === 1 ? "" : "s"} into {summary.deckCount} deck{summary.deckCount === 1 ? "" : "s"}.
          </p>
        )}

        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">{error}</p>}

        <DialogFooter>
          {step === "preview" && result ? (
            <>
              <Button onClick={() => close(false)} type="button" variant="ghost">Cancel</Button>
              <Button data-testid="anki-import-confirm" disabled={chosenCount === 0} onClick={() => void runImport()} type="button" variant="secondary">
                Import {chosenCount} card{chosenCount === 1 ? "" : "s"}
              </Button>
            </>
          ) : step === "done" ? (
            <Button onClick={() => close(false)} type="button" variant="secondary">Done</Button>
          ) : step === "pick" ? (
            <Button onClick={() => close(false)} type="button" variant="ghost">Cancel</Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
