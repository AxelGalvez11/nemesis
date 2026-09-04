import { useState } from "react";
import { Alert } from "react-native";
import { AttachLibrarySheet } from "@/components/AttachLibrarySheet";
import { ComposerPlusMenu } from "@/components/ComposerPlusMenu";
import { PhotoCaptureSheet } from "@/components/PhotoCaptureSheet";
import { DocumentError, pickAndReadDocument } from "@/api/documents";
import { storeAndReadPhoto } from "@/api/photos";
import { attachToCanvas } from "@/api/canvas-sources";
import { extractedFrom, type PendingAttachmentItem } from "@/lib/pending-attachment";
import type { LearningCanvas } from "@/learn/web";

// The composer "+" menu's attach rows, IN A SESSION — the same three chat.tsx already offers
// ("Attach from Library", "Add a file", "Take photo"; not the front door's own "Add photos" /
// "Add files" pair, which browse or upload before a canvas even exists — see
// ComposerPlusMenu.tsx's own header on why a caller picks one set, never both).
//
// 🔴 ATTACHED IMMEDIATELY, NEVER STASHED. LearnHome.tsx stages picks because there is no canvas
// yet to attach them TO; here there already is one, so every pick reads, uploads and merges in
// one step — `attachToCanvas` with a single-item list — and the new `source` moment shows up as
// its own file-card row above the next turn the instant it lands (`CanvasTurn.tsx` already draws
// `turn.attached`).
//
// Pulled out of canvas.tsx (rather than inlined) for the same reason useCanvasIntake.ts was: this
// screen's own line budget. It owns nothing canvas.tsx needs back except the merged canvas.
export function CanvasAttachMenu({
  visible,
  onClose,
  bottomOffset,
  uid,
  canvas,
  onAttached,
}: {
  visible: boolean;
  onClose: () => void;
  bottomOffset: number;
  uid: string | null;
  /** The canvas to attach into. Only ever read at the moment a pick resolves — `attachToCanvas`
   *  re-reads the row fresh before merging, so a stale prop here costs nothing. */
  canvas: LearningCanvas | null;
  onAttached: (canvas: LearningCanvas) => void;
}) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const attachOne = async (item: PendingAttachmentItem, label: string) => {
    if (!uid || !canvas) return;
    setBusy(true);
    try {
      const outcome = await attachToCanvas(uid, canvas, [item]);
      onAttached(outcome.canvas);
      if (outcome.failed.length) Alert.alert("Couldn't add that", `Nemesis couldn't read ${label}. Try again.`);
    } catch {
      Alert.alert("Couldn't add that", `Nemesis couldn't read ${label}. Try again.`);
    } finally {
      setBusy(false);
    }
  };

  const addFileFromDevice = async () => {
    if (!uid || busy) return;
    setBusy(true);
    try {
      const doc = await pickAndReadDocument(uid);
      // A cancel isn't a failure — nothing more to do.
      if (doc) await attachOne({ kind: "file", mimeType: doc.mimeType, name: doc.name, read: Promise.resolve(extractedFrom(doc)), size: doc.size, uri: doc.uri }, doc.title);
    } catch (cause) {
      Alert.alert("Couldn't add that file", cause instanceof DocumentError ? cause.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ComposerPlusMenu
        visible={visible}
        onClose={onClose}
        bottomOffset={bottomOffset}
        onAttach={() => setLibraryOpen(true)}
        onAddFile={() => void addFileFromDevice()}
        onTakePhoto={() => setCameraOpen(true)}
      />
      <AttachLibrarySheet
        visible={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        userId={uid}
        onPick={(note) => {
          setLibraryOpen(false);
          void attachOne({ kind: "note", note }, note.title || "that note");
        }}
      />
      <PhotoCaptureSheet
        visible={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCaptured={(uri) => {
          setCameraOpen(false);
          if (!uid) return;
          const read = storeAndReadPhoto(uid, uri).then(extractedFrom);
          void attachOne({ kind: "file", mimeType: "image/jpeg", name: "Photo", read, size: null, uri }, "that photo");
        }}
      />
    </>
  );
}
