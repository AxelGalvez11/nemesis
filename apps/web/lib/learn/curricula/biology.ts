// The life sciences. Library sweep 2026-08-23. No bare "biology" alias anywhere — that utterance
// is the turn contract's own clarify example (general vs cell vs human), and the aliases here are
// the answers a learner picks, not a bypass around the question.

import { course, t } from "./authoring";

const BIO = "biology";

export const BIOLOGY_COURSES = [
  course(BIO, "General Biology", ["general bio", "intro biology", "biology 101", "bio 101", "ap biology"], [
    t("The chemistry of life", { aliases: ["biomolecules"], outcome: "name the four macromolecule families and what each is for" }),
    t("Cell structure", { aliases: ["organelles"], outcome: "match organelles to their jobs, in plant and animal cells" }),
    t("Membranes and transport", { outcome: "predict which way water and solutes move, and why" }),
    t("Energy and metabolism", { children: [
      t("Cellular respiration", { outcome: "trace how a meal becomes ATP" }),
      t("Photosynthesis", { outcome: "say what the light reactions make and the Calvin cycle spends" }),
    ] }),
    t("The cell cycle and division", { aliases: ["mitosis", "meiosis"], outcome: "tell mitosis from meiosis and say what each is for" }),
    t("Mendelian genetics", { aliases: ["inheritance"], outcome: "predict offspring ratios from a cross" }),
    t("Molecular genetics", { aliases: ["dna to protein"], outcome: "follow a gene from DNA to protein" }),
    t("Evolution and natural selection", { outcome: "explain a trait's spread with selection, not intention" }),
    t("Ecology", { aliases: ["ecosystems"], outcome: "trace energy through a food web" }),
    t("Body systems overview", { aliases: ["organ systems"], outcome: "name the major organ systems and what each maintains" }),
  ]),

  course(BIO, "Cell and Molecular Biology", ["cell biology", "molecular biology", "cell bio", "molec bio"], [
    t("Cellular architecture", { outcome: "relate a cell's shape and parts to its job" }),
    t("Protein structure and trafficking", { outcome: "follow a protein from ribosome to its destination" }),
    t("DNA replication and repair", { outcome: "explain how copying stays near-perfect" }),
    t("Transcription and its control", { aliases: ["gene regulation"], outcome: "explain how the same genome makes different cells" }),
    t("Translation", { outcome: "read a codon table to predict a mutation's effect" }),
    t("Cell signalling", { aliases: ["signal transduction"], outcome: "trace a signal from receptor to response" }),
    t("The cytoskeleton and cell movement", { outcome: "name what gives a cell shape and motion" }),
    t("Cell cycle control and cancer", { outcome: "explain what a checkpoint failure has to do with cancer" }),
    t("Laboratory methods", { aliases: ["pcr", "gel electrophoresis"], outcome: "choose the right technique to answer a molecular question" }),
  ]),

  course(BIO, "Genetics", ["intro genetics", "genetics 101"], [
    t("Mendelian inheritance", { aliases: ["mendel's laws"], outcome: "work a mono- and dihybrid cross" }),
    t("Extensions to Mendel", { aliases: ["codominance", "epistasis"], outcome: "recognise when simple ratios will not appear" }),
    t("Chromosomes and linkage", { aliases: ["recombination"], outcome: "use recombination frequency to order genes" }),
    t("Pedigree analysis", { outcome: "read a family tree for a trait's inheritance pattern" }),
    t("Molecular basis of mutation", { outcome: "predict a mutation's effect from where it lands" }),
    t("Gene expression and regulation", { outcome: "explain how genotype becomes phenotype" }),
    t("Population genetics", { aliases: ["hardy-weinberg"], outcome: "use allele frequencies to test whether a population is evolving" }),
    t("Genomics and biotechnology", { aliases: ["crispr", "sequencing"], outcome: "say what modern editing and sequencing can and cannot do" }),
  ]),

  // "micro" is claimed by two majors (microbiology, microeconomics) — neither gets it; the
  // clarify question owns that ambiguity.
  course(BIO, "Microbiology", ["intro microbiology", "microbio"], [
    t("The microbial world", { outcome: "tell bacteria, archaea, viruses and fungi apart" }),
    t("Bacterial structure and growth", { outcome: "relate a bacterium's parts to how antibiotics attack them" }),
    t("Microbial metabolism", { outcome: "explain how microbes make a living without oxygen" }),
    t("Viruses", { aliases: ["virology"], outcome: "trace a viral life cycle and where drugs interrupt it" }),
    t("Microbial genetics", { aliases: ["horizontal gene transfer"], outcome: "explain how resistance spreads between species" }),
    t("Control of microorganisms", { aliases: ["sterilization", "antibiotics"], outcome: "match a control method to a setting" }),
    t("Host–microbe interactions", { aliases: ["pathogenesis"], outcome: "distinguish colonisation from infection from disease" }),
    t("Immunity against microbes", { outcome: "outline how the body clears an infection" }),
    t("Applied and environmental microbiology", { outcome: "name where microbes are put to work" }),
  ]),

  course(BIO, "Human Anatomy", ["anatomy", "gross anatomy", "human anatomy and physiology 1"], [
    t("Anatomical language and organisation", { aliases: ["body planes"], outcome: "describe a location the way clinicians do" }),
    t("The integumentary system", { aliases: ["skin"], outcome: "name the skin's layers and their jobs" }),
    t("The skeletal system", { aliases: ["bones"], outcome: "identify major bones and the joints between them" }),
    t("The muscular system", { aliases: ["muscles"], outcome: "name major muscles and the movements they produce" }),
    t("The nervous system", { children: [
      t("Central nervous system", { aliases: ["brain anatomy"], outcome: "locate the brain's lobes and what each handles" }),
      t("Peripheral nervous system", { outcome: "trace a spinal nerve from cord to target" }),
    ] }),
    t("The cardiovascular system", { aliases: ["heart anatomy"], outcome: "trace blood through the heart's chambers and vessels" }),
    t("The respiratory system", { outcome: "follow air from nose to alveolus" }),
    t("The digestive system", { outcome: "follow a meal through the tract and name what each organ adds" }),
    t("The urinary system", { outcome: "locate the kidney's working parts" }),
    t("The reproductive systems", { outcome: "name the organs of both systems and their roles" }),
  ]),

  course(BIO, "Human Physiology", ["physiology", "human anatomy and physiology 2"], [
    t("Homeostasis and feedback", { outcome: "explain a set point and what negative feedback does" }),
    t("Membrane potentials and excitable cells", { outcome: "explain how a neuron fires" }),
    t("Neurophysiology", { aliases: ["synapses"], outcome: "trace a reflex from stimulus to response" }),
    t("Muscle physiology", { aliases: ["muscle contraction"], outcome: "explain sliding filaments and what calcium starts" }),
    t("Cardiovascular physiology", { aliases: ["blood pressure"], outcome: "relate heart rate, stroke volume and pressure" }),
    t("Respiratory physiology", { aliases: ["gas exchange"], outcome: "explain how oxygen gets from air to tissue" }),
    t("Renal physiology", { aliases: ["kidney function"], outcome: "explain how the kidney decides what to keep" }),
    t("Digestive physiology", { outcome: "match nutrients to where and how they are absorbed" }),
    t("Endocrine physiology", { aliases: ["hormones"], outcome: "trace a hormone axis and its feedback" }),
    t("Integrated responses", { aliases: ["exercise physiology"], outcome: "predict what several systems do under exercise or stress" }),
  ]),

  course(BIO, "Neuroscience", ["intro neuroscience", "neurobiology", "neuro"], [
    t("Neurons and glia", { outcome: "name the cell types and what each contributes" }),
    t("Electrical signalling", { aliases: ["action potentials"], outcome: "explain the action potential step by step" }),
    t("Synaptic transmission", { aliases: ["neurotransmitters"], outcome: "trace a signal across a synapse and name what drugs change" }),
    t("Neuroanatomy", { outcome: "locate the major brain structures and their roles" }),
    t("Sensory systems", { aliases: ["vision", "hearing"], outcome: "follow a stimulus from receptor to cortex" }),
    t("Motor systems", { outcome: "outline how a movement is planned and executed" }),
    t("Learning and memory", { aliases: ["synaptic plasticity"], outcome: "explain what changes in a brain that has learned" }),
    t("Emotion and motivation", { aliases: ["reward system"], outcome: "name the circuits behind reward and fear" }),
    t("Disorders of the nervous system", { outcome: "connect a disorder to the circuit it breaks" }),
  ]),

  course(BIO, "Ecology", ["intro ecology", "ecology and evolution"], [
    t("Organisms and their environments", { aliases: ["niches"], outcome: "distinguish a habitat from a niche" }),
    t("Population ecology", { aliases: ["population growth"], outcome: "read a growth curve and name what limits it" }),
    t("Community interactions", { aliases: ["predation", "competition"], outcome: "predict what removing one species does to others" }),
    t("Energy flow and food webs", { outcome: "explain why food chains are short" }),
    t("Nutrient cycles", { aliases: ["carbon cycle", "nitrogen cycle"], outcome: "trace carbon or nitrogen through an ecosystem" }),
    t("Biomes and biodiversity", { outcome: "relate climate to the life it supports" }),
    t("Behavioural ecology", { outcome: "explain a behaviour in terms of costs and benefits" }),
    t("Conservation and global change", { outcome: "connect a human pressure to an ecological response" }),
  ]),

  course(BIO, "Immunology", ["intro immunology", "immuno"], [
    t("Innate immunity", { outcome: "name the first responders and what they recognise" }),
    t("Adaptive immunity", { outcome: "tell B-cell from T-cell responses" }),
    t("Antigen recognition", { aliases: ["antibodies", "mhc"], outcome: "explain how a receptor tells self from non-self" }),
    t("Lymphocyte development and tolerance", { outcome: "explain how self-reactive cells are removed" }),
    t("The immune response over time", { aliases: ["immunological memory"], outcome: "explain why the second exposure is milder" }),
    t("Vaccines", { outcome: "say what a vaccine teaches the immune system" }),
    t("Hypersensitivity and allergy", { outcome: "classify an allergic reaction and its mechanism" }),
    t("Autoimmunity and immunodeficiency", { outcome: "contrast an overactive and an absent response" }),
  ]),
] as const;
