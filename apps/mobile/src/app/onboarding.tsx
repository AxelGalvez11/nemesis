// First run on the phone, rebuilt to the 2026-09 iPhone canvas (gen.py: Studying, ConnectAI,
// ApproveAI, ConnectCalendar, Microphone, Notifications, AnkiSync, AllSet).
//
// Every step either does the real thing or says plainly that it cannot yet:
//  - Studying saves the answer on the Supabase account (user_metadata.field_of_study / study_level,
//    the same keys the Account screen reads).
//  - Connect your AI hands the student off to Claude or ChatGPT with the real MCP address copied.
//    The approval itself happens later on the web consent page (apps/web/app/oauth/consent), which
//    Claude opens; nothing here claims a connection was made.
//  - Google Calendar starts a real Composio connection through /api/composio and then asks the
//    server whether it went through before it says "connected".
//  - Microphone and Notifications ask iOS for the real permissions the app uses.
//  - Anki sync has no add-on or server yet, so that step says so and moves on.
//
// The completion marker (lib/onboarding.ts) is written when the student leaves the last step.

import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { useAuth } from '@/auth/AuthProvider';
import { APP_API_BASE } from '@/api/chat';
import { supabase } from '@/api/supabase';
import { NxIcon } from '@/components/nx/NxIcon';
import { CalendarPreview, MicCard, NotificationPreview } from '@/components/nx/onboarding/illustrations';
import {
  AiLogo,
  CheckLead,
  Chip,
  DriftingGradient,
  Group,
  GroupRow,
  IconBox,
  LinkedTiles,
  ObActions,
  ObText,
  ObTop,
  Pill,
} from '@/components/nx/onboarding/parts';
import { registerForPush, setStudyReminder } from '@/lib/push';
import { writeOnboarding } from '@/lib/onboarding';
import { useNx } from '@/theme/nx';

type Step = 'studying' | 'ai' | 'approve' | 'calendar' | 'mic' | 'notifications' | 'anki' | 'done';
type AiTool = 'Claude' | 'ChatGPT';

const FIELDS = ['Law', 'Engineering', 'Computer science', 'History', 'Nursing', 'Business', 'Biology', 'Psychology', 'Art and design', 'Languages', 'Math', 'Something else'];
const LEVELS = ['High school', 'College', 'Graduate school', 'On my own'];

const BACK: Partial<Record<Step, Step>> = { ai: 'studying', approve: 'ai', calendar: 'ai', mic: 'calendar', notifications: 'mic', anki: 'notifications' };

const MCP_LINK = `${APP_API_BASE}/api/mcp`;
const AI_SETTINGS: Record<AiTool, string> = {
  Claude: 'https://claude.ai/settings/connectors',
  ChatGPT: 'https://chatgpt.com/#settings/Connectors',
};

/** "Studying law in college", "Studying in graduate school", "Studying math". */
function studyingPhrase(field: string | null, level: string | null): string | null {
  if (!field && !level) return null;
  const subject = field && field !== 'Something else' ? ` ${field.toLowerCase()}` : '';
  const where = level ? (level === 'On my own' ? ' on my own' : ` in ${level.toLowerCase()}`) : '';
  return `Studying${subject}${where}`;
}

async function composio(token: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${APP_API_BASE}/api/composio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return (await res.json()) as Record<string, unknown>;
}

export default function OnboardingScreen() {
  const c = useNx();
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const token = session?.access_token ?? null;
  const email = session?.user?.email ?? null;

  const [step, setStep] = useState<Step>('studying');
  const [field, setField] = useState<string | null>(null);
  const [level, setLevel] = useState<string | null>(null);
  const [aiHandoff, setAiHandoff] = useState<AiTool | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [calendarOn, setCalendarOn] = useState(false);
  const [calendarNote, setCalendarNote] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(false);
  const [remindersOn, setRemindersOn] = useState(false);
  const [busy, setBusy] = useState(false);

  const back = BACK[step];
  const goBack = back ? () => setStep(back) : undefined;

  /* ----- Studying ----- */
  const saveStudying = useCallback(() => {
    if (session && (field || level)) {
      // Best-effort: a failed save must not hold the student on the first screen.
      void supabase.auth.updateUser({ data: { field_of_study: field, study_level: level } }).catch(() => {});
    }
    setStep('ai');
  }, [session, field, level]);

  /* ----- Connect your AI ----- */
  const handOff = useCallback(async (tool: AiTool) => {
    await Clipboard.setStringAsync(MCP_LINK);
    setAiHandoff(tool);
    setAiNotice(`Link copied. In ${tool}, add a custom connector and paste it, then approve Nemesis.`);
    setStep('ai');
    await WebBrowser.openBrowserAsync(AI_SETTINGS[tool]).catch(() => {});
  }, []);

  const copyLink = useCallback(async () => {
    await Clipboard.setStringAsync(MCP_LINK);
    setAiNotice('Link copied. Paste it into any AI tool that accepts an MCP connector.');
  }, []);

  /* ----- Google Calendar ----- */
  const connectCalendar = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    setCalendarNote(null);
    try {
      const started = await composio(token, { op: 'connect', app: 'googlecalendar' });
      if (started.configured === false) {
        setCalendarNote('Calendar connections are not switched on yet. You can connect later in Settings.');
        return;
      }
      if (typeof started.url !== 'string') {
        setCalendarNote(typeof started.error === 'string' ? started.error : 'Could not start the connection. Try again.');
        return;
      }
      await WebBrowser.openBrowserAsync(started.url);
      const status = await composio(token, { op: 'status' });
      const connected = Array.isArray(status.connected) && status.connected.includes('googlecalendar');
      if (connected) {
        setCalendarOn(true);
        setStep('mic');
      } else {
        setCalendarNote('Google Calendar is not connected yet. Try again, or choose Not now.');
      }
    } catch {
      setCalendarNote('Nemesis could not reach Google Calendar. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }, [token]);

  /* ----- Microphone ----- */
  const allowMic = useCallback(async () => {
    setBusy(true);
    try {
      // The same request the recorder makes (hooks/useLiveTranscription.ts): microphone and speech.
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      setMicOn(permission.granted);
    } catch {
      setMicOn(false);
    } finally {
      setBusy(false);
      setStep('notifications');
    }
  }, []);

  /* ----- Notifications ----- */
  const allowNotifications = useCallback(async () => {
    setBusy(true);
    try {
      if (uid) {
        const result = await setStudyReminder(uid, true);
        setRemindersOn(result.enabled);
        if (result.enabled) void registerForPush();
      } else {
        const result = await Notifications.requestPermissionsAsync();
        setRemindersOn(result.granted);
      }
    } catch {
      setRemindersOn(false);
    } finally {
      setBusy(false);
      setStep('anki');
    }
  }, [uid]);

  /* ----- All set ----- */
  const finish = useCallback(async () => {
    setBusy(true);
    await writeOnboarding(SecureStore, 'finished', new Date());
    router.replace('/' as never);
  }, []);

  const phrase = studyingPhrase(field, level);
  const summary = [
    phrase,
    aiHandoff ? `${aiHandoff} link copied, finish in ${aiHandoff}` : null,
    calendarOn ? 'Google Calendar connected' : null,
    micOn && remindersOn ? 'Microphone and reminders on' : micOn ? 'Microphone on' : remindersOn ? 'Reminders on' : null,
  ].filter((row): row is string => !!row);

  let body: React.ReactNode;
  switch (step) {
    case 'studying':
      body = (
        <>
          <ObTop step={1} />
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
            <ObText title="What are you studying?" sub="Nemesis writes your notes and flashcards to fit your subject." />
            <View style={styles.chips}>
              {FIELDS.map((f) => (
                <Chip key={f} label={f} on={field === f} onPress={() => setField(field === f ? null : f)} />
              ))}
            </View>
            <Text style={[styles.sec, { color: c.t2 }]}>Where you study</Text>
            <View style={[styles.chips, { paddingTop: 0 }]}>
              {LEVELS.map((l) => (
                <Chip key={l} label={l} on={level === l} onPress={() => setLevel(level === l ? null : l)} />
              ))}
            </View>
            <ObActions primary="Continue" onPrimary={saveStudying} secondary="Skip for now" onSecondary={() => setStep('ai')} />
          </ScrollView>
        </>
      );
      break;

    case 'ai':
      body = (
        <>
          <ObTop step={2} onBack={goBack} />
          <ObText title="Connect your own AI" sub="Claude or ChatGPT can search your notes and make flashcards for you. You decide what it can see." />
          <Group style={{ marginTop: 28 }}>
            <GroupRow lead={<AiLogo kind="claude" />} title="Claude" trail={<Pill go label="Connect" onPress={() => setStep('approve')} />} />
            <GroupRow lead={<AiLogo kind="gpt" />} title="ChatGPT" trail={<Pill go label="Connect" onPress={() => void handOff('ChatGPT')} />} />
            <GroupRow lead={<IconBox name="link" />} title="Another AI tool" trail={<Pill label="Copy link" icon="copy" onPress={() => void copyLink()} />} />
          </Group>
          <ObActions
            primary="Continue"
            onPrimary={() => setStep('calendar')}
            secondary="Skip for now"
            onSecondary={() => setStep('calendar')}
            note={aiNotice ?? 'You can connect or disconnect any AI later in Settings.'}
          />
        </>
      );
      break;

    case 'approve':
      body = (
        <>
          <ObTop onBack={goBack} icon="x" />
          <View style={{ paddingTop: 28 }}>
            <LinkedTiles left={<AiLogo kind="claude" size={56} radius={16} />} />
          </View>
          <ObText
            top={24}
            title="Claude wants access to your Nemesis"
            sub={email ? `It will act as you, signed in as ${email}.` : 'It will act as you, signed in to your account.'}
          />
          <Text style={[styles.sec, { color: c.t2, paddingTop: 26 }]}>Claude will be able to</Text>
          <Group>
            <GroupRow lead={<CheckLead />} title="Search and read your notes" />
            <GroupRow lead={<CheckLead />} title="Create notes" />
            <GroupRow lead={<CheckLead />} title="Make flashcards and practice tests" />
            <GroupRow lead={<CheckLead no />} title="Delete anything" dim />
          </Group>
          <ObActions
            primary="Continue in Claude"
            onPrimary={() => void handOff('Claude')}
            secondary="Cancel"
            onSecondary={() => setStep('ai')}
            note="We copy your Nemesis link and open Claude. Paste it there, and Claude asks you to approve."
          />
        </>
      );
      break;

    case 'calendar':
      body = (
        <>
          <ObTop step={3} onBack={goBack} />
          <CalendarPreview />
          <ObText top={32} title="See your classes coming up" sub="Connect Google Calendar and your next class shows on Notes, ready to record." />
          {token ? (
            <ObActions
              primary="Connect Google Calendar"
              icon="calendar"
              onPrimary={() => void connectCalendar()}
              busy={busy}
              secondary="Not now"
              onSecondary={() => setStep('mic')}
              note={calendarNote ?? 'Nemesis only reads your events. It never changes them.'}
            />
          ) : (
            <ObActions primary="Continue" onPrimary={() => setStep('mic')} note="Sign in to connect Google Calendar." />
          )}
        </>
      );
      break;

    case 'mic':
      body = (
        <>
          <ObTop step={4} onBack={goBack} />
          <MicCard />
          <ObText top={26} title="Record your lectures" sub="Tap Record and Nemesis listens quietly, then writes up clean notes. It only uses the microphone while you record." />
          <ObActions primary="Allow microphone" onPrimary={() => void allowMic()} busy={busy} secondary="Not now" onSecondary={() => setStep('notifications')} />
        </>
      );
      break;

    case 'notifications':
      body = (
        <>
          <ObTop step={5} onBack={goBack} />
          <NotificationPreview />
          <ObText top={36} title="Stay on top of your cards" sub="One reminder a day when cards are due, and a heads-up when your notes are written." />
          <ObActions primary="Turn on notifications" onPrimary={() => void allowNotifications()} busy={busy} secondary="Not now" onSecondary={() => setStep('anki')} />
        </>
      );
      break;

    case 'anki':
      body = (
        <>
          <ObTop step={6} onBack={goBack} />
          <View style={{ paddingTop: 40 }}>
            <LinkedTiles
              left={
                <View style={[styles.ankiTile, { backgroundColor: c.sel }]}>
                  <NxIcon name="cards" size={28} color={c.t1} />
                </View>
              }
            />
          </View>
          <ObText top={24} title="Sync your Anki decks" sub="Study in Anki or in Nemesis. Your decks and reviews stay the same in both." />
          <ObActions
            primary="Continue"
            onPrimary={() => setStep('done')}
            note="Anki sync is not ready yet. This step switches on when the Nemesis add-on for Anki is released."
          />
        </>
      );
      break;

    case 'done':
      body = (
        <>
          <StatusBar style="light" />
          <View style={styles.hero}>
            <DriftingGradient width={width} height={230} tall />
            <View style={styles.heroCheck}>
              <NxIcon name="check" size={40} strokeWidth={2} color="#ffffff" />
            </View>
          </View>
          <ObText
            title="You're all set"
            sub={summary.length > 0 ? 'Here is what you set up. Change any of it in Settings.' : 'You can set any of this up later in Settings.'}
          />
          {summary.length > 0 ? (
            <Group style={{ marginTop: 28 }}>
              {summary.map((row) => (
                <GroupRow key={row} lead={<CheckLead />} title={row} />
              ))}
            </Group>
          ) : null}
          <ObActions primary="Start taking notes" onPrimary={() => void finish()} busy={busy} />
        </>
      );
      break;
  }

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]} testID="onboarding-screen">
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 24, paddingHorizontal: 20 },
  sec: { fontSize: 13, lineHeight: 18, fontWeight: '500', paddingTop: 22, paddingHorizontal: 20, paddingBottom: 8 },
  ankiTile: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  hero: { height: 230, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  heroCheck: { width: 88, height: 88, borderRadius: 44, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
});
