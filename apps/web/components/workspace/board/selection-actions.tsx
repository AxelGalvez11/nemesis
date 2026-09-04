"use client";

// Select a sentence inside a card and the bar appears: ask about it here, ask in a new thread
// beside this card, keep it as a note, or highlight it (docs/wondering-canvas-reference.md §5).

import { memo, useRef, useState } from "react";

import { useBoard } from "./board-provider";
import { SelectionMenu, SELECTION_ICONS } from "./selection-menu";
import { findSelectedOccurrence, useLiveSelectionHighlight, useTextSelection } from "./text-ranges";

export const SelectionActions = memo(function SelectionActions({
  cardId,
  contentRef,
}: {
  cardId: string;
  contentRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { cards, addCardNote, saveCardHighlight, sendCardMessage, sendBranchQuestion } = useBoard();
  const { selectedText, position, clearBrowserSelection } = useTextSelection(contentRef);
  const occurrenceRef = useRef<number | undefined>(undefined);
  const [held, setHeld] = useState<{ text: string; occurrence?: number; position: NonNullable<typeof position> } | null>(null);

  const selection = window.getSelection();
  const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  if (selectedText && position && contentRef.current && range) {
    const occurrence = findSelectedOccurrence(contentRef.current, selectedText, range);
    if (occurrence !== null) occurrenceRef.current = occurrence;
  }

  useLiveSelectionHighlight(contentRef, Boolean((selectedText && position) || held));

  if ((!selectedText || !position) && !held) {
    occurrenceRef.current = undefined;
    return null;
  }
  const streaming = cards.find((card) => card.id === cardId)?.status === "streaming";
  const current = held ?? { text: selectedText, occurrence: occurrenceRef.current, position: position as NonNullable<typeof position> };
  const dismiss = () => {
    setHeld(null);
    clearBrowserSelection();
  };
  return (
    <SelectionMenu
      actions={[
        {
          label: "Create note",
          icon: SELECTION_ICONS.note,
          onClick: () => {
            addCardNote(cardId, current.text, current.occurrence);
            dismiss();
          },
        },
        {
          label: "Highlight",
          icon: SELECTION_ICONS.highlight,
          onClick: () => {
            saveCardHighlight(cardId, current.text, "saved", current.occurrence);
            dismiss();
          },
        },
      ]}
      anchorHidden={current.position.anchorHidden}
      onDismiss={dismiss}
      position={{ top: current.position.top, bottom: current.position.bottom, left: current.position.left }}
      promptAction={{
        placeholder: "Ask about this…",
        replyDisabled: streaming,
        onReply: (text) => {
          if (sendCardMessage(cardId, text, undefined, current.text, current.occurrence)) dismiss();
        },
        onNewThread: (text) => {
          if (sendBranchQuestion(cardId, text, "right", current.text, current.occurrence)) dismiss();
        },
      }}
    />
  );
});
