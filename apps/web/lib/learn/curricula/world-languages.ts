// Introductory world languages. Library sweep 2026-08-23. Bare language names ARE aliased —
// "teach me spanish" names one subject unambiguously (depth is the clarify question's job, not
// subject identity), unlike bare "biology" or "physics" which fork into different courses.

import { course, t, type TopicSpec } from "./authoring";

/** The shared shape of a first course in a language: what changes is the language's own hard
 *  parts, added per course below. Structure synthesised from how first-year courses are built
 *  everywhere — greetings before past tenses is a fact about learning, not anyone's syllabus. */
function firstYear(extra: readonly TopicSpec[]): readonly TopicSpec[] {
  return [
    t("Sounds and pronunciation", { outcome: "be understood saying what you can say" }),
    t("Greetings and introductions", { outcome: "meet someone and manage the first minute" }),
    t("Everyday vocabulary", { aliases: ["numbers", "days", "family"], outcome: "handle numbers, time, family and daily objects" }),
    t("Present tense", { outcome: "say what you do and what is happening" }),
    t("Questions and negation", { outcome: "ask, answer and disagree" }),
    t("Describing people and things", { aliases: ["adjectives"], outcome: "describe with correct agreement" }),
    t("Daily life situations", { aliases: ["ordering food", "directions"], outcome: "order, shop and navigate politely" }),
    t("Past tenses", { outcome: "tell what happened yesterday" }),
    t("Future and plans", { outcome: "talk about what comes next" }),
    ...extra,
  ];
}

export const WORLD_LANGUAGE_COURSES = [
  course("spanish-language", "Spanish", ["spanish", "intro spanish", "spanish 101", "ap spanish", "learn spanish"], firstYear([
    t("Ser and estar", { outcome: "choose the right 'to be' and say why" }),
    t("The preterite and imperfect", { outcome: "pick the past tense the story needs" }),
  ])),
  course("french-language", "French", ["french", "intro french", "french 101", "ap french", "learn french"], firstYear([
    t("Gender and articles", { outcome: "manage le, la and the contractions" }),
    t("Passé composé and imparfait", { outcome: "pick the past tense the story needs" }),
  ])),
  course("german-language", "German", ["german", "intro german", "german 101", "ap german", "learn german"], firstYear([
    t("Cases", { aliases: ["nominative", "accusative", "dative"], outcome: "pick the case the sentence's roles require" }),
    t("Word order", { outcome: "put the verb where German wants it" }),
  ])),
  course("latin-language", "Latin", ["latin", "intro latin", "latin 101", "ap latin", "learn latin"], [
    t("Pronunciation and reading aloud", { outcome: "read Latin aloud convincingly" }),
    t("Nouns and the case system", { aliases: ["declensions"], outcome: "decline and recognise the five declensions" }),
    t("Verbs in the present system", { aliases: ["conjugations"], outcome: "conjugate across the four conjugations" }),
    t("Adjectives and agreement", { outcome: "match adjectives across gender, number, case" }),
    t("The perfect system", { outcome: "handle completed action" }),
    t("Pronouns", { outcome: "track who does what to whom" }),
    t("Infinitives and participles", { outcome: "read the verbal nouns and adjectives everywhere in real Latin" }),
    t("Subordinate clauses and the subjunctive", { outcome: "parse purpose, result and indirect speech" }),
    t("Reading real texts", { aliases: ["caesar", "vergil"], outcome: "work through adapted and then unadapted passages" }),
  ]),
  course("chinese-language", "Mandarin Chinese", ["chinese", "mandarin", "intro chinese", "chinese 101", "ap chinese", "learn chinese"], [
    t("Pinyin and tones", { aliases: ["tones"], outcome: "produce and hear the four tones" }),
    t("Characters and radicals", { aliases: ["hanzi"], outcome: "read and write the first few hundred characters" }),
    t("Greetings and introductions", { outcome: "manage the first minute politely" }),
    t("Everyday vocabulary", { aliases: ["numbers", "family"], outcome: "handle numbers, time, family and daily objects" }),
    t("Basic sentence patterns", { outcome: "build subject–verb–object sentences and questions" }),
    t("Measure words", { outcome: "count things with the right classifier" }),
    t("Talking about time and plans", { outcome: "place events in time without tense" }),
    t("Daily life situations", { aliases: ["ordering food", "shopping"], outcome: "order, shop and navigate politely" }),
    t("Aspect and completed action", { aliases: ["le"], outcome: "use 了 without superstition" }),
  ]),
  course("japanese-language", "Japanese", ["japanese", "intro japanese", "japanese 101", "ap japanese", "learn japanese"], [
    t("Hiragana and katakana", { aliases: ["kana"], outcome: "read and write both syllabaries" }),
    t("Pronunciation and pitch", { outcome: "sound natural on the basics" }),
    t("Greetings and introductions", { outcome: "manage the first minute politely" }),
    t("Basic sentence structure", { aliases: ["particles"], outcome: "mark topics and objects with は, が and を" }),
    t("Everyday vocabulary", { aliases: ["numbers", "family"], outcome: "handle numbers, time, family and daily objects" }),
    t("Verbs and politeness levels", { aliases: ["masu form"], outcome: "conjugate the polite and plain forms" }),
    t("Adjectives", { outcome: "use both adjective families in past and negative" }),
    t("Daily life situations", { aliases: ["ordering food", "directions"], outcome: "order, shop and navigate politely" }),
    t("First kanji", { aliases: ["kanji"], outcome: "read the first hundred kanji in context" }),
  ]),
  course("asl", "American Sign Language", ["sign language", "asl 101", "intro asl", "learn asl"], [
    t("The manual alphabet and fingerspelling", { outcome: "fingerspell names cleanly and read them back" }),
    t("Basic conversation", { outcome: "introduce yourself and hold the first exchange" }),
    t("Facial grammar", { aliases: ["non-manual markers"], outcome: "mark questions and intensity with the face, as the grammar requires" }),
    t("Everyday vocabulary", { aliases: ["numbers", "family"], outcome: "sign numbers, time, family and daily objects" }),
    t("Sentence structure and space", { outcome: "place people in space and refer back to them" }),
    t("Classifiers", { outcome: "show movement and shape with classifier handshapes" }),
    t("Describing and narrating", { outcome: "tell a short story visually" }),
    t("Deaf culture", { outcome: "engage the community's norms and history respectfully" }),
  ]),
] as const;
