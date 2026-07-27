"use client";

import { IconArrowLeft, IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { supabase } from "@/lib/supabase";
import { parseSlideDeck } from "@/lib/workspace/slide-deck";

interface DeckNote {
  path: string;
  title: string;
  content: string;
}

export default function SlidesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const path = searchParams.get("note") ?? "";
  const [note, setNote] = useState<DeckNote | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    setIndex(0);
    if (!path) {
      setError("No slide deck was selected.");
      return () => { alive = false; };
    }
    void supabase
      .from("readable_library_documents")
      .select("path,title,content")
      .eq("deleted", false)
      .eq("kind", "note")
      .eq("path", path)
      .maybeSingle()
      .then(({ data, error: loadError }) => {
        if (!alive) return;
        if (loadError || !data) {
          setError(loadError?.message ?? "That slide deck is no longer in the Library.");
          return;
        }
        setNote({ content: data.content ?? "", path: data.path, title: data.title });
      });
    return () => { alive = false; };
  }, [path]);

  const slides = useMemo(() => parseSlideDeck(note?.content ?? ""), [note?.content]);
  const slide = slides[index] ?? null;
  const goBack = () => router.push(path ? `/library?note=${encodeURIComponent(path)}` : "/library");

  return (
    <main className="flex h-full min-h-0 flex-col bg-black text-white">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 px-4">
        <Button aria-label="Back to Library" className="text-white hover:bg-white/10 hover:text-white" onClick={goBack} size="icon-sm" variant="ghost">
          <IconArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-medium">{note?.title ?? "Slides"}</h1>
          <p className="text-[0.6875rem] text-white/50">{slides.length ? `${index + 1} of ${slides.length}` : ""}</p>
        </div>
      </header>

      <section className="grid min-h-0 flex-1 place-items-center overflow-auto p-4 sm:p-8">
        {error ? (
          <div className="max-w-md text-center text-sm text-white/65">{error}</div>
        ) : !note ? (
          <div className="text-sm text-white/50">Loading slide deck…</div>
        ) : !slide ? (
          <div className="max-w-md text-center text-sm text-white/65">This note does not contain a readable slide deck.</div>
        ) : (
          <article className="aspect-video w-full max-w-5xl overflow-auto rounded-3xl bg-white px-[7%] py-[6%] text-black shadow-2xl">
            <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-5xl">{slide.title}</h2>
            <ul className="mt-[6%] grid gap-3 text-lg leading-relaxed sm:gap-5 sm:text-2xl">
              {slide.bullets.map((bullet, bulletIndex) => <li className="ml-6 list-disc pl-2" key={`${bulletIndex}-${bullet}`}>{bullet}</li>)}
            </ul>
            {slide.speakerNotes && (
              <details className="mt-8 border-t border-black/10 pt-4 text-sm text-black/60">
                <summary className="cursor-pointer font-medium text-black/75">Speaker notes</summary>
                <p className="mt-2 whitespace-pre-wrap leading-relaxed">{slide.speakerNotes}</p>
              </details>
            )}
          </article>
        )}
      </section>

      <footer className="flex h-16 shrink-0 items-center justify-center gap-3 border-t border-white/10">
        <Button aria-label="Previous slide" className="text-white hover:bg-white/10 hover:text-white" disabled={index <= 0} onClick={() => setIndex((value) => Math.max(0, value - 1))} size="icon" variant="ghost">
          <IconChevronLeft />
        </Button>
        <span className="min-w-20 text-center text-xs tabular-nums text-white/55">{slides.length ? `${index + 1} / ${slides.length}` : "—"}</span>
        <Button aria-label="Next slide" className="text-white hover:bg-white/10 hover:text-white" disabled={index >= slides.length - 1} onClick={() => setIndex((value) => Math.min(slides.length - 1, value + 1))} size="icon" variant="ghost">
          <IconChevronRight />
        </Button>
      </footer>
    </main>
  );
}
