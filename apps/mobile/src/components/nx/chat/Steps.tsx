/**
 * What the chat did on a turn, from the canvas (AIThinking, AISearching, AISources, AISourcesOpen).
 * Live: the current step shimmers. Settled: one quiet line that opens into the steps. No checkmarks.
 */
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { ChatMsg, ChatSource } from '@/lib/chat-thread';
import { phaseLabel, type ThinkingPhase } from '@/lib/thinking-phase';
import { useNx } from '@/theme/nx';
import { ShimmerText, Spinner } from './Shimmer';
import { MarkStack, QueryPill, ResultRow, StepIcon, StepLabel, StepLine, isNoteSource } from './parts';

export function secondsLabel(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 1) return '';
  return s === 1 ? 'Thought for 1 second' : `Thought for ${s} seconds`;
}

function plural(n: number, one: string, many: string) {
  return n === 1 ? `1 ${one}` : `${n} ${many}`;
}

/** Everything a running turn has shown so far, so earlier steps stay on screen as later ones start. */
export type TurnTrail = { queries: string[]; thoughtMs: number; found: number };

export function LiveSteps({ phase, trail, glimpse }: { phase: ThinkingPhase; trail: TurnTrail; glimpse: string }) {
  const c = useNx();
  const [open, setOpen] = useState(true);
  if (phase.kind === 'writing') return null;
  const live = { fontSize: 15, lineHeight: 20, fontWeight: '500' as const, color: c.t1 };
  const quiet = { fontSize: 15, lineHeight: 20, color: c.t2 };
  const searching = phase.kind === 'searching';
  const past = searching ? trail.queries.slice(0, -1) : trail.queries;
  const thought = trail.queries.length ? secondsLabel(trail.thoughtMs) : '';

  let current: React.ReactNode = null;
  if (searching) {
    current = (
      <>
        <StepLine lead={<StepIcon name="globe" color={c.t2} />}>
          <ShimmerText text="Searching the web" style={live} />
        </StepLine>
        {phase.query.trim() ? (
          <View style={{ flexDirection: 'row' }}>
            <QueryPill query={phase.query.trim()} />
          </View>
        ) : null}
      </>
    );
  } else if (phase.kind === 'reading') {
    current = (
      <StepLine lead={<Spinner color={c.t2} />}>
        <ShimmerText text={phase.sources > 0 ? `Reading ${plural(phase.sources, 'source', 'sources')}` : 'Nothing usable came back, answering without it'} style={live} />
      </StepLine>
    );
  } else if (phase.kind === 'recalling') {
    current = (
      <StepLine lead={<Spinner color={c.t2} />}>
        <ShimmerText text={`Reading ${plural(phase.notes, 'note', 'notes')}`} style={live} />
      </StepLine>
    );
  } else if (phase.kind === 'acting') {
    current = (
      <StepLine lead={<Spinner color={c.t2} />}>
        <ShimmerText text={phaseLabel(phase)} style={live} />
      </StepLine>
    );
  } else {
    current = (
      <>
        {/* No spinner beside "Thinking" (owner 2026-09-15): the shimmering word is the only sign of work. */}
        <StepLine
          onPress={glimpse ? () => setOpen((o) => !o) : undefined}
          trail={glimpse ? <StepIcon name={open ? 'chev_d' : 'chev_r'} size={14} color={c.t3} /> : undefined}
        >
          <ShimmerText text={phase.kind === 'reading-photo' ? 'Reading your photo' : 'Thinking'} style={live} />
        </StepLine>
        {glimpse && open ? (
          <View style={{ borderRadius: 10, backgroundColor: c.sunk, paddingVertical: 10, paddingHorizontal: 12 }}>
            <Text style={{ fontSize: 14, lineHeight: 21, color: c.t2 }}>{glimpse}</Text>
          </View>
        ) : null}
      </>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      {thought ? (
        <StepLine>
          <Text style={quiet}>{thought}</Text>
        </StepLine>
      ) : null}
      {past.map((q, i) => (
        <View key={`${q}-${i}`} style={{ gap: 6 }}>
          <StepLine lead={<StepIcon name="globe" color={c.t2} />}>
            <Text style={quiet}>Searched the web</Text>
          </StepLine>
          <View style={{ flexDirection: 'row' }}>
            <QueryPill query={q} />
          </View>
        </View>
      ))}
      {current}
    </View>
  );
}

/** The settled line: "Searched the web, read 3 sources" (or "Thought for N seconds"), opening into the steps. */
export function SettledSteps({ msg, onOpenSource }: { msg: ChatMsg; onOpenSource: (s: ChatSource) => void }) {
  const c = useNx();
  const [open, setOpen] = useState(false);
  const all = msg.sources ?? [];
  const web = all.filter((s) => !isNoteSource(s));
  const notes = all.filter(isNoteSource);
  const thoughtText = msg.thinking?.text?.trim() ?? '';
  const thought = secondsLabel(msg.thinking?.ms ?? 0);
  const label = web.length ? `Searched the web, read ${plural(web.length, 'source', 'sources')}` : thoughtText ? thought || 'Thought it through' : '';
  if (!label) return null;
  return (
    <View style={{ gap: 12 }}>
      <StepLine onPress={() => setOpen((o) => !o)} trail={<StepIcon name={open ? 'chev_d' : 'chev_r'} size={13} color={c.t3} />}>
        <Text style={{ fontSize: 15, lineHeight: 20, color: c.t2 }}>{label}</Text>
        {!open && web.length ? <MarkStack sources={web} /> : null}
      </StepLine>
      {open ? (
        <View style={{ marginTop: -4, marginLeft: 2, paddingVertical: 2, paddingLeft: 14, borderLeftWidth: 1.5, borderLeftColor: c.ln, gap: 6 }}>
          {thought ? <StepLabel text={thought} /> : null}
          {thoughtText ? (
            <Text numberOfLines={8} style={{ fontSize: 14, lineHeight: 21, color: c.t2 }}>
              {thoughtText}
            </Text>
          ) : null}
          {web.length ? <StepLabel text="Searched the web" /> : null}
          {web.map((s, i) => (
            <ResultRow key={`w${i}`} source={s} onPress={() => onOpenSource(s)} />
          ))}
          {notes.length ? <StepLabel text={`Read ${plural(notes.length, 'note', 'notes')}`} /> : null}
          {notes.map((s, i) => (
            <ResultRow key={`n${i}`} source={s} onPress={() => onOpenSource(s)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
