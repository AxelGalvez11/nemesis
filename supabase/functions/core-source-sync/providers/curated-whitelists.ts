/**
 * Phase 7: curated URL whitelists for guideline-publishing bodies that
 * don't expose structured APIs.
 *
 * Edit these lists to expand coverage per provider. Each entry surfaces
 * as one core_sources row after fetch + chunk + embed.
 *
 * Posture: every URL must point to a public-domain or commercial-friendly
 * licensed source. License gate at ingest is the second line of defense
 * (assertCommercialFriendly).
 */

export interface PageRef {
  readonly url: string;
  readonly title: string;
  readonly topic?: string;
}

// =============================================================================
// AHRQ Effective Health Care Program — comparative effectiveness reviews
// =============================================================================
export const AHRQ_PAGES: PageRef[] = [
  {
    url: "https://effectivehealthcare.ahrq.gov/products/hypertension-treatments/research",
    title: "AHRQ: Hypertension treatment comparative effectiveness",
    topic: "cardiology",
  },
  {
    url: "https://effectivehealthcare.ahrq.gov/products/anticoagulants-stroke-afib/research",
    title:
      "AHRQ: Oral anticoagulants for stroke prevention in atrial fibrillation",
    topic: "anticoagulation",
  },
  {
    url: "https://effectivehealthcare.ahrq.gov/products/diabetes-second-line/research",
    title: "AHRQ: Second-line therapy for type 2 diabetes",
    topic: "diabetes",
  },
  {
    url: "https://effectivehealthcare.ahrq.gov/products/community-acquired-pneumonia/research",
    title: "AHRQ: Community-acquired pneumonia diagnosis and treatment",
    topic: "infectious-disease",
  },
  {
    url: "https://effectivehealthcare.ahrq.gov/products/copd-pharmacologic/research",
    title: "AHRQ: Pharmacologic management of COPD",
    topic: "asthma-copd",
  },
  // Phase A whitelist expansion (2026-05-13)
  {
    url: "https://effectivehealthcare.ahrq.gov/products/antidepressants/research",
    title:
      "AHRQ: Comparative effectiveness of second-generation antidepressants",
    topic: "psych-neuro",
  },
  {
    url: "https://effectivehealthcare.ahrq.gov/products/antipsychotics-adults/research",
    title: "AHRQ: Antipsychotics in adults — off-label use",
    topic: "psych-neuro",
  },
  {
    url: "https://effectivehealthcare.ahrq.gov/products/opioids-chronic-pain/research",
    title: "AHRQ: Opioid treatments for chronic pain",
    topic: "psych-neuro",
  },
  {
    url: "https://effectivehealthcare.ahrq.gov/products/migraine-prevention/research",
    title: "AHRQ: Migraine prevention pharmacotherapy",
    topic: "psych-neuro",
  },
  {
    url: "https://effectivehealthcare.ahrq.gov/products/bph-treatments/research",
    title: "AHRQ: Benign prostatic hyperplasia treatments",
    topic: "renal-uro",
  },
  {
    url: "https://effectivehealthcare.ahrq.gov/products/hepatitis-c-treatment/research",
    title: "AHRQ: Hepatitis C antiviral treatments",
    topic: "infectious-disease",
  },
  {
    url: "https://effectivehealthcare.ahrq.gov/products/asthma-controllers/research",
    title: "AHRQ: Asthma controller medication comparative effectiveness",
    topic: "asthma-copd",
  },
  {
    url: "https://effectivehealthcare.ahrq.gov/products/sepsis-management/research",
    title: "AHRQ: Sepsis identification and management",
    topic: "infectious-disease",
  },
  {
    url: "https://effectivehealthcare.ahrq.gov/products/glaucoma/research",
    title: "AHRQ: Glaucoma treatment effectiveness",
    topic: "ophthalmology",
  },
  {
    url: "https://effectivehealthcare.ahrq.gov/products/insomnia-pharmacologic/research",
    title: "AHRQ: Pharmacologic management of insomnia",
    topic: "psych-neuro",
  },
];

// =============================================================================
// USPSTF — preventive services recommendations
// =============================================================================
export const USPSTF_PAGES: PageRef[] = [
  {
    url: "https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/aspirin-to-prevent-cardiovascular-disease-preventive-medication",
    title: "USPSTF: Aspirin for primary CVD prevention",
    topic: "cardiology",
  },
  {
    url: "https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/statin-use-in-adults-preventive-medication",
    title: "USPSTF: Statins for primary CVD prevention",
    topic: "dyslipidemia",
  },
  {
    url: "https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/screening-for-prediabetes-and-type-2-diabetes",
    title: "USPSTF: Screening for prediabetes and type 2 diabetes",
    topic: "diabetes",
  },
  {
    url: "https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/hypertension-in-adults-screening",
    title: "USPSTF: Screening for hypertension in adults",
    topic: "cardiology",
  },
  // Phase A whitelist expansion (2026-05-13)
  {
    url: "https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/tobacco-use-in-adults-and-pregnant-women-counseling-and-interventions",
    title: "USPSTF: Tobacco cessation interventions (incl. pharmacotherapy)",
    topic: "psych-neuro",
  },
  {
    url: "https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/folic-acid-for-the-prevention-of-neural-tube-defects-preventive-medication",
    title: "USPSTF: Folic acid supplementation in pregnancy",
    topic: "obgyn",
  },
  {
    url: "https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/vitamin-d-calcium-or-combined-supplementation-for-the-primary-prevention-of-fractures-in-adults-preventive-medication",
    title: "USPSTF: Vitamin D / calcium for fracture prevention",
    topic: "endocrine",
  },
  {
    url: "https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/osteoporosis-screening",
    title: "USPSTF: Osteoporosis screening to prevent fractures",
    topic: "endocrine",
  },
  {
    url: "https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/breast-cancer-medication-use-to-reduce-risk",
    title: "USPSTF: Risk-reducing medications for breast cancer",
    topic: "oncology",
  },
  {
    url: "https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/depression-in-adults-screening",
    title: "USPSTF: Depression screening in adults",
    topic: "psych-neuro",
  },
  {
    url: "https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/colorectal-cancer-screening",
    title: "USPSTF: Colorectal cancer screening",
    topic: "oncology",
  },
  {
    url: "https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/lung-cancer-screening",
    title: "USPSTF: Lung cancer screening",
    topic: "oncology",
  },
  {
    url: "https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/unhealthy-alcohol-use-in-adolescents-and-adults-screening-and-behavioral-counseling-interventions",
    title: "USPSTF: Unhealthy alcohol use screening + counseling",
    topic: "psych-neuro",
  },
  {
    url: "https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/falls-prevention-in-community-dwelling-older-adults-interventions",
    title: "USPSTF: Falls prevention in older adults",
    topic: "geriatrics",
  },
  {
    url: "https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/hepatitis-b-virus-infection-screening",
    title: "USPSTF: Hepatitis B screening in nonpregnant adults",
    topic: "infectious-disease",
  },
  {
    url: "https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/hepatitis-c-screening",
    title: "USPSTF: Hepatitis C screening in adults",
    topic: "infectious-disease",
  },
  {
    url: "https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/human-immunodeficiency-virus-hiv-infection-screening",
    title: "USPSTF: HIV screening in adolescents and adults",
    topic: "infectious-disease",
  },
  {
    url: "https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/latent-tuberculosis-infection-screening",
    title: "USPSTF: Latent TB infection screening",
    topic: "infectious-disease",
  },
  {
    url: "https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/preeclampsia-screening",
    title: "USPSTF: Aspirin for preeclampsia prevention",
    topic: "obgyn",
  },
  {
    url: "https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/weight-loss-to-prevent-obesity-related-morbidity-and-mortality-adults-behavioral-interventions",
    title: "USPSTF: Behavioral weight-loss interventions in adults",
    topic: "endocrine",
  },
  {
    url: "https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/healthy-diet-and-physical-activity-for-cardiovascular-disease-prevention-in-adults-with-cardiovascular-risk-factors-behavioral-counseling",
    title: "USPSTF: Healthy diet + activity counseling for CVD prevention",
    topic: "cardiology",
  },
  {
    url: "https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/anxiety-screening-adults",
    title: "USPSTF: Anxiety disorder screening in adults",
    topic: "psych-neuro",
  },
  {
    url: "https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/atrial-fibrillation-screening-with-electrocardiography",
    title: "USPSTF: Atrial fibrillation screening with ECG",
    topic: "arrhythmia",
  },
  {
    url: "https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/skin-cancer-counseling",
    title: "USPSTF: Skin cancer prevention behavioral counseling",
    topic: "oncology",
  },
];

// =============================================================================
// NIH NHLBI — heart, lung, blood disorder guidelines
// =============================================================================
export const NHLBI_PAGES: PageRef[] = [
  {
    url: "https://www.nhlbi.nih.gov/health-topics/asthma",
    title: "NHLBI: Asthma overview",
    topic: "asthma-copd",
  },
  {
    url: "https://www.nhlbi.nih.gov/health/heart-failure",
    title: "NHLBI: Heart failure",
    topic: "heart-failure",
  },
  {
    url: "https://www.nhlbi.nih.gov/health/blood-cholesterol",
    title: "NHLBI: Blood cholesterol",
    topic: "dyslipidemia",
  },
  {
    url: "https://www.nhlbi.nih.gov/health/atrial-fibrillation",
    title: "NHLBI: Atrial fibrillation",
    topic: "arrhythmia",
  },
  // Phase A whitelist expansion (2026-05-13)
  {
    url: "https://www.nhlbi.nih.gov/health/coronary-heart-disease",
    title: "NHLBI: Coronary heart disease",
    topic: "cardiology",
  },
  {
    url: "https://www.nhlbi.nih.gov/health/high-blood-pressure",
    title: "NHLBI: High blood pressure",
    topic: "cardiology",
  },
  {
    url: "https://www.nhlbi.nih.gov/health/copd",
    title: "NHLBI: COPD",
    topic: "asthma-copd",
  },
  {
    url: "https://www.nhlbi.nih.gov/health/venous-thromboembolism",
    title: "NHLBI: Venous thromboembolism (DVT/PE)",
    topic: "anticoagulation",
  },
  {
    url: "https://www.nhlbi.nih.gov/health/sleep-apnea",
    title: "NHLBI: Sleep apnea",
    topic: "asthma-copd",
  },
  {
    url: "https://www.nhlbi.nih.gov/health/sickle-cell-disease",
    title: "NHLBI: Sickle cell disease",
    topic: "hematology",
  },
  {
    url: "https://www.nhlbi.nih.gov/health/anemia",
    title: "NHLBI: Anemia overview",
    topic: "hematology",
  },
  {
    url: "https://www.nhlbi.nih.gov/health/heart-attack",
    title: "NHLBI: Heart attack (acute MI)",
    topic: "cardiology",
  },
];

// =============================================================================
// VA/DoD Clinical Practice Guidelines
// =============================================================================
export const VA_DOD_PAGES: PageRef[] = [
  {
    url: "https://www.healthquality.va.gov/guidelines/Pain/cot/",
    title: "VA/DoD: Chronic opioid therapy for chronic pain",
    topic: "psych-neuro",
  },
  {
    url: "https://www.healthquality.va.gov/guidelines/MH/sud/",
    title: "VA/DoD: Substance use disorders",
    topic: "psych-neuro",
  },
  {
    url: "https://www.healthquality.va.gov/guidelines/MH/mdd/",
    title: "VA/DoD: Major depressive disorder",
    topic: "psych-neuro",
  },
  {
    url: "https://www.healthquality.va.gov/guidelines/CD/diabetes/",
    title: "VA/DoD: Type 2 diabetes management",
    topic: "diabetes",
  },
  // Phase A whitelist expansion (2026-05-13)
  {
    url: "https://www.healthquality.va.gov/guidelines/CD/htn/",
    title: "VA/DoD: Hypertension management",
    topic: "cardiology",
  },
  {
    url: "https://www.healthquality.va.gov/guidelines/CD/lipids/",
    title: "VA/DoD: Lipid management for CVD risk reduction",
    topic: "dyslipidemia",
  },
  {
    url: "https://www.healthquality.va.gov/guidelines/CD/hf/",
    title: "VA/DoD: Heart failure",
    topic: "heart-failure",
  },
  {
    url: "https://www.healthquality.va.gov/guidelines/CD/stroke/",
    title: "VA/DoD: Stroke management and rehabilitation",
    topic: "psych-neuro",
  },
  {
    url: "https://www.healthquality.va.gov/guidelines/CD/copd/",
    title: "VA/DoD: COPD management",
    topic: "asthma-copd",
  },
  {
    url: "https://www.healthquality.va.gov/guidelines/CD/asthma/",
    title: "VA/DoD: Asthma management",
    topic: "asthma-copd",
  },
  {
    url: "https://www.healthquality.va.gov/guidelines/CD/ckd/",
    title: "VA/DoD: Chronic kidney disease",
    topic: "renal-uro",
  },
  {
    url: "https://www.healthquality.va.gov/guidelines/MH/ptsd/",
    title: "VA/DoD: Post-traumatic stress disorder",
    topic: "psych-neuro",
  },
  {
    url: "https://www.healthquality.va.gov/guidelines/MH/anx/",
    title: "VA/DoD: Anxiety disorders",
    topic: "psych-neuro",
  },
  {
    url: "https://www.healthquality.va.gov/guidelines/MH/bd/",
    title: "VA/DoD: Bipolar disorder",
    topic: "psych-neuro",
  },
  {
    url: "https://www.healthquality.va.gov/guidelines/MH/sz/",
    title: "VA/DoD: Schizophrenia",
    topic: "psych-neuro",
  },
  {
    url: "https://www.healthquality.va.gov/guidelines/CD/hiv/",
    title: "VA/DoD: HIV management",
    topic: "infectious-disease",
  },
  {
    url: "https://www.healthquality.va.gov/guidelines/Pain/lbp/",
    title: "VA/DoD: Low back pain management",
    topic: "psych-neuro",
  },
  {
    url: "https://www.healthquality.va.gov/guidelines/Pain/headache/",
    title: "VA/DoD: Headache management",
    topic: "psych-neuro",
  },
  {
    url: "https://www.healthquality.va.gov/guidelines/CD/obesity/",
    title: "VA/DoD: Obesity management in adults",
    topic: "endocrine",
  },
  {
    url: "https://www.healthquality.va.gov/guidelines/cd/hep/",
    title: "VA/DoD: Hepatitis C management",
    topic: "infectious-disease",
  },
];

// =============================================================================
// FDA Drug Safety Communications
// =============================================================================
export const FDA_SAFETY_PAGES: PageRef[] = [
  {
    url: "https://www.fda.gov/drugs/drug-safety-and-availability/drug-safety-communications",
    title: "FDA: Drug Safety Communications hub",
    topic: "all",
  },
  {
    url: "https://www.fda.gov/drugs/drug-safety-and-availability/medication-guides",
    title: "FDA: Medication Guides",
    topic: "all",
  },
];

// =============================================================================
// CDC MMWR — Morbidity and Mortality Weekly Report
// =============================================================================
export const CDC_MMWR_PAGES: PageRef[] = [
  {
    url: "https://www.cdc.gov/mmwr/volumes/72/rr/rr7202a1.htm",
    title: "CDC MMWR: Adult Immunization Schedule",
    topic: "immunization",
  },
  {
    url: "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr5912a1.htm",
    title: "CDC MMWR: Antimicrobial stewardship in healthcare facilities",
    topic: "infectious-disease",
  },
];

// =============================================================================
// FDA Orange Book — therapeutic equivalence (downloadable file separately)
// =============================================================================
export const FDA_ORANGE_PAGES: PageRef[] = [
  {
    url: "https://www.accessdata.fda.gov/scripts/cder/ob/index.cfm",
    title:
      "FDA Orange Book: Approved Drug Products with Therapeutic Equivalence",
    topic: "dispensing",
  },
];

// =============================================================================
// LiverTox — drug-induced hepatotoxicity (NCBI Bookshelf)
// =============================================================================
export const LIVERTOX_PAGES: ReadonlyArray<{
  drug_name: string;
  bookshelf_id: string;
  url: string;
}> = [
  {
    drug_name: "Statins",
    bookshelf_id: "NBK548614",
    url: "https://www.ncbi.nlm.nih.gov/books/NBK548614/",
  },
  {
    drug_name: "ACE Inhibitors",
    bookshelf_id: "NBK548577",
    url: "https://www.ncbi.nlm.nih.gov/books/NBK548577/",
  },
  {
    drug_name: "Acetaminophen",
    bookshelf_id: "NBK548162",
    url: "https://www.ncbi.nlm.nih.gov/books/NBK548162/",
  },
  {
    drug_name: "Amiodarone",
    bookshelf_id: "NBK548418",
    url: "https://www.ncbi.nlm.nih.gov/books/NBK548418/",
  },
  {
    drug_name: "Methotrexate",
    bookshelf_id: "NBK548219",
    url: "https://www.ncbi.nlm.nih.gov/books/NBK548219/",
  },
];

// =============================================================================
// LactMed — drugs in lactation (NCBI Bookshelf, public domain)
// =============================================================================
export const LACTMED_PAGES: PageRef[] = [
  {
    url: "https://www.ncbi.nlm.nih.gov/books/NBK501922/",
    title: "LactMed: Drugs and Lactation Database hub",
    topic: "lactation",
  },
];

// =============================================================================
// OpenStax — free CC BY 4.0 textbooks
// =============================================================================
export const OPENSTAX_PAGES: PageRef[] = [
  {
    url: "https://openstax.org/books/anatomy-and-physiology-2e/pages/19-1-heart-anatomy",
    title: "OpenStax: Heart anatomy",
    topic: "cardiology",
  },
  {
    url: "https://openstax.org/books/anatomy-and-physiology-2e/pages/26-1-body-fluids-and-fluid-compartments",
    title: "OpenStax: Body fluids and fluid compartments",
    topic: "renal",
  },
  {
    url: "https://openstax.org/books/microbiology/pages/14-introduction",
    title: "OpenStax Microbiology: Antimicrobial drugs intro",
    topic: "infectious-disease",
  },
];

// =============================================================================
// PharmGKB — pharmacogenomics (CC BY-SA, share-alike applies)
// =============================================================================
export const PHARMGKB_PAGES: PageRef[] = [
  {
    url: "https://www.pharmgkb.org/chemical/PA449087/guidelineAnnotation",
    title: "PharmGKB: Warfarin pharmacogenomics annotations",
    topic: "anticoagulation",
  },
  {
    url: "https://www.pharmgkb.org/chemical/PA449053/guidelineAnnotation",
    title: "PharmGKB: Clopidogrel pharmacogenomics annotations",
    topic: "cardiology",
  },
];

// =============================================================================
// NCBI Bookshelf public-access pharmacology subset (filter per book license)
// =============================================================================
export const NCBI_BOOKSHELF_PAGES: PageRef[] = [
  // Add per-book entries when verified to be public-access. Examples:
  // - Pharmacology: An Introduction (NCBI Bookshelf public-access subset)
  // - Drug development handbooks
  // Each must be license-verified before adding.
];

// =============================================================================
// Phase A (Cycle 1) expansion — DiPiro-equivalent coverage gap closers
// =============================================================================

// DHHS clinicalinfo.hiv.gov — living HIV/HCV/HBV guidelines (public domain).
// Substitutes for IDSA copyright-restricted ID guidelines on HIV/HCV/HBV.
export const DHHS_HIV_PAGES: PageRef[] = [
  {
    url: "https://clinicalinfo.hiv.gov/en/guidelines/adult-and-adolescent-arv",
    title: "DHHS: Adult and Adolescent Antiretroviral Guidelines",
    topic: "infectious-disease",
  },
  {
    url: "https://clinicalinfo.hiv.gov/en/guidelines/pediatric-arv",
    title: "DHHS: Pediatric Antiretroviral Guidelines",
    topic: "infectious-disease",
  },
  {
    url: "https://clinicalinfo.hiv.gov/en/guidelines/perinatal",
    title: "DHHS: Perinatal HIV Guidelines",
    topic: "infectious-disease",
  },
  {
    url: "https://clinicalinfo.hiv.gov/en/guidelines/adult-and-adolescent-opportunistic-infection",
    title: "DHHS: Adult/Adolescent Opportunistic Infection Guidelines",
    topic: "infectious-disease",
  },
  // Phase A whitelist expansion (2026-05-13)
  {
    url: "https://clinicalinfo.hiv.gov/en/guidelines/pediatric-opportunistic-infection",
    title: "DHHS: Pediatric Opportunistic Infection Guidelines",
    topic: "infectious-disease",
  },
  {
    url: "https://clinicalinfo.hiv.gov/en/guidelines/hiv-clinical-guidelines-adult-and-adolescent-arv/whats-new",
    title: "DHHS: Adult ARV — What's New (changes summary)",
    topic: "infectious-disease",
  },
  {
    url: "https://clinicalinfo.hiv.gov/en/guidelines/hiv-clinical-guidelines-adult-and-adolescent-arv/initiating-antiretroviral-therapy",
    title: "DHHS: Initiating antiretroviral therapy",
    topic: "infectious-disease",
  },
  {
    url: "https://clinicalinfo.hiv.gov/en/guidelines/hiv-clinical-guidelines-adult-and-adolescent-arv/what-start",
    title: "DHHS: What to start — initial ARV regimen selection",
    topic: "infectious-disease",
  },
  {
    url: "https://clinicalinfo.hiv.gov/en/guidelines/hiv-clinical-guidelines-adult-and-adolescent-arv/management-virologic-failure",
    title: "DHHS: Management of virologic failure",
    topic: "infectious-disease",
  },
  {
    url: "https://clinicalinfo.hiv.gov/en/guidelines/hiv-clinical-guidelines-adult-and-adolescent-arv/drug-drug-interactions",
    title: "DHHS: Drug-drug interactions with ARV",
    topic: "infectious-disease",
  },
];

// NCI PDQ — clinician-grade oncology pathophys + treatment (public domain,
// NIH/NCI). Substitutes for NCCN copyright-restricted oncology guidelines.
// Each URL is the Health Professional version (not the Patient version).
export const NCI_PDQ_PAGES: PageRef[] = [
  {
    url: "https://www.cancer.gov/types/breast/hp/breast-treatment-pdq",
    title: "NCI PDQ: Breast Cancer Treatment (Health Professional)",
    topic: "oncology",
  },
  {
    url: "https://www.cancer.gov/types/lung/hp/non-small-cell-lung-treatment-pdq",
    title: "NCI PDQ: Non-Small Cell Lung Cancer Treatment (HP)",
    topic: "oncology",
  },
  {
    url: "https://www.cancer.gov/types/colorectal/hp/colon-treatment-pdq",
    title: "NCI PDQ: Colon Cancer Treatment (HP)",
    topic: "oncology",
  },
  {
    url: "https://www.cancer.gov/types/prostate/hp/prostate-treatment-pdq",
    title: "NCI PDQ: Prostate Cancer Treatment (HP)",
    topic: "oncology",
  },
  {
    url: "https://www.cancer.gov/types/leukemia/hp/adult-aml-treatment-pdq",
    title: "NCI PDQ: Adult AML Treatment (HP)",
    topic: "oncology",
  },
  // Phase A whitelist expansion (2026-05-13)
  {
    url: "https://www.cancer.gov/types/bladder/hp/bladder-treatment-pdq",
    title: "NCI PDQ: Bladder Cancer Treatment (HP)",
    topic: "oncology",
  },
  {
    url: "https://www.cancer.gov/types/brain/hp/adult-brain-treatment-pdq",
    title: "NCI PDQ: Adult Central Nervous System Tumors Treatment (HP)",
    topic: "oncology",
  },
  {
    url: "https://www.cancer.gov/types/cervical/hp/cervical-treatment-pdq",
    title: "NCI PDQ: Cervical Cancer Treatment (HP)",
    topic: "oncology",
  },
  {
    url: "https://www.cancer.gov/types/uterine/hp/endometrial-treatment-pdq",
    title: "NCI PDQ: Endometrial Cancer Treatment (HP)",
    topic: "oncology",
  },
  {
    url: "https://www.cancer.gov/types/esophageal/hp/esophageal-treatment-pdq",
    title: "NCI PDQ: Esophageal Cancer Treatment (HP)",
    topic: "oncology",
  },
  {
    url: "https://www.cancer.gov/types/stomach/hp/stomach-treatment-pdq",
    title: "NCI PDQ: Gastric Cancer Treatment (HP)",
    topic: "oncology",
  },
  {
    url: "https://www.cancer.gov/types/head-and-neck/hp/adult/lip-mouth-treatment-pdq",
    title: "NCI PDQ: Lip and Oral Cavity Cancer Treatment (HP)",
    topic: "oncology",
  },
  {
    url: "https://www.cancer.gov/types/lymphoma/hp/adult-hodgkin-treatment-pdq",
    title: "NCI PDQ: Adult Hodgkin Lymphoma Treatment (HP)",
    topic: "oncology",
  },
  {
    url: "https://www.cancer.gov/types/lymphoma/hp/adult-nhl-treatment-pdq",
    title: "NCI PDQ: Adult Non-Hodgkin Lymphoma Treatment (HP)",
    topic: "oncology",
  },
  {
    url: "https://www.cancer.gov/types/skin/hp/melanoma-treatment-pdq",
    title: "NCI PDQ: Melanoma Treatment (HP)",
    topic: "oncology",
  },
  {
    url: "https://www.cancer.gov/types/myeloma/hp/myeloma-treatment-pdq",
    title:
      "NCI PDQ: Plasma Cell Neoplasms (incl. Multiple Myeloma) Treatment (HP)",
    topic: "oncology",
  },
  {
    url: "https://www.cancer.gov/types/ovarian/hp/ovarian-epithelial-treatment-pdq",
    title: "NCI PDQ: Ovarian Epithelial Cancer Treatment (HP)",
    topic: "oncology",
  },
  {
    url: "https://www.cancer.gov/types/pancreatic/hp/pancreatic-treatment-pdq",
    title: "NCI PDQ: Pancreatic Cancer Treatment (HP)",
    topic: "oncology",
  },
  {
    url: "https://www.cancer.gov/types/kidney/hp/kidney-treatment-pdq",
    title: "NCI PDQ: Renal Cell Cancer Treatment (HP)",
    topic: "oncology",
  },
  {
    url: "https://www.cancer.gov/types/testicular/hp/testicular-treatment-pdq",
    title: "NCI PDQ: Testicular Cancer Treatment (HP)",
    topic: "oncology",
  },
  {
    url: "https://www.cancer.gov/types/thyroid/hp/thyroid-treatment-pdq",
    title: "NCI PDQ: Thyroid Cancer Treatment (HP)",
    topic: "oncology",
  },
  {
    url: "https://www.cancer.gov/types/leukemia/hp/adult-cll-treatment-pdq",
    title: "NCI PDQ: Chronic Lymphocytic Leukemia Treatment (HP)",
    topic: "oncology",
  },
  {
    url: "https://www.cancer.gov/types/leukemia/hp/cml-treatment-pdq",
    title: "NCI PDQ: Chronic Myelogenous Leukemia Treatment (HP)",
    topic: "oncology",
  },
  {
    url: "https://www.cancer.gov/types/leukemia/hp/adult-all-treatment-pdq",
    title: "NCI PDQ: Adult ALL Treatment (HP)",
    topic: "oncology",
  },
  {
    url: "https://www.cancer.gov/types/lung/hp/small-cell-lung-treatment-pdq",
    title: "NCI PDQ: Small Cell Lung Cancer Treatment (HP)",
    topic: "oncology",
  },
];

// Orphanet — rare disease pathophys + treatment overview (CC BY 4.0).
// Phase-1 seed: 10 rare diseases with pharmacotherapy implications.
// Bulk via orphadata.com defer to follow-up.
export const ORPHANET_PAGES: PageRef[] = [
  {
    url: "https://www.orpha.net/en/disease/detail/586",
    title: "Orphanet: Cystic fibrosis",
    topic: "rare-disease",
  },
  {
    url: "https://www.orpha.net/en/disease/detail/177",
    title: "Orphanet: Duchenne muscular dystrophy",
    topic: "rare-disease",
  },
  {
    url: "https://www.orpha.net/en/disease/detail/848",
    title: "Orphanet: Beta-thalassemia",
    topic: "rare-disease",
  },
  {
    url: "https://www.orpha.net/en/disease/detail/466",
    title: "Orphanet: Hereditary angioedema",
    topic: "rare-disease",
  },
  {
    url: "https://www.orpha.net/en/disease/detail/79258",
    title: "Orphanet: Gaucher disease",
    topic: "rare-disease",
  },
  // Phase A whitelist expansion (2026-05-13)
  {
    url: "https://www.orpha.net/en/disease/detail/905",
    title: "Orphanet: Wilson disease",
    topic: "rare-disease",
  },
  {
    url: "https://www.orpha.net/en/disease/detail/448",
    title: "Orphanet: Hemophilia A",
    topic: "rare-disease",
  },
  {
    url: "https://www.orpha.net/en/disease/detail/98879",
    title: "Orphanet: Hemophilia B",
    topic: "rare-disease",
  },
  {
    url: "https://www.orpha.net/en/disease/detail/232",
    title: "Orphanet: Sickle cell disease",
    topic: "hematology",
  },
  {
    url: "https://www.orpha.net/en/disease/detail/365",
    title: "Orphanet: Pompe disease",
    topic: "rare-disease",
  },
  {
    url: "https://www.orpha.net/en/disease/detail/324",
    title: "Orphanet: Fabry disease",
    topic: "rare-disease",
  },
  {
    url: "https://www.orpha.net/en/disease/detail/716",
    title: "Orphanet: Phenylketonuria",
    topic: "rare-disease",
  },
  {
    url: "https://www.orpha.net/en/disease/detail/646",
    title: "Orphanet: Niemann-Pick disease",
    topic: "rare-disease",
  },
  {
    url: "https://www.orpha.net/en/disease/detail/845",
    title: "Orphanet: Tay-Sachs disease",
    topic: "rare-disease",
  },
  {
    url: "https://www.orpha.net/en/disease/detail/95",
    title: "Orphanet: Friedreich ataxia",
    topic: "rare-disease",
  },
  {
    url: "https://www.orpha.net/en/disease/detail/70",
    title: "Orphanet: Spinal muscular atrophy",
    topic: "rare-disease",
  },
  {
    url: "https://www.orpha.net/en/disease/detail/803",
    title: "Orphanet: Amyotrophic lateral sclerosis",
    topic: "psych-neuro",
  },
  {
    url: "https://www.orpha.net/en/disease/detail/411",
    title: "Orphanet: Huntington disease",
    topic: "psych-neuro",
  },
];

// Drugs@FDA approval packages — now handled by the dedicated PDF crawler
// in providers/drugs-fda.ts, which reads its manifest from drugs-fda.manifest.json
// and accepts pre-parsed batches from scripts/drugs-fda-ingest.mjs.
