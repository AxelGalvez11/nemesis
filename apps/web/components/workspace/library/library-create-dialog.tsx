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
import { useCloudLibrary } from "@/lib/workspace/library-cloud-store";

export type LibraryCreateKind = "note" | "folder";

interface LibraryCreateDialogProps {
  kind: LibraryCreateKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFolder?: string;
}

export function LibraryCreateDialog({ kind, open, onOpenChange, initialFolder = "" }: LibraryCreateDialogProps) {
  const { createFolder, createNote } = useCloudLibrary();
  const [name, setName] = useState("");
  const [folder, setFolder] = useState(initialFolder);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setFolder(initialFolder);
    setError(null);
  }, [initialFolder, open]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (kind === "folder") await createFolder(folder ? `${folder}/${name}` : name);
      else await createNote({ title: name, folder: "" });
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Couldn't create the ${kind}.`);
    } finally {
      setSaving(false);
    }
  }

  const noun = kind === "note" ? "note" : "folder";
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-md">
        <form className="grid gap-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>New {noun}</DialogTitle>
            <DialogDescription>
              {kind === "note"
                ? "Create a cloud note. Use [[double brackets]] in the editor to connect it to your Library."
                : "Folders can be nested with a slash, such as Contract law/Week 4."}
            </DialogDescription>
          </DialogHeader>
          <label className="grid gap-1.5 text-xs font-medium">
            Name
            <Input autoFocus onChange={(event) => setName(event.target.value)} placeholder={kind === "note" ? "Untitled note" : "New folder"} value={name} />
          </label>
          {kind === "folder" && (
            <label className="grid gap-1.5 text-xs font-medium">
              Parent folder <span className="font-normal text-muted-foreground">optional</span>
              <Input onChange={(event) => setFolder(event.target.value)} placeholder="Course/Unit" value={folder} />
            </label>
          )}
          {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">{error}</p>}
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">Cancel</Button>
            <Button disabled={saving || !name.trim()} type="submit">{saving ? "Creating…" : `Create ${noun}`}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
