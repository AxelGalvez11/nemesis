import { useCallback, useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View, useWindowDimensions, type TextInput } from "react-native";
import { useRouter } from "expo-router";

import { startCanvas } from "@/api/canvases";
import { CAPABILITY_COPY, type ComposerCapability } from "@/learn/web";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { space, type } from "@/theme/tokens";
import { COMPOSER_PILL_HEIGHT, Composer } from "./Composer";
import { ComposerPlusMenu } from "./ComposerPlusMenu";
import { useKeyboardVisible, useShellPadding } from "./shell-chrome";
import { LearnHeading } from "./LearnHeading";
import { SparkleIcon } from "./icons";

// The app's front door — the web's `/learn` (canvas-home.tsx), in the ChatGPT iPhone app's
// shape: an empty canvas with a centred greeting and a composer, not a chat thread. See
// docs/design/ios-web-parity-2026-09.md, slice 1.
//
// NOT A DASHBOARD, NOT A FILE BROWSER — the web's own file states this rule for itself (owner
// 2026-08-14/2026-08-15: past canvases were tried here twice and both times were the wrong
// screen for them). This screen is only ever the greeting, the composer, and the one line
// saying what it accepts; the drawer owns the learner's actual canvas list.
//
// UNSAVED UNTIL THE FIRST REPLY. `startCanvas()` mints an id locally and writes nothing to
// Supabase — the canvas screen (src/app/(tabs)/canvas.tsx) saves on its first exchange, exactly
// as api/canvases.ts's own header describes ("nothing is created by pressing this, only by
// beginning").
export function LearnHome() {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const router = useRouter();
  const { contentTop, contentBottom } = useShellPadding();
  const keyboardUp = useKeyboardVisible();
  const { height: windowHeight } = useWindowDimensions();

  const [text, setText] = useState("");
  const [capability, setCapability] = useState<ComposerCapability | null>(null);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const composerRef = useRef<TextInput>(null);
  const composerWrapRef = useRef<View>(null);
  // Seeded from the tall card's own known height (COMPOSER_PILL_HEIGHT) plus the shell's
  // bottom clearance, so even the one frame before `measureComposer` first runs — the "+" is
  // technically tappable that early, though nobody taps inside a single frame — opens the menu
  // in the right neighbourhood rather than at an arbitrary guess.
  const [menuOffset, setMenuOffset] = useState(() => contentBottom + COMPOSER_PILL_HEIGHT + space(2));

  // The "+" menu opens just above the composer card. Unlike chat.tsx's composer — pinned to
  // the screen's own bottom edge, so its offset is a sum of known paddings — this composer
  // sits in a VERTICALLY CENTRED group (see `center` below): its on-screen position depends on
  // content height and the keyboard, so the offset is MEASURED off the real card instead.
  const measureComposer = useCallback(() => {
    // A frame late: KeyboardAvoidingView's own padding animates in, and measuring on the same
    // frame as the layout event can catch the card mid-shift.
    requestAnimationFrame(() => {
      composerWrapRef.current?.measureInWindow((_x, y, _width, height) => {
        setMenuOffset(Math.max(space(2), Math.round(windowHeight - (y + height) + space(2))));
      });
    });
  }, [windowHeight]);

  useEffect(() => {
    measureComposer();
  }, [keyboardUp, measureComposer]);

  const handleSend = () => {
    const said = text.trim();
    // A capability alone can't send — it is a declaration ABOUT words (§38; see
    // composer-capability.ts). Composer's own send button is already disabled for this case
    // (see its `chipBlocksSend`); this guards the same rule at the one other place a send can
    // fire from (this function is also reachable via the button's onPress with nothing typed
    // if a future caller wires a hardware "go" key to it).
    if (!said) return;
    const canvas = startCanvas();
    const cap = capability;
    setText("");
    setCapability(null);
    // "/canvas" isn't in expo-router's generated route types at every point in this branch's
    // history — see index.tsx's own `as never` for the same reason. The cast is inert once the
    // route exists; it just stops typed-routes from gating a screen this file doesn't own.
    router.push({
      pathname: "/canvas",
      params: { c: canvas.id, ask: said, ...(cap ? { cap } : {}) },
    } as never);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0}>
      <View style={[styles.center, { paddingTop: contentTop, paddingBottom: contentBottom }]}>
        <View style={styles.avatar}>
          {/* Placeholder for the web's animated NemesisAvatar (canvas-home.tsx's `greeter`,
              lib/avatar — an SVG + requestAnimationFrame engine). Porting it to
              react-native-svg + reanimated is slice 4 of the parity doc, not this one; a static
              mark keeps the front door from reading as broken in the meantime. */}
          <SparkleIcon size={38} color={c.accent} strokeWidth={1.5} />
        </View>
        <LearnHeading />
        <Text style={styles.help}>Ask anything, or pick what to make with +</Text>
        <View ref={composerWrapRef} onLayout={measureComposer} style={styles.composerWrap}>
          <Composer
            value={text}
            onChangeText={setText}
            onSend={handleSend}
            onPlus={() => setPlusMenuOpen((open) => !open)}
            placeholder={capability ? CAPABILITY_COPY[capability].prompt : "What do you want to learn?"}
            inputRef={composerRef}
            testID="learn-home-input"
            // Always the tall two-row card (owner spec for this screen). Unlike chat.tsx's
            // composer, which shrinks to one row once a conversation exists, this screen never
            // has one to shrink for.
            compact={false}
            // Record mode is deliberately OMITTED here (no `mode`/`onModeChange` wired): it
            // needs a live session tied to a thread id (RecordSession/chat.tsx's
            // `recordRef`/`threadId` plumbing), and there is no canvas yet for a capture made
            // before the first word is typed to belong to. Dictation (the mic button) is
            // unaffected — it doesn't depend on `mode` and works exactly as it does in chat.tsx.
            chip={
              capability
                ? { label: CAPABILITY_COPY[capability].label, onRemove: () => setCapability(null) }
                : undefined
            }
          />
        </View>
      </View>
      <ComposerPlusMenu
        visible={plusMenuOpen}
        onClose={() => setPlusMenuOpen(false)}
        bottomOffset={menuOffset}
        // No attach rows on the front door — see ComposerPlusMenu.tsx's own note. Attachments
        // here (`onAttach`/`onAddFile`/`onTakePhoto`) are the next slice.
        capabilities={{
          onSelect: (picked) => {
            setCapability(picked);
            composerRef.current?.focus();
          },
        }}
      />
    </KeyboardAvoidingView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space(5) },
    avatar: {
      width: 96,
      height: 96,
      borderRadius: 48,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.surface2,
      marginBottom: space(5),
    },
    help: { ...type.small, color: c.text3, marginTop: space(2.5), marginBottom: space(5), textAlign: "center" },
    composerWrap: { width: "100%", maxWidth: 560 },
  });
