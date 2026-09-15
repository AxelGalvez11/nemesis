/**
 * The page's "more" menu (canvas page_header dots): favourite, move to trash, and the visit that feeds Recents.
 * Trash is ws_apply's `trash` op (a page stays restorable from the web's Trash), never a delete.
 */
import { supabase } from './supabase';

export async function trashPage(spaceId: string, pageId: string): Promise<void> {
  const { data, error } = await supabase.rpc('ws_apply', { p_space: spaceId, p_ops: [{ op: 'trash', id: pageId }], p_client: 'ios' });
  if (error) throw new Error(error.message);
  if ((data as { denied?: string[] } | null)?.denied?.length) throw new Error('You do not have permission to move this page to the trash.');
}

export async function setFavorite(pageId: string, on: boolean): Promise<void> {
  const { error } = await supabase.rpc('ws_set_favorite', { p_page: pageId, p_on: on });
  if (error) throw new Error(error.message);
}

/** Records that the page was opened, so it shows in Recents on the phone and the web. */
export async function visitPage(pageId: string): Promise<void> {
  await supabase.rpc('ws_visit', { p_page: pageId });
}
