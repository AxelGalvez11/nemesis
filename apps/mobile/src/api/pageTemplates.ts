/**
 * Starting shapes for a brand-new page (canvas NewPage: the Lecture notes and Study guide chips above the keyboard).
 * Field-agnostic on purpose: headings a law, engineering or history student would all use.
 * Written through ws_apply in one call; the content list travels as a chain of inserts, never a whole array.
 */
import { supabase } from './supabase';
import { newId } from './spaceWrite';

export type PageTemplate = 'lecture' | 'study';

const TEMPLATES: Record<PageTemplate, { type: string; text: string }[]> = {
  lecture: [
    { type: 'sub_header', text: 'Main ideas' },
    { type: 'bulleted_list', text: '' },
    { type: 'sub_header', text: 'Details and examples' },
    { type: 'bulleted_list', text: '' },
    { type: 'sub_header', text: 'Questions to follow up' },
    { type: 'to_do', text: '' },
  ],
  study: [
    { type: 'sub_header', text: 'Key terms' },
    { type: 'bulleted_list', text: '' },
    { type: 'sub_header', text: 'Summary' },
    { type: 'text', text: '' },
    { type: 'sub_header', text: 'Practice questions' },
    { type: 'numbered_list', text: '' },
  ],
};

export async function applyPageTemplate(spaceId: string, pageId: string, pageContent: string[], template: PageTemplate): Promise<void> {
  const ops: Record<string, unknown>[] = [];
  const ins: [string, string | null][] = [];
  let after: string | null = pageContent.length ? pageContent[pageContent.length - 1]! : null;
  for (const b of TEMPLATES[template]) {
    const id = newId();
    ops.push({ op: 'create', id, kind: 'block', type: b.type, parent_id: pageId, props: { title: b.text ? [[b.text]] : [], ...(b.type === 'to_do' ? { checked: false } : {}) } });
    ins.push([id, after]);
    after = id;
  }
  ops.push({ op: 'update', id: pageId, lists: { content: { ins } } });
  const { data, error } = await supabase.rpc('ws_apply', { p_space: spaceId, p_ops: ops, p_client: 'ios' });
  if (error) throw new Error(error.message);
  if ((data as { denied?: string[] } | null)?.denied?.length) throw new Error('You do not have permission to change this page.');
}
