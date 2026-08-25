// One note's body, fetched when somebody opens it.
//
// 🔴 THE LISTS DELIBERATELY DO NOT CARRY CONTENT. Both the Library and the canvas's outputs panel
// select `id,path,title,updated_at` and stop — pulling every note's full text to render a list of
// titles would move megabytes to draw a few lines. So the reader fetches the one it is about to
// show, which is one query at the moment a person asked for it.

import { supabase } from "@/lib/supabase";

/** The note's markdown, or null when it cannot be reached. 🔴 Null rather than a throw: the caller
 *  is a preview card, and a card that says "couldn't open this" is a better answer than one that
 *  disappears with an unhandled rejection behind it. */
export async function readLibraryNote(path: string): Promise<string | null> {
  if (!path) return null;
  try {
    const { data, error } = await supabase
      .from("readable_library_documents")
      .select("content")
      .eq("path", path)
      .eq("deleted", false)
      .limit(1)
      .maybeSingle();
    if (error) return null;
    const content = (data as { content?: unknown } | null)?.content;
    return typeof content === "string" ? content : null;
  } catch {
    return null;
  }
}
