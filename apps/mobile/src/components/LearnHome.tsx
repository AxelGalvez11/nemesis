import * as DocumentPicker from "expo-document-picker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions, type TextInput } from "react-native";
import { useRouter } from "expo-router";

import { startCanvas } from "@/api/canvases";
import { useAuth } from "@/auth/AuthProvider";
import { STUDY_IMAGE_PICKER_TYPES } from "@/lib/study-image-pick";
import { atMentionState, removeAtMention } from "@/lib/at-mention";
import { CAPABILITY_COPY, type ComposerCapability } from "@/learn/web";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { control, space, type } from "@/theme/tokens";
import { COMPOSER_PILL_HEIGHT, Composer } from "./Composer";
import { ComposerPlusMenu, CAPABILITY_ICON, capabilityTint } from "./ComposerPlusMenu";
import { CapabilityPicker } from "./CapabilityPicker";
import { AddFilesSheet, type PickedFile } from "./AddFilesSheet";
import { PhotoCaptureSheet } from "./PhotoCaptureSheet";
import { GlassSurface } from "./GlassSurface";
import { useShell } from "./AppDrawer";
import { useKeyboardVisible, useShellPadding } from "./shell-chrome";
import { LearnHeading } from "./LearnHeading";
import { CloseIcon } from "./icons";
import { VoiceModeIcon } from "./icons-composer";

// The app's front door — the web's `/learn` (canvas-home.tsx), in the ChatGPT iPhone app's
// shape: an empty canvas with a centred greeting and a composer docked at the BOTTOM of the
// page (owner 2026-09-01, "font spacing icons literally everything needs to match one-to-one"
// against IMG_6529/IMG_6532 in ~/Downloads/chatgptios) — not a chat thread, and not the
// vertically-centred group this screen used to render everything as.
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
  const { colors: c, resolvedMode } = useTheme();
  const router = useRouter();
  const { contentTop, contentBottom } = useShellPadding();
  const keyboardUp = useKeyboardVisible();
  const { height: windowHeight } = useWindowDimensions();
  const { setHeaderRight } = useShell();
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;

  const [text, setText] = useState("");
  const [capability, setCapability] = useState<ComposerCapability | null>(null);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [addFilesOpen, setAddFilesOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  // What's staged above the composer's text row (IMG_6528's own "attachment carry-through is
  // the next slice" deferral — see AddFilesSheet.tsx's header and ComposerPlusMenu.tsx's on
  // photos). Nothing here is uploaded or read; picking just stages a small chip. A Library
  // note, an uploaded file, and a photo all land in this ONE list because they're the same
  // kind of thing once staged — a title and an id to show as a chip.
  const [attachments, setAttachments] = useState<readonly PickedFile[]>([]);
  const composerRef = useRef<TextInput>(null);
  const composerWrapRef = useRef<View>(null);
  // Seeded from the tall card's own known height (COMPOSER_PILL_HEIGHT) plus the shell's
  // bottom clearance, so even the one frame before `measureComposer` first runs — the "+" is
  // technically tappable that early, though nobody taps inside a single frame — opens the menu
  // in the right neighbourhood rather than at an arbitrary guess.
  const [menuOffset, setMenuOffset] = useState(() => contentBottom + COMPOSER_PILL_HEIGHT + space(2));

  // The "+" menu AND the "@" picker both open just above the composer. Unlike chat.tsx's
  // composer — pinned to the screen's own bottom edge, so its offset is a sum of known
  // paddings — this composer is docked but its exact top edge still shifts with the chip row,
  // the attachment-chip row, and the keyboard, so the offset is MEASURED off the real block
  // instead.
  const measureComposer = useCallback(() => {
    // A frame late: KeyboardAvoidingView's own padding animates in, and measuring on the same
    // frame as the layout event can catch the card mid-shift.
    requestAnimationFrame(() => {
      composerWrapRef.current?.measureInWindow((_x, y) => {
        // The menu's BOTTOM edge sits 16pt above the card's TOP edge (the reference's picker→composer gap
        // measures ~17pt on IMG_6529). Measuring to the card's
        // bottom put the menu over the card and the heading (seen on the simulator, 2026-09-01).
        setMenuOffset(Math.max(space(2), Math.round(windowHeight - y + space(4))));
      });
    });
  }, [windowHeight]);

  useEffect(() => {
    measureComposer();
  }, [keyboardUp, text, attachments.length, measureComposer]);

  // The header's voice-mode button (IMG_6529, top right) — a round white glass button, same
  // family as every other TopBar right-side action (Graph's gear, Projects' "+"). Voice mode
  // itself needs a live session this slice doesn't build; for now it just focuses the
  // composer, same placeholder the docs/design plan calls for on the composer's own orb
  // button (Composer.tsx's header note on `composer-voice`).
  useEffect(() => {
    setHeaderRight(
      <GlassSurface style={styles.voiceGlass} fallbackColor={c.glassPanel} shadow>
        <Pressable
          accessibilityLabel="Voice"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => composerRef.current?.focus()}
          style={styles.voiceGlassInner}
          testID="learn-home-voice"
        >
          {/* 22pt per the coordinator's redraw ask (was 20). */}
          <VoiceModeIcon size={22} color={c.text} strokeWidth={1.8} />
        </Pressable>
      </GlassSurface>,
    );
    return () => setHeaderRight(null);
  }, [setHeaderRight, styles, c]);

  // The "@" trigger — pure parsing in src/lib/at-mention.ts (Deno-tested), this screen only
  // wires it to the field. Mutually exclusive with the "+" menu: opening one is expected to
  // close the other, or the two floating cards would stack over each other above the composer.
  const atMention = useMemo(() => atMentionState(text), [text]);
  // 🔴 A SEPARATE "DISMISSED" FLAG, NOT JUST `atMention.active`. `pickerVisible` derived from
  // the mention alone would reopen the card on its own next render after an outside tap —
  // there is nothing to CHANGE that removes an "@word" the learner is still typing, so with no
  // memory of the dismissal the picker just comes right back. Any further typing resets it:
  // the learner is presumed to want the picker again the moment they touch the trigger word.
  const [pickerDismissed, setPickerDismissed] = useState(false);
  const pickerVisible = atMention.active && !plusMenuOpen && !pickerDismissed;

  const handleChangeText = (next: string) => {
    setText(next);
    setPickerDismissed(false);
    // Typing "@" while the "+" menu happens to be open closes it, so the picker that's about
    // to appear (see `pickerVisible` above) never stacks under it.
    if (atMentionState(next).active && plusMenuOpen) setPlusMenuOpen(false);
  };

  const pickCapability = (picked: ComposerCapability) => {
    setCapability(picked);
    // Picking via "@" removes the typed "@word" the same way the reference does — the chip
    // replaces it rather than sitting beside it.
    setText((current) => removeAtMention(current, atMentionState(current)));
    composerRef.current?.focus();
  };

  const addPhotosFromDevice = async () => {
    // 🔴 NOT expo-image-picker. That's a native module this build deliberately doesn't carry —
    // adding one would drop the app off OTA updates until the next TestFlight release (see
    // lib/study-image-pick.ts's own header, which made this exact trade already). Its
    // STUDY_IMAGE_PICKER_TYPES exists precisely so a photo can be picked through
    // expo-document-picker, which is already in the build.
    const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false, type: [...STUDY_IMAGE_PICKER_TYPES] });
    if (picked.canceled) return;
    const asset = picked.assets?.[0];
    if (!asset) return;
    setAttachments((current) => [...current, { id: asset.uri, title: asset.name || "Photo" }]);
  };

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
    setAttachments([]);
    // "/canvas" isn't in expo-router's generated route types at every point in this branch's
    // history — see index.tsx's own `as never` for the same reason. The cast is inert once the
    // route exists; it just stops typed-routes from gating a screen this file doesn't own.
    router.push({
      pathname: "/canvas",
      params: { c: canvas.id, ask: said, ...(cap ? { cap } : {}) },
    } as never);
  };

  const chip = capability
    ? {
        label: CAPABILITY_COPY[capability].label,
        icon: (() => {
          const Icon = CAPABILITY_ICON[capability];
          return <Icon size={16} color={capabilityTint(capability, resolvedMode === "dark")} />;
        })(),
        onRemove: () => setCapability(null),
      }
    : undefined;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0}>
      <View style={[styles.flex, { paddingTop: contentTop }]}>
        {/* The greeting owns whatever vertical room is left ABOVE the docked composer —
            centred in THAT space, not the whole screen, which is why this is its own flex:1
            block rather than the single centred group the screen used to render everything
            as. */}
        <View style={styles.headingArea}>
          <LearnHeading />
          <Text style={styles.help}>Ask anything, or pick what to make with +</Text>
        </View>
        <View style={[styles.dock, { paddingBottom: contentBottom }]}>
          {attachments.length > 0 ? (
            <View style={styles.attachmentChips} testID="learn-home-attachments">
              {attachments.map((file) => (
                <Pressable
                  key={file.id}
                  style={styles.attachmentChip}
                  onPress={() => setAttachments((current) => current.filter((f) => f.id !== file.id))}
                  accessibilityLabel={`Remove ${file.title}`}
                >
                  <Text style={styles.attachmentChipLabel} numberOfLines={1}>
                    {file.title}
                  </Text>
                  <CloseIcon size={10} color={c.text2} />
                </Pressable>
              ))}
            </View>
          ) : null}
          <View ref={composerWrapRef} onLayout={measureComposer} style={styles.composerWrap}>
            <Composer
              value={text}
              onChangeText={handleChangeText}
              onSend={handleSend}
              onPlus={() => setPlusMenuOpen((open) => !open)}
              placeholder={capability ? CAPABILITY_COPY[capability].prompt : "Ask Nemesis"}
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
              chip={chip}
            />
          </View>
        </View>
      </View>
      <ComposerPlusMenu
        visible={plusMenuOpen}
        onClose={() => setPlusMenuOpen(false)}
        bottomOffset={menuOffset}
        // The front door's own three attach rows (IMG_6529) — distinct from chat.tsx's
        // Library/file/camera trio, see this component's own header comment.
        onAddPhotos={() => void addPhotosFromDevice()}
        onTakePhoto={() => setCameraOpen(true)}
        onAddFiles={() => setAddFilesOpen(true)}
        capabilities={{ onSelect: pickCapability }}
      />
      <CapabilityPicker
        visible={pickerVisible}
        // Dismiss only — the typed "@word" stays exactly as CapabilityPicker.tsx's own header
        // promises ("the typed text is left alone"). Only a PICK strips it (pickCapability).
        onClose={() => setPickerDismissed(true)}
        bottomOffset={menuOffset}
        insetHorizontal={COMPOSER_INSET}
        query={atMention.query}
        onPick={pickCapability}
      />
      <AddFilesSheet
        visible={addFilesOpen}
        onClose={() => setAddFilesOpen(false)}
        onDone={(files) => setAttachments((current) => [...current, ...files])}
        uid={uid}
      />
      <PhotoCaptureSheet
        visible={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCaptured={(uri) => {
          setCameraOpen(false);
          setAttachments((current) => [...current, { id: uri, title: "Photo" }]);
        }}
      />
    </KeyboardAvoidingView>
  );
}

// Measured on the reference (IMG_6529, 3x): the composer/picker cards sit ~13pt in from each
// screen edge, not the page's general `inset.page` (20) — see ComposerPlusMenu.tsx's own
// CAPABILITY_CARD_RADIUS comment for the same "specific to these two floating cards" reasoning.
const COMPOSER_INSET = space(3.5);

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    headingArea: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space(5) },
    help: { ...type.small, color: c.text3, marginTop: space(2.5), textAlign: "center" },
    dock: { paddingHorizontal: COMPOSER_INSET, paddingTop: space(2) },
    composerWrap: { width: "100%" },
    attachmentChips: { flexDirection: "row", flexWrap: "wrap", gap: space(1.5), marginBottom: space(2) },
    attachmentChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: space(1),
      maxWidth: 180,
      paddingVertical: space(1),
      paddingHorizontal: space(2.5),
      borderRadius: 999,
      backgroundColor: c.surface2,
      borderWidth: 1,
      borderColor: c.line,
    },
    attachmentChipLabel: { ...type.micro, color: c.text, flexShrink: 1 },
    voiceGlass: { width: control.lg, height: control.lg, borderRadius: control.lg / 2, borderWidth: 1, borderColor: c.line },
    voiceGlassInner: { flex: 1, alignItems: "center", justifyContent: "center" },
  });
