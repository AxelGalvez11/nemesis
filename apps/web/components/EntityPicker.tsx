"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { EntitySuggestion, SuggestKind } from "@pharmabro/shared";
import { suggestEntities } from "@/lib/api";

// Typeahead for the Monitor box: as you type it resolves what you mean to a real medical thing — a drug
// (brand→generic, from the in-house catalog) or a MeSH-resolved condition / device / procedure — and shows
// WHICH kind with a colored chip. Picking one creates a PRECISE, scoped watch (via watchFieldsFromEntity);
// typing a free phrase and pressing Enter / Monitor still creates a plain topic watch (the fallback).
// Presentation + keyboard nav only — the parent owns what "pick" and "submit" actually do.

const KIND_LABEL: Record<SuggestKind, string> = {
  drug: "Drug",
  device: "Device",
  condition: "Condition",
  procedure: "Procedure",
  topic: "Topic",
};

// Distinct, readable chip color per universal kind.
const KIND_COLOR: Record<SuggestKind, string> = {
  drug: "#1a8c5c", // green
  condition: "#b45309", // amber-brown
  device: "#0278c0", // blue
  procedure: "#7c3aed", // violet
  topic: "#6b7280", // gray
};

interface EntityPickerProps {
  value: string;
  onChange: (v: string) => void;
  /** A suggestion was chosen → create a precise, scoped watch. */
  onPickEntity: (e: EntitySuggestion) => void;
  /** Enter / Monitor with no suggestion chosen → create a free-text topic watch. */
  onSubmitText: () => void;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
}

export function EntityPicker({
  value,
  onChange,
  onPickEntity,
  onSubmitText,
  placeholder,
  ariaLabel,
  disabled,
}: EntityPickerProps) {
  const [results, setResults] = useState<EntitySuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const reqId = useRef(0);
  const resultsKey = useRef("");
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced suggest (~200ms). A slower response for an earlier keystroke is dropped via reqId so the
  // list never flickers back to stale matches. <2 chars → no query (avoids one-letter RPC spam).
  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setResults([]);
      setActive(-1);
      resultsKey.current = "";
      return;
    }
    const id = ++reqId.current;
    const t = setTimeout(() => {
      suggestEntities(q)
        .then((r) => {
          if (id !== reqId.current) return;
          const sliced = r.slice(0, 8);
          const key = sliced.map((x) => `${x.source}:${x.id}`).join("|");
          setResults(sliced);
          // Only clear the highlighted row when the list actually CHANGES. A trailing debounce that
          // returns the same matches must NOT reset the user's arrow-selection — otherwise pressing
          // Enter would silently submit a free-text watch instead of the entity they had highlighted.
          if (key !== resultsKey.current) {
            setActive(-1);
            resultsKey.current = key;
          }
        })
        .catch(() => {
          if (id === reqId.current) {
            setResults([]);
            resultsKey.current = "";
          }
        });
    }, 200);
    return () => clearTimeout(t);
  }, [value]);

  // Cancel a pending blur-close on unmount so setState never fires on an unmounted component.
  useEffect(() => () => { if (blurTimer.current) clearTimeout(blurTimer.current); }, []);

  function pick(e: EntitySuggestion) {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    setOpen(false);
    setResults([]);
    onPickEntity(e);
  }

  function onKeyDown(ev: KeyboardEvent<HTMLInputElement>) {
    if (ev.key === "ArrowDown" && results.length) {
      ev.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % results.length);
    } else if (ev.key === "ArrowUp" && results.length) {
      ev.preventDefault();
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      if (open && active >= 0 && results[active]) pick(results[active]);
      else onSubmitText();
    } else if (ev.key === "Escape") {
      setOpen(false);
    }
  }

  const showMenu = open && results.length > 0 && !disabled;

  return (
    <>
      <input
        className="watch-add-input"
        value={value}
        maxLength={200}
        placeholder={placeholder}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={showMenu}
        aria-controls="entity-picker-list"
        aria-activedescendant={showMenu && active >= 0 ? `entity-option-${active}` : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={onKeyDown}
      />
      {showMenu ? (
        <ul className="entity-menu" id="entity-picker-list" role="listbox" aria-label="Suggestions">
          {results.map((r, i) => (
            <li
              key={`${r.source}:${r.id}`}
              id={`entity-option-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "entity-option active" : "entity-option"}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault(); // keep focus so the blur-close race never eats the pick
                pick(r);
              }}
            >
              <span className="entity-option-main">
                <span className="entity-option-name">{r.name}</span>
                {r.subtitle ? <span className="entity-option-sub">{r.subtitle}</span> : null}
              </span>
              <span className="entity-type-chip" style={{ color: KIND_COLOR[r.kind] }}>
                <span className="entity-type-dot" style={{ background: KIND_COLOR[r.kind] }} />
                {KIND_LABEL[r.kind]}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
