/**
 * A file or link placed in a note (canvas: NoteReady, gen.py file_embed): a 40x48 tile with the file icon and a tiny
 * uppercase extension, the name at 15/500, a meta line like "PDF, 24 pages, 3.2 MB", and the dots trail.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNx } from '@/theme/nx';
import { NxIcon, type NxIconName } from '../NxIcon';

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}

export function fileExt(name: string, mime?: string | null): string {
  const ext = name.includes('.') ? name.split('.').pop()!.toUpperCase() : '';
  if (ext && ext.length <= 4) return ext;
  if (mime?.includes('pdf')) return 'PDF';
  return 'FILE';
}

function kindLabel(name: string, mime?: string | null): string {
  const ext = fileExt(name, mime);
  if (ext === 'PDF') return 'PDF';
  if (ext === 'DOCX' || ext === 'DOC') return 'Word document';
  if (ext === 'PPTX' || ext === 'PPT') return 'PowerPoint';
  if (mime?.startsWith('image/')) return 'Image';
  if (mime?.startsWith('video/')) return 'Video';
  if (mime?.startsWith('audio/')) return 'Audio';
  return ext === 'FILE' ? 'File' : ext;
}

/** "PDF, 24 pages, 3.2 MB": whatever of the three is known. */
export function fileMeta(name: string, mime?: string | null, bytes?: number | null, pages?: number | null): string {
  return [kindLabel(name, mime), pages ? `${pages} page${pages === 1 ? '' : 's'}` : null, bytes ? formatBytes(bytes) : null].filter(Boolean).join(', ');
}

export function FileEmbed({
  name,
  mime,
  bytes,
  pages,
  meta,
  onPress,
  onMore,
}: {
  name: string;
  mime?: string | null;
  bytes?: number | null;
  pages?: number | null;
  /** Replaces the computed meta line. */
  meta?: string;
  onPress?: () => void;
  onMore?: () => void;
}) {
  const c = useNx();
  const icon: NxIconName = mime?.startsWith('image/') ? 'image' : mime?.startsWith('video/') ? 'play' : mime?.startsWith('audio/') ? 'mic' : 'file';
  return (
    <Card onPress={onPress} label={`Open ${name}`}>
      <View style={[styles.tile, { backgroundColor: c.sel }]}>
        <NxIcon name={icon} size={18} color={c.t2} />
        <Text style={[styles.ext, { color: c.t2 }]}>{fileExt(name, mime)}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[styles.name, { color: c.t1 }]}>
          {name}
        </Text>
        <Text numberOfLines={1} style={[styles.meta, { color: c.t2 }]}>
          {meta ?? fileMeta(name, mime, bytes, pages)}
        </Text>
      </View>
      {onMore ? <Dots onPress={onMore} /> : null}
    </Card>
  );
}

export function BookmarkEmbed({ url, title, onPress, onMore }: { url: string; title?: string | null; onPress?: () => void; onMore?: () => void }) {
  const c = useNx();
  const host = /^https?:\/\/([^/?#]+)/i.exec(url)?.[1]?.replace(/^www\./i, '') ?? url;
  return (
    <Card onPress={onPress} label={`Open ${host}`}>
      <View style={[styles.tile, { backgroundColor: c.sel }]}>
        <NxIcon name="globe" size={18} color={c.t2} />
        <Text style={[styles.ext, { color: c.t2 }]}>LINK</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[styles.name, { color: c.t1 }]}>
          {title || host}
        </Text>
        <Text numberOfLines={1} style={[styles.meta, { color: c.t2 }]}>
          {url.replace(/^https?:\/\//i, '')}
        </Text>
      </View>
      {onMore ? <Dots onPress={onMore} /> : null}
    </Card>
  );
}

function Card({ children, onPress, label }: { children: React.ReactNode; onPress?: () => void; label: string }) {
  const c = useNx();
  const style = [styles.card, { backgroundColor: c.card, borderColor: c.ln }];
  if (!onPress) return <View style={style}>{children}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [style, pressed && { opacity: 0.7 }]}>
      {children}
    </Pressable>
  );
}

function Dots({ onPress }: { onPress: () => void }) {
  const c = useNx();
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button" accessibilityLabel="More">
      <NxIcon name="dots" size={18} color={c.t3} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  tile: { width: 40, height: 48, borderRadius: 6, alignItems: 'center', justifyContent: 'center', gap: 2 },
  ext: { fontSize: 9, fontWeight: '700', letterSpacing: 0.4 },
  name: { fontSize: 15, lineHeight: 20, fontWeight: '500' },
  meta: { fontSize: 13, lineHeight: 18 },
});
