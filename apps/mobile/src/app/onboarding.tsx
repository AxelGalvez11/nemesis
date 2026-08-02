// First run on the phone. ONE screen, on purpose.
//
// The web flow has three steps (courses, syllabi, coursework). The phone gets
// only the first, and that is a deliberate cut rather than an unfinished port:
//
//  - THE SYLLABUS STEP would be inventing a screen for a path that already
//    exists in chat, where a student attaches the file and the agent calls
//    add_calendar_event. A second front door to the same thing is a maintenance
//    cost and a choice the student has to make.
//  - THE COURSEWORK STEP is about the browser extension, which is a DESKTOP
//    thing. It cannot run on an iPhone. A screen explaining a button the student
//    cannot press on this device is a screen that should not exist.
//  - THE PLAN STEP is deliberately absent too. Apple's rules mean the only
//    lawful sell here is in-app purchase, and the right moment to offer it is
//    when a student hits the free recording ceiling mid-lecture — see
//    UpgradeSheet — not thirty seconds after install, before they have used
//    anything.
//
// What is left is the only question whose answer the app genuinely cannot work
// without: what are you taking. There is no courses table; a course EXISTS
// because a Library folder or a calendar event names it. So this screen writes
// real folders, and everything the student records, photographs or imports
// afterwards has somewhere to file itself.

import { useCallback, useState } from "react";
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import {
  addCourse,
  ONBOARDING_MAX_COURSES,
  removeCourse,
  splitCourseInput,
} from "@nemesis/shared";
import { useAuth } from "@/auth/AuthProvider";
import { createFolder, fetchLibrary } from "@/api/cloudLibrary";
import { newThreadId } from "@/api/chat";
import { MissionButton } from "@/components/mission-ui";
import { CloseIcon } from "@/components/icons";
import { writeOnboarding } from "@/lib/onboarding";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { control, radius, space, type } from "@/theme/tokens";

/** Deliberately spans disciplines. A student should see their own subject in the
 *  first two seconds; a placeholder full of one field quietly says the app is
 *  not for everyone else. */
const PLACEHOLDER = "Contract Law, Thermodynamics II, Welding…";

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;

  const [courses, setCourses] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  /** Commit whatever is typed. Splits on commas and newlines, so a student who
   *  pastes their whole timetable in one go gets every course rather than one
   *  long folder name. */
  const commitDraft = useCallback(() => {
    setCourses((current) => splitCourseInput(draft).reduce(addCourse, current));
    setDraft("");
  }, [draft]);

  /** Leave, one way or the other.
   *
   *  🔴 THE MARKER IS WRITTEN BEFORE THE FOLDERS, AND NEITHER CAN STRAND THE
   *  STUDENT. A folder write that fails must not trap somebody on the setup
   *  screen forever, and a student who has answered the question has answered it
   *  whether or not the network agreed. Everything here is best-effort; the
   *  navigation at the end is not. */
  const finish = useCallback(
    async (outcome: "finished" | "skipped", names: readonly string[]) => {
      setBusy(true);
      Keyboard.dismiss();
      await writeOnboarding(SecureStore, outcome, new Date());
      if (uid && names.length > 0) {
        try {
          // Read the tree once and reuse it: createFolder needs a snapshot to
          // spot collisions, and refetching per course would be N round trips
          // to answer the same question.
          const snapshot = await fetchLibrary(uid);
          for (const name of names) {
            try {
              await createFolder(uid, snapshot, name);
            } catch {
              // A duplicate or a rejected name is not worth stopping setup for.
              // The student keeps the rest, and can add this one from Library.
            }
          }
        } catch {
          // Could not read the Library at all — offline, most likely. The course
          // names are not lost in any way that matters: the student types them
          // again in Library, or the first note they file creates the folder.
        }
      }
      router.replace(`/chat?c=${newThreadId()}` as never);
    },
    [uid],
  );

  const pending = splitCourseInput(draft);
  const total = courses.length + pending.length;
  const full = courses.length >= ONBOARDING_MAX_COURSES;

  return (
    <View style={[styles.root, { paddingTop: insets.top + space(3) }]} testID="onboarding-screen">
      <View style={styles.skipRow}>
        <Pressable
          onPress={() => void finish("skipped", [])}
          hitSlop={12}
          disabled={busy}
          accessibilityRole="button"
          testID="onboarding-skip"
        >
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>What are you taking?</Text>
        <Text style={styles.blurb}>
          Everything you add later files itself into these. You can change them any time.
        </Text>

        <TextInput
          style={styles.field}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={commitDraft}
          onBlur={commitDraft}
          placeholder={PLACEHOLDER}
          placeholderTextColor={styles.placeholder.color}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          editable={!busy && !full}
          multiline
          testID="onboarding-input"
        />

        <View style={styles.chips}>
          {courses.map((name) => (
            <Pressable
              key={name}
              style={styles.chip}
              onPress={() => setCourses((current) => removeCourse(current, name))}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${name}`}
              testID={`onboarding-chip-${name}`}
            >
              <Text style={styles.chipText}>{name}</Text>
              <CloseIcon size={13} color={styles.placeholder.color} />
            </Pressable>
          ))}
        </View>

        {full ? <Text style={styles.note}>That is as many as setup takes. Add more from Library.</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space(3) }]}>
        <MissionButton
          label={total > 0 ? "Start using Nemesis" : "Skip for now"}
          onPress={() => void finish(total > 0 ? "finished" : "skipped", [...courses, ...pending])}
          variant="primary"
          busy={busy}
          testID="onboarding-continue"
        />
      </View>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    skipRow: { alignItems: "flex-end", paddingHorizontal: space(4), paddingBottom: space(4) },
    skip: { ...type.small, color: c.textHint },
    body: { paddingHorizontal: space(5), paddingBottom: space(6) },
    title: { ...type.h1, color: c.text, marginBottom: space(2) },
    blurb: { ...type.small, color: c.textHint, marginBottom: space(5) },
    // A pill rather than a boxed field, matching the auth screens' 52pt inputs.
    // multiline, because a pasted timetable is several lines and a single-line
    // field would hide everything but the last one behind the caret.
    field: {
      ...type.body,
      color: c.text,
      backgroundColor: c.glass,
      borderColor: c.line,
      borderRadius: radius.xl,
      borderWidth: 1,
      minHeight: control.xl,
      paddingHorizontal: space(4),
      paddingVertical: space(3),
    },
    placeholder: { color: c.textHint },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: space(2), marginTop: space(4) },
    chip: {
      alignItems: "center",
      backgroundColor: c.glass,
      borderColor: c.line,
      borderRadius: radius.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: space(2),
      paddingHorizontal: space(3),
      paddingVertical: space(2),
    },
    chipText: { ...type.small, color: c.text },
    note: { ...type.micro, color: c.textHint, marginTop: space(4) },
    footer: { paddingHorizontal: space(5), paddingTop: space(3) },
  });
