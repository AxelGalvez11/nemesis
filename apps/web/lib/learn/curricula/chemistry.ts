// Chemistry beyond the intro course. General Chemistry itself lives in curriculum-registry.ts,
// longhand, as the library's founding proof — these are its siblings. Library sweep 2026-08-23.

import { course, t } from "./authoring";

const CHEM = "chemistry";

export const CHEMISTRY_COURSES = [
  course(CHEM, "Organic Chemistry", ["orgo", "ochem", "organic chem", "organic chemistry 1"], [
    t("Structure and bonding in carbon compounds", { aliases: ["hybridization"], outcome: "explain a molecule's shape from its hybridisation" }),
    t("Functional groups", { outcome: "name the family a molecule belongs to from its structure" }),
    t("Stereochemistry", { aliases: ["chirality", "isomers"], outcome: "tell enantiomers from diastereomers and assign R/S" }),
    t("Acid–base behaviour of organic molecules", { outcome: "rank acidities from structure, and say why" }),
    t("Substitution reactions", { aliases: ["sn1", "sn2"], outcome: "predict whether a substrate goes SN1 or SN2" }),
    t("Elimination reactions", { aliases: ["e1", "e2"], outcome: "predict the major alkene from an elimination" }),
    t("Addition reactions of alkenes and alkynes", { outcome: "predict the product and its regiochemistry" }),
    t("Aromaticity and aromatic substitution", { aliases: ["benzene chemistry"], outcome: "decide whether a ring is aromatic and where a substituent directs" }),
    t("Carbonyl chemistry", { aliases: ["aldehydes and ketones"], outcome: "predict what a nucleophile does to a carbonyl" }),
    t("Reaction mechanisms and arrow pushing", { outcome: "draw a plausible mechanism with curved arrows" }),
    t("Spectroscopy for structure determination", { aliases: ["nmr", "ir spectroscopy"], outcome: "propose a structure from NMR and IR data" }),
  ]),

  course(CHEM, "Biochemistry", ["biochem", "intro biochemistry"], [
    t("Water, pH and buffers in living systems", { outcome: "explain why cells need buffered pH" }),
    t("Amino acids and protein structure", { outcome: "relate a protein's four structure levels to its function" }),
    t("Enzymes and catalysis", { aliases: ["enzyme kinetics"], outcome: "read a Michaelis–Menten curve and name what an inhibitor changes" }),
    t("Carbohydrates", { outcome: "tell storage from structural sugars" }),
    t("Lipids and membranes", { outcome: "explain how a bilayer forms and what crosses it" }),
    t("Glycolysis", { outcome: "trace glucose to pyruvate and count the ATP" }),
    t("The citric acid cycle", { aliases: ["krebs cycle", "tca cycle"], outcome: "say what the cycle harvests and hands to the chain" }),
    t("Oxidative phosphorylation", { aliases: ["electron transport chain"], outcome: "explain how a proton gradient becomes ATP" }),
    t("Metabolic regulation", { outcome: "predict how a cell shifts fuel use when energy is scarce" }),
    t("DNA, RNA and protein synthesis", { aliases: ["central dogma"], outcome: "follow a gene from sequence to working protein" }),
  ]),

  course(CHEM, "Analytical Chemistry", ["quantitative analysis", "analytical chem"], [
    t("Measurement, error and statistics", { outcome: "report a result with honest uncertainty" }),
    t("Calibration and standards", { outcome: "build and read a calibration curve" }),
    t("Gravimetric and volumetric analysis", { aliases: ["titrations"], outcome: "compute a concentration from a titration" }),
    t("Chemical equilibria in analysis", { outcome: "choose conditions that push an assay to completion" }),
    t("Electrochemical methods", { outcome: "explain what a pH electrode actually measures" }),
    t("Chromatography", { aliases: ["hplc", "gc"], outcome: "choose a separation method for a mixture" }),
    t("Mass spectrometry basics", { outcome: "read a simple mass spectrum" }),
    t("Ultraviolet–visible and atomic spectroscopy", { aliases: ["beer's law", "uv-vis"], outcome: "turn an absorbance into a concentration" }),
  ]),
] as const;
