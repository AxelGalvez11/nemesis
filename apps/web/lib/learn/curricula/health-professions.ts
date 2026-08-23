// Medicine, nursing and allied health. Library sweep 2026-08-23. "nclex", "usmle" and "mcat" are
// deliberately NOT aliases — each spans several of these courses, and resolving the exam's name to
// one of them would hand a learner a fraction wearing the whole exam's name. The subject courses
// are here; whole-exam preparation is the deep-research builder's job. Structures are authored
// from the fields themselves; licensure outlines are alignment targets only, never ingested.

import { course, t } from "./authoring";

const MED = "medicine";
const NURS = "nursing";
const PH = "public-health";
const NUTR = "nutrition";

export const HEALTH_PROFESSION_COURSES = [
  course(MED, "Medical Terminology", ["med term", "medical vocabulary"], [
    t("How medical words are built", { aliases: ["roots", "prefixes", "suffixes"], outcome: "decode a term you have never seen" }),
    t("The body's directional language", { outcome: "describe location and position precisely" }),
    t("Terms by body system", { outcome: "read charting for each organ system" }),
    t("Diagnostic and procedural terms", { outcome: "tell the test from the treatment in a note" }),
    t("Pharmacology terms", { outcome: "read drug names, routes and schedules" }),
    t("Abbreviations and charting", { outcome: "expand the standard abbreviations, and know the dangerous ones" }),
  ]),

  course(MED, "Pharmacology", ["intro pharmacology", "pharm"], [
    t("Pharmacokinetics", { aliases: ["adme"], outcome: "trace a dose through absorption to elimination" }),
    t("Pharmacodynamics", { aliases: ["receptors", "dose-response"], outcome: "read a dose–response curve and receptor logic" }),
    t("The autonomic drugs", { aliases: ["adrenergic", "cholinergic"], outcome: "predict an autonomic drug's effects from its target" }),
    t("Cardiovascular drugs", { aliases: ["antihypertensives"], outcome: "match heart and pressure drugs to mechanisms" }),
    t("Antimicrobials", { aliases: ["antibiotics"], outcome: "pair antibiotic classes with targets and resistance" }),
    t("Central nervous system drugs", { aliases: ["analgesics", "antidepressants"], outcome: "explain what the major CNS classes do" }),
    t("Endocrine drugs", { aliases: ["insulin"], outcome: "manage the hormone-replacing and hormone-blocking classes" }),
    t("Toxicity and interactions", { aliases: ["adverse effects"], outcome: "anticipate the classic interactions and antidotes" }),
  ]),

  course(MED, "Pathophysiology", ["patho", "intro pathophysiology", "disease mechanisms"], [
    t("Cell injury and adaptation", { outcome: "explain how cells cope, adapt and die" }),
    t("Inflammation and repair", { outcome: "trace inflammation from insult to healing or scarring" }),
    t("Immunopathology", { aliases: ["hypersensitivity"], outcome: "explain disease from immunity gone wrong" }),
    t("Neoplasia", { aliases: ["cancer biology"], outcome: "describe how a tumour starts, grows and spreads" }),
    t("Hemodynamic disorders", { aliases: ["thrombosis", "shock"], outcome: "connect clots, bleeding and shock states" }),
    t("Cardiovascular pathophysiology", { aliases: ["heart failure", "atherosclerosis"], outcome: "explain the major heart diseases mechanistically" }),
    t("Pulmonary pathophysiology", { aliases: ["copd", "asthma"], outcome: "contrast obstructive and restrictive disease" }),
    t("Renal and fluid disorders", { aliases: ["electrolytes"], outcome: "reason through fluid and electrolyte derangements" }),
    t("Endocrine pathophysiology", { aliases: ["diabetes"], outcome: "explain diabetes and thyroid disease from mechanism" }),
    t("Neurologic pathophysiology", { aliases: ["stroke"], outcome: "connect lesions to their deficits" }),
  ]),

  course(NUTR, "Nutrition", ["intro nutrition", "human nutrition"], [
    t("Energy and the macronutrients", { aliases: ["carbohydrates", "protein", "fats"], outcome: "say what each macronutrient does and how much is enough" }),
    t("Micronutrients", { aliases: ["vitamins", "minerals"], outcome: "match key vitamins and minerals to deficiency stories" }),
    t("Digestion and absorption", { outcome: "follow a meal into the blood" }),
    t("Energy balance and weight", { aliases: ["metabolism"], outcome: "reason about weight without myths" }),
    t("Nutrition through life", { aliases: ["pregnancy nutrition"], outcome: "adjust needs across ages and stages" }),
    t("Diet and chronic disease", { outcome: "connect eating patterns to heart disease and diabetes evidence" }),
    t("Food safety and quality", { outcome: "handle food so it stays food" }),
    t("Reading nutrition claims", { aliases: ["food labels"], outcome: "read a label and a headline sceptically" }),
  ]),

  course(PH, "Public Health", ["intro public health", "community health"], [
    t("What public health is", { outcome: "contrast treating patients with protecting populations" }),
    t("The history of public health", { aliases: ["john snow"], outcome: "tell the stories that built the field's methods" }),
    t("Determinants of health", { aliases: ["social determinants"], outcome: "explain why zip code rivals genetic code" }),
    t("Infectious disease control", { aliases: ["outbreaks"], outcome: "outline surveillance, containment and vaccination" }),
    t("Chronic disease prevention", { outcome: "design prevention across the three levels" }),
    t("Environmental health", { outcome: "trace exposures from source to body" }),
    t("Health policy and systems", { outcome: "map who pays for and delivers care" }),
    t("Global health", { outcome: "compare burdens and interventions across borders" }),
  ]),

  course(PH, "Epidemiology", ["intro epidemiology", "epi"], [
    t("Measures of disease", { aliases: ["incidence", "prevalence"], outcome: "compute and interpret the basic measures" }),
    t("Measures of association", { aliases: ["relative risk", "odds ratio"], outcome: "compute risk ratios and read them honestly" }),
    t("Study designs", { aliases: ["cohort studies", "case-control"], outcome: "match a question to the design that answers it" }),
    t("Bias and confounding", { outcome: "name what could fake this association" }),
    t("Causal inference", { outcome: "argue causation beyond correlation, carefully" }),
    t("Screening", { aliases: ["sensitivity and specificity"], outcome: "evaluate a screening test's real-world worth" }),
    t("Outbreak investigation", { outcome: "run the outbreak steps on a case study" }),
    t("Reading the literature", { outcome: "dissect a published study's claims" }),
  ]),

  course(NURS, "Fundamentals of Nursing", ["nursing fundamentals", "nursing 101", "intro nursing"], [
    t("The nursing process", { aliases: ["adpie"], outcome: "assess, diagnose, plan, implement and evaluate on a case" }),
    t("Vital signs and assessment", { outcome: "take and interpret a full set of vitals" }),
    t("Infection prevention", { aliases: ["hand hygiene", "ppe"], outcome: "break the chain of infection at every link" }),
    t("Safety and mobility", { aliases: ["fall prevention"], outcome: "keep a patient safe, moving and skin-intact" }),
    t("Hygiene and comfort", { outcome: "provide fundamental care with dignity" }),
    t("Medication administration", { aliases: ["rights of medication"], outcome: "give medications by the rights, every time" }),
    t("Documentation and communication", { aliases: ["sbar"], outcome: "chart and hand off so nothing is lost" }),
    t("Fluids, nutrition and elimination", { outcome: "manage intake, output and what they signal" }),
    t("Legal and ethical foundations", { outcome: "practise inside scope, consent and confidentiality" }),
  ]),

  course(NURS, "Medical-Surgical Nursing", ["med surg", "med-surg", "adult health nursing"], [
    t("Perioperative care", { outcome: "carry a patient safely through before, during and after surgery" }),
    t("Oxygenation problems", { aliases: ["respiratory nursing"], outcome: "prioritise and act on impaired gas exchange" }),
    t("Cardiac and vascular problems", { outcome: "manage chest pain, failure and perfusion threats" }),
    t("Fluid, electrolyte and renal problems", { outcome: "correct imbalances before they become emergencies" }),
    t("Endocrine problems", { aliases: ["diabetes management"], outcome: "manage glucose and hormone crises" }),
    t("Gastrointestinal problems", { outcome: "nurse the surgical abdomen and its complications" }),
    t("Musculoskeletal and mobility problems", { outcome: "care for fractures, replacements and immobility's risks" }),
    t("Neurologic problems", { aliases: ["stroke care"], outcome: "recognise deterioration and protect the brain" }),
    t("Oncology and hematology nursing", { outcome: "support patients through cancer treatment safely" }),
    t("Prioritization and delegation", { outcome: "decide who is seen first and what may be delegated" }),
  ]),

  course(NURS, "Maternal-Newborn Nursing", ["ob nursing", "obstetric nursing", "maternity nursing"], [
    t("Pregnancy and prenatal care", { outcome: "track a healthy pregnancy and flag the red flags" }),
    t("Labour and birth", { outcome: "support the stages of labour and read the monitor" }),
    t("Complications of pregnancy and birth", { aliases: ["preeclampsia"], outcome: "recognise and respond to obstetric emergencies" }),
    t("Postpartum care", { outcome: "assess recovery and catch haemorrhage early" }),
    t("Newborn assessment and care", { aliases: ["apgar"], outcome: "assess a newborn and support the first days" }),
    t("Feeding the newborn", { aliases: ["breastfeeding"], outcome: "support feeding choices with evidence" }),
    t("Family adaptation", { outcome: "care for the family the baby arrived into" }),
  ]),

  course(NURS, "Pediatric Nursing", ["peds nursing", "child health nursing"], [
    t("Growth and development", { outcome: "assess a child against milestones, not adult norms" }),
    t("Family-centred care", { outcome: "nurse the child through the family" }),
    t("Assessment of the child", { outcome: "adapt assessment to age and cooperation" }),
    t("Common childhood illnesses", { outcome: "manage the frequent flyers of paediatrics" }),
    t("Medication safety in children", { aliases: ["weight-based dosing"], outcome: "dose by weight and double-check everything" }),
    t("The hospitalized child", { outcome: "reduce the harm hospitals do to childhood" }),
    t("Pediatric emergencies", { outcome: "recognise the deteriorating child early" }),
    t("Chronic conditions of childhood", { outcome: "support long conditions across growing up" }),
  ]),

  course(NURS, "Mental Health Nursing", ["psychiatric nursing", "psych nursing", "behavioral health nursing"], [
    t("Therapeutic communication", { outcome: "hold conversations that are themselves treatment" }),
    t("The nurse–patient relationship", { outcome: "build and bound a therapeutic alliance" }),
    t("Mood disorders", { aliases: ["depression", "bipolar"], outcome: "nurse depression and mania safely" }),
    t("Anxiety and trauma disorders", { aliases: ["ptsd"], outcome: "de-escalate anxiety and respect trauma" }),
    t("Psychotic disorders", { aliases: ["schizophrenia"], outcome: "care through psychosis without confrontation" }),
    t("Substance use disorders", { outcome: "manage withdrawal and meet use without judgment" }),
    t("Crisis and suicide prevention", { aliases: ["suicide risk"], outcome: "assess risk directly and act on it" }),
    t("Psychiatric medications", { outcome: "monitor the major classes and their serious effects" }),
    t("Legal and ethical psychiatric care", { aliases: ["involuntary commitment"], outcome: "respect rights inside involuntary care" }),
  ]),

  course(MED, "Emergency Medical Care", ["emt", "emt basic", "emergency medical technician"], [
    t("EMS systems and safety", { outcome: "operate inside the system and stay safe doing it" }),
    t("Patient assessment", { aliases: ["primary survey"], outcome: "run the primary and secondary survey fast and in order" }),
    t("Airway management", { outcome: "open, clear and support an airway" }),
    t("Breathing and ventilation", { aliases: ["oxygen therapy"], outcome: "support breathing with the right adjunct" }),
    t("Circulation and shock", { aliases: ["bleeding control"], outcome: "stop bleeding and treat for shock" }),
    t("Cardiac emergencies", { aliases: ["cpr", "aed"], outcome: "run high-quality CPR with an AED" }),
    t("Medical emergencies", { aliases: ["stroke", "diabetic emergencies"], outcome: "recognise and manage the common medical calls" }),
    t("Trauma emergencies", { outcome: "manage trauma by mechanism and priority" }),
    t("Special populations", { outcome: "adapt care for children, elders and childbirth" }),
    t("Lifting, moving and transport", { outcome: "move patients without harming anyone" }),
  ]),
] as const;
