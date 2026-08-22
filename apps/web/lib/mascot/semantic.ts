// Product-facing mascot vocabulary.
//
// The animation engine intentionally has a smaller physical vocabulary than the product
// has semantic events. This file is the adapter: Canvas can say `building_curriculum`
// or `awaiting_answer` without knowing which physical motion communicates it. Keeping
// this mapping outside the engine preserves the Bloub-style rule that the core remains
// pure animation data rather than learning-product business logic.

import type { MascotState } from "./types";

export type MascotSemanticState =
  | "idle"
  | "attentive"
  | "listening"
  | "transcribing"
  | "thinking"
  | "thinking_deep"
  | "planning"
  | "searching_web"
  | "reading_source"
  | "cross_referencing"
  | "verifying"
  | "uncertain"
  | "document_received"
  | "ingesting"
  | "scanning_documents"
  | "extracting_text"
  | "extracting_figures"
  | "understanding_figure"
  | "organizing_documents"
  | "connecting_concepts"
  | "curriculum_from_docs"
  | "mapping_subject"
  | "building_curriculum"
  | "checking_prerequisites"
  | "diagnosing_level"
  | "curriculum_ready"
  | "resume_curriculum"
  | "node_complete"
  | "milestone"
  | "curriculum_complete"
  | "teaching"
  | "explaining_step"
  | "emphasizing"
  | "analogy"
  | "example"
  | "worked_problem"
  | "drawing_diagram"
  | "plotting"
  | "compare_contrast"
  | "storytelling"
  | "asking_question"
  | "awaiting_answer"
  | "user_typing"
  | "user_thinking"
  | "hint_available"
  | "giving_hint"
  | "challenge"
  | "evaluating_answer"
  | "correct"
  | "strong_answer"
  | "near_correct"
  | "incorrect"
  | "misconception_detected"
  | "contradiction_detected"
  | "correction"
  | "breakthrough"
  | "mastery"
  | "speaking"
  | "voice_paused"
  | "hearing_user"
  | "interrupted"
  | "tool_running"
  | "coding"
  | "calculating"
  | "generating_visual"
  | "saving"
  | "syncing"
  | "retrying"
  | "error"
  | "offline"
  | "reconnected"
  | "sleepy_idle"
  | "wake"
  | "curious_idle"
  | "tiny_wink";

/**
 * Presets are complete enough for the product to render directly and deliberately
 * reuse physical motions. Distinction can come from gaze, expression and intensity;
 * the mascot does not need 75 unrelated silhouettes to communicate 75 system events.
 */
export const SEMANTIC_MASCOT: Readonly<Record<MascotSemanticState, MascotState>> = Object.freeze({
  idle: { mode: "idle" },
  attentive: { mode: "notice", focus: "user" },
  listening: { mode: "listening", focus: "user" },
  transcribing: { mode: "writing", focus: "composer", expression: "narrow" },
  thinking: { mode: "thinking", focus: "none" },
  thinking_deep: { mode: "thinking", focus: "none", expression: "narrow", intensity: 1 },
  planning: { mode: "thinking", focus: "canvas", expression: "keen", intensity: 0.82 },
  searching_web: { mode: "searching", focus: "source" },
  reading_source: { mode: "reading", focus: "source" },
  cross_referencing: { mode: "searching", focus: "source", expression: "narrow", intensity: 0.78 },
  verifying: { mode: "evaluating", focus: "source", expression: "narrow", intensity: 0.72 },
  uncertain: { mode: "confusion", focus: "source", expression: "concerned", intensity: 0.55 },

  document_received: { mode: "greeting", focus: "canvas", intensity: 0.62 },
  ingesting: { mode: "ingesting", focus: "source" },
  scanning_documents: { mode: "reading", focus: "source", intensity: 0.86 },
  extracting_text: { mode: "writing", focus: "source", intensity: 0.72 },
  extracting_figures: { mode: "searching", focus: "source", expression: "keen", intensity: 0.7 },
  understanding_figure: { mode: "generating-visual", focus: "canvas", expression: "keen", intensity: 0.82 },
  organizing_documents: { mode: "ingesting", focus: "canvas", intensity: 0.7 },
  connecting_concepts: { mode: "generating-visual", focus: "canvas", expression: "narrow", intensity: 0.78 },
  curriculum_from_docs: { mode: "generating-visual", focus: "canvas", expression: "keen" },

  mapping_subject: { mode: "searching", focus: "canvas", expression: "keen", intensity: 0.84 },
  building_curriculum: { mode: "generating-visual", focus: "canvas", expression: "narrow", intensity: 0.9 },
  checking_prerequisites: { mode: "reading", focus: "source", expression: "narrow", intensity: 0.76 },
  diagnosing_level: { mode: "evaluating", focus: "user", expression: "keen", intensity: 0.62 },
  curriculum_ready: { mode: "success", focus: "user", intensity: 0.5 },
  resume_curriculum: { mode: "notice", focus: "canvas", expression: "keen" },
  node_complete: { mode: "correct", focus: "canvas", intensity: 0.55 },
  milestone: { mode: "success", focus: "user" },
  curriculum_complete: { mode: "complete", focus: "user" },

  teaching: { mode: "teaching", focus: "canvas" },
  explaining_step: { mode: "teaching", focus: "canvas", expression: "keen", intensity: 0.78 },
  emphasizing: { mode: "nod", focus: "canvas", expression: "keen", intensity: 0.62 },
  analogy: { mode: "curious", focus: "canvas", expression: "wry", intensity: 0.65 },
  example: { mode: "notice", focus: "canvas", expression: "keen", intensity: 0.65 },
  worked_problem: { mode: "writing", focus: "canvas", expression: "narrow", intensity: 0.8 },
  drawing_diagram: { mode: "generating-visual", focus: "canvas" },
  plotting: { mode: "generating-visual", focus: "canvas", expression: "narrow", intensity: 0.8 },
  compare_contrast: { mode: "searching", focus: "canvas", expression: "narrow", intensity: 0.62 },
  storytelling: { mode: "teaching", focus: "canvas", expression: "soft", intensity: 0.7 },

  asking_question: { mode: "question", focus: "user" },
  awaiting_answer: { mode: "waiting", focus: "composer" },
  user_typing: { mode: "waiting", focus: "composer", expression: "keen", intensity: 0.45 },
  user_thinking: { mode: "waiting", focus: "user", intensity: 0.35 },
  hint_available: { mode: "curious", focus: "user", expression: "wry", intensity: 0.48 },
  giving_hint: { mode: "teaching", focus: "canvas", expression: "soft", intensity: 0.62 },
  challenge: { mode: "question", focus: "user", expression: "narrow", intensity: 0.9 },

  evaluating_answer: { mode: "evaluating", focus: "response" },
  correct: { mode: "correct", focus: "user" },
  strong_answer: { mode: "insight", focus: "user", intensity: 0.52 },
  near_correct: { mode: "partial", focus: "response" },
  incorrect: { mode: "incorrect", focus: "response" },
  misconception_detected: { mode: "confusion", focus: "response", expression: "narrow" },
  contradiction_detected: { mode: "confusion", focus: "response", expression: "narrow", intensity: 0.78 },
  correction: { mode: "teaching", focus: "canvas", expression: "neutral", intensity: 0.82 },
  breakthrough: { mode: "insight", focus: "user" },
  mastery: { mode: "success", focus: "user", intensity: 0.7 },

  speaking: { mode: "speaking", focus: "canvas" },
  voice_paused: { mode: "idle", focus: "canvas", intensity: 0.55 },
  hearing_user: { mode: "listening", focus: "user" },
  interrupted: { mode: "alert", focus: "user", expression: "wide", intensity: 0.6 },

  tool_running: { mode: "thinking", focus: "none", intensity: 0.55 },
  coding: { mode: "writing", focus: "canvas", expression: "narrow" },
  calculating: { mode: "evaluating", focus: "canvas", expression: "narrow", intensity: 0.72 },
  generating_visual: { mode: "generating-visual", focus: "canvas" },
  saving: { mode: "nod", focus: "canvas", intensity: 0.35 },
  syncing: { mode: "ingesting", focus: "none", intensity: 0.42 },
  retrying: { mode: "notice", focus: "canvas", expression: "narrow", intensity: 0.55 },
  error: { mode: "alert", focus: "user", expression: "concerned", intensity: 0.62 },
  offline: { mode: "inactive", focus: "none", expression: "weary", intensity: 0.55 },
  reconnected: { mode: "greeting", focus: "user", intensity: 0.42 },

  sleepy_idle: { mode: "inactive", focus: "none" },
  wake: { mode: "greeting", focus: "user", intensity: 0.42 },
  curious_idle: { mode: "curious", focus: "user", intensity: 0.45 },
  tiny_wink: { mode: "wink", focus: "user", intensity: 0.55 },
});

export const mascotStateFor = (semantic: MascotSemanticState): MascotState => SEMANTIC_MASCOT[semantic];
