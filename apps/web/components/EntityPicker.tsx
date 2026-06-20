"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { SearchResult } from "@pharmabro/shared";
import { searchEntities } from "@/lib/api";

// Typeahead for the Monitor box: as you type it suggests real catalog entities (drugs, supplements,
// peptides, biologics, classes) from the same `search_entities` source the Explore page uses, with
// brand→generic resolution. Picking one creates a PRECISE, scoped watch (via watchFieldsFromEntity);
// typing a free phrase and pressing Enter / Monitor still creates a plain topic watch (the fallback).
// Presentation + keyboard nav only — the parent owns what "pick" and "submit" actually do.

const TYPE_LABEL: Record<string, string> = {
  drug: "Drug",
  supplement: "Supplement",
  peptide: "Peptide",
  biologic: "Biologic",
  class: "Class",
  company: "Company",
};

// Mirrors the Explore status palette so the chip color reads the same across the app.
const STATUS_COLOR: Record<string, string> = {
  approved: "#1a8c5c",
  investigational: "#0278c0",
  research_use: "#c97b06",
  supplement: "#6d28d9",
  unknown: "#6b7280",
};

interface EntityPickerProps {
  value: string;
  onChange: (v: string) => void;
  /** A suggestion was chosen → create a precise, scoped watch. */
  onPickEntity: (e: SearchResult) => void;
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
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const reqId = useRef(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced suggest (~200ms). A slower response for an earlier keystroke is dropped via reqId so the
  // list never flickers back to stale matches. <2 chars → no query (avoids one-letter RPC spam).
  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setResults([]);
      setActive(-1);
      return;
    }
    const id = ++reqId.current;
    const t = setTimeout(() => {
      searchEntities(q)
        .then((r) => {
          if (id !== reqId.current) return;
          setResults(r.slice(0, 8));
          setActive(-1);
        })
        .catch(() => {
          if (id === reqId.current) setResults([]);
        });
    }, 200);
    return () => clearTimeout(t);
  }, [value]);

  function pick(e: SearchResult) {
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
              key={`${r.type}:${r.id}`}
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
              <span className="entity-type-chip" style={{ color: STATUS_COLOR[r.status] ?? STATUS_COLOR.unknown }}>
                <span className="entity-type-dot" style={{ background: STATUS_COLOR[r.status] ?? STATUS_COLOR.unknown }} />
                {TYPE_LABEL[r.type] ?? r.type}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
