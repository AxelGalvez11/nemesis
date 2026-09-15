/**
 * A picture inside a note, shown inline like Notion, in both the reading view and while typing. The file card is only
 * the fallback when the signed link cannot be made or the picture fails to load. Tapping opens the full picture.
 */
import React, { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { embedUrl, openEmbed } from '@/api/noteMedia';
import { SkelBar, SkelGroup } from '@/components/nx/Skeleton';
import { useNx } from '@/theme/nx';
import { FileEmbed } from './FileEmbed';

export function InlineImage({ src, name, pad }: { src: string; name: string; pad?: { marginLeft: number } }) {
  const c = useNx();
  const url = useQuery({ queryKey: ['embed-url', src], queryFn: () => embedUrl(src), staleTime: 6 * 3600_000 });
  const [ratio, setRatio] = useState(4 / 3);
  const [broken, setBroken] = useState(false);
  if (url.isLoading) {
    return (
      <SkelGroup style={[pad, { marginTop: 6 }]}>
        <SkelBar width="100%" height={200} radius={12} />
      </SkelGroup>
    );
  }
  if (!url.data || broken) {
    return (
      <View style={pad}>
        <FileEmbed name={name} mime="image/*" onPress={() => void openEmbed(src).catch(() => undefined)} />
      </View>
    );
  }
  return (
    <Pressable onPress={() => void openEmbed(src).catch(() => undefined)} style={({ pressed }) => [pad, { marginTop: 6, opacity: pressed ? 0.85 : 1 }]} accessibilityLabel={`Open ${name}`}>
      <Image
        source={{ uri: url.data }}
        onLoad={(e) => {
          const { width, height } = e.nativeEvent.source;
          if (width && height) setRatio(width / height);
        }}
        onError={() => setBroken(true)}
        style={{ width: '100%', aspectRatio: ratio, borderRadius: 12, backgroundColor: c.sel }}
        resizeMode="cover"
      />
    </Pressable>
  );
}
