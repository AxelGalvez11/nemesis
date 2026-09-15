import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { NxIcon, type NxIconName } from '@/components/nx/NxIcon';
import { nxType, useNx } from '@/theme/nx';

// The states around a recording, from the canvas: the property rows under the title (gen.py `props`), the
// "Writing your notes" card (WritingNotes), the failure card (RecordingFailed) and the microphone sheet (MicOff).

export function PropRows({ rows }: { rows: { icon: NxIconName; label: string; value: string }[] }) {
  const c = useNx();
  return (
    <>
      <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
        {rows.map((r) => (
          <View key={r.label} style={styles.prop}>
            <View style={styles.propLabel}>
              <NxIcon name={r.icon} size={16} color={c.t2} />
              <Text style={{ fontSize: 15, color: c.t2 }}>{r.label}</Text>
            </View>
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: c.t1 }}>
              {r.value}
            </Text>
          </View>
        ))}
      </View>
      <View style={{ marginHorizontal: 20, marginTop: 10, height: 1, backgroundColor: c.ln }} />
    </>
  );
}

function Spinner({ color }: { color: string }) {
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.timing(turn, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }));
    a.start();
    return () => a.stop();
  }, [turn]);
  return (
    <Animated.View style={{ transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round">
        <Path d="M12 3a9 9 0 1 0 9 9" />
      </Svg>
    </Animated.View>
  );
}

export function WritingNotesCard({ step }: { step: string }) {
  const c = useNx();
  return (
    <View style={[styles.card, { backgroundColor: c.sunk, gap: 12 }]} accessibilityLiveRegion="polite">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Spinner color={c.t2} />
        <Text style={{ fontSize: 15, fontWeight: '500', color: c.t1 }}>Writing your notes…</Text>
      </View>
      <Text style={[nxType.rowMeta, { color: c.t2 }]}>{step}</Text>
      {[92, 78, 86, 60].map((w) => (
        <View key={w} style={{ height: 12, width: `${w}%`, borderRadius: 4, backgroundColor: c.sel }} />
      ))}
    </View>
  );
}

export function NotesFailedCard({
  body,
  onRetry,
  retrying,
  secondLabel,
  onSecond,
}: {
  body: string;
  onRetry: () => void;
  retrying?: boolean;
  secondLabel: string;
  onSecond: () => void;
}) {
  const c = useNx();
  return (
    <View style={[styles.card, { backgroundColor: c.sunk, flexDirection: 'row', gap: 12 }]}>
      <View style={{ paddingTop: 1 }}>
        <NxIcon name="alert" size={20} color={c.danger} strokeWidth={1.8} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontSize: 15, lineHeight: 21, fontWeight: '600', color: c.t1 }}>These notes could not be written</Text>
        <Text style={{ fontSize: 14, lineHeight: 20, color: c.t2 }}>{body}</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
          <View style={styles.pbSlot}>
            <Pressable
              onPress={onRetry}
              disabled={retrying}
              accessibilityRole="button"
              style={({ pressed }) => [styles.pb, { backgroundColor: c.inv, opacity: pressed || retrying ? 0.7 : 1 }]}
            >
              {retrying ? <ActivityIndicator size="small" color={c.onInv} /> : <NxIcon name="sync" size={16} color={c.onInv} />}
              <Text style={[styles.pbText, { color: c.onInv }]}>Try again</Text>
            </Pressable>
          </View>
          <View style={styles.pbSlot}>
            <Pressable onPress={onSecond} disabled={retrying} accessibilityRole="button" style={({ pressed }) => [styles.pb, { backgroundColor: c.sel, opacity: pressed ? 0.7 : 1 }]}>
              <Text style={[styles.pbText, { color: c.t1 }]}>{secondLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

export function MicOffSheet({ visible, onOpenSettings, onNotNow }: { visible: boolean; onOpenSettings: () => void; onNotNow: () => void }) {
  const c = useNx();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onNotNow}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.dim }]} onPress={onNotNow} accessibilityLabel="Close" />
      <View style={[styles.sheet, { backgroundColor: c.bg }]}>
        <View style={{ width: 36, height: 5, borderRadius: 9999, backgroundColor: c.ring }} />
        <View style={[styles.circle, { backgroundColor: c.sel }]}>
          <NxIcon name="micoff" size={36} color={c.t1} strokeWidth={1.5} />
        </View>
        <Text style={[styles.sheetTitle, { color: c.t1 }]}>Turn on the microphone</Text>
        <Text style={[styles.sheetBody, { color: c.t2 }]}>Microphone access is off for Nemesis. Turn it on in the iPhone Settings app, then tap Record again.</Text>
        <View style={{ alignSelf: 'stretch', paddingHorizontal: 20, paddingTop: 24, gap: 6 }}>
          <Pressable onPress={onOpenSettings} accessibilityRole="button" style={({ pressed }) => [styles.btn, { backgroundColor: c.inv, opacity: pressed ? 0.8 : 1 }]}>
            <Text style={{ fontSize: 16, fontWeight: '500', color: c.onInv }}>Open Settings</Text>
          </Pressable>
          <Pressable onPress={onNotNow} accessibilityRole="button" style={styles.txt}>
            <Text style={{ fontSize: 15, color: c.t2 }}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  prop: { flexDirection: 'row', alignItems: 'center', minHeight: 36, gap: 8 },
  propLabel: { width: 128, flexDirection: 'row', alignItems: 'center', gap: 8 },
  card: { marginHorizontal: 20, marginTop: 16, padding: 16, borderRadius: 10 },
  pbSlot: { height: 44, justifyContent: 'center' },
  pb: { height: 34, paddingHorizontal: 14, borderRadius: 9999, flexDirection: 'row', alignItems: 'center', gap: 6 },
  pbText: { fontSize: 14, fontWeight: '500' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingBottom: 30, alignItems: 'center' },
  circle: { marginTop: 26, width: 72, height: 72, borderRadius: 9999, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { paddingHorizontal: 32, paddingTop: 18, fontSize: 22, lineHeight: 28, fontWeight: '600', textAlign: 'center' },
  sheetBody: { paddingHorizontal: 32, paddingTop: 8, fontSize: 16, lineHeight: 24, textAlign: 'center' },
  btn: { height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  txt: { height: 44, alignItems: 'center', justifyContent: 'center' },
});
