// The engineering core. Library sweep 2026-08-23. "fe exam" is deliberately not an alias — it
// spans this whole list plus mathematics; the deep-research builder handles whole-exam prep.

import { course, t } from "./authoring";

const ENG = "engineering";

export const ENGINEERING_COURSES = [
  course(ENG, "Statics", ["engineering statics", "engineering mechanics 1"], [
    t("Forces and vectors in equilibrium", { outcome: "resolve forces and state equilibrium" }),
    t("Moments and couples", { aliases: ["torque"], outcome: "compute a moment about any point or axis" }),
    t("Free-body diagrams", { outcome: "isolate a body and draw everything acting on it" }),
    t("Rigid-body equilibrium", { outcome: "solve reactions for beams and frames" }),
    t("Trusses", { aliases: ["method of joints", "method of sections"], outcome: "find member forces both ways" }),
    t("Frames and machines", { outcome: "solve multi-member structures with internal forces" }),
    t("Centroids and centres of gravity", { outcome: "locate centroids of composite shapes" }),
    t("Moments of inertia", { outcome: "compute second moments for bending to come" }),
    t("Friction", { outcome: "decide whether it slips or holds" }),
    t("Internal forces", { aliases: ["shear and moment diagrams"], outcome: "draw shear and moment diagrams for beams" }),
  ]),

  course(ENG, "Dynamics", ["engineering dynamics", "engineering mechanics 2"], [
    t("Kinematics of particles", { outcome: "describe motion in the coordinates that fit it" }),
    t("Kinetics of particles", { aliases: ["newton's second law"], outcome: "relate forces to acceleration for particles" }),
    t("Work and energy methods", { outcome: "solve motion problems by energy accounting" }),
    t("Impulse and momentum", { aliases: ["impact"], outcome: "handle collisions and sudden loads" }),
    t("Kinematics of rigid bodies", { aliases: ["relative motion"], outcome: "relate points on a rotating body" }),
    t("Kinetics of rigid bodies", { outcome: "apply force and moment equations to rotation" }),
    t("Energy and momentum for rigid bodies", { outcome: "carry the energy methods into rotation" }),
    t("Vibrations", { outcome: "model a single-degree-of-freedom oscillator" }),
  ]),

  course(ENG, "Mechanics of Materials", ["strength of materials", "mechanics of solids"], [
    t("Stress and strain", { outcome: "compute normal and shear stress from loads" }),
    t("Material behaviour", { aliases: ["stress-strain curves"], outcome: "read a stress–strain curve for design numbers" }),
    t("Axial loading", { outcome: "size a member for load and stretch" }),
    t("Torsion", { outcome: "design shafts against twist and shear" }),
    t("Bending", { aliases: ["flexure formula"], outcome: "find bending stresses from the moment diagram" }),
    t("Transverse shear", { outcome: "compute shear flow in beams" }),
    t("Combined loadings", { outcome: "superpose stresses and find the worst point" }),
    t("Stress transformation", { aliases: ["mohr's circle"], outcome: "rotate stresses and find principal values" }),
    t("Beam deflection", { outcome: "compute deflections and stiffness" }),
    t("Columns and buckling", { outcome: "check a column against Euler buckling" }),
  ]),

  course(ENG, "Fluid Mechanics", ["fluids", "intro fluid mechanics"], [
    t("Fluid properties", { aliases: ["viscosity"], outcome: "use density, viscosity and pressure correctly" }),
    t("Fluid statics", { aliases: ["hydrostatic pressure"], outcome: "compute forces on submerged surfaces" }),
    t("The Bernoulli equation", { outcome: "trade pressure, speed and height along a streamline" }),
    t("Control-volume analysis", { aliases: ["conservation of mass"], outcome: "apply mass and momentum balances to devices" }),
    t("Dimensional analysis", { aliases: ["reynolds number"], outcome: "collapse a problem into its dimensionless groups" }),
    t("Internal flow", { aliases: ["pipe flow"], outcome: "size pipes with friction losses" }),
    t("External flow", { aliases: ["drag and lift"], outcome: "estimate drag and lift on bodies" }),
    t("Turbomachinery basics", { aliases: ["pumps"], outcome: "match a pump to a system curve" }),
  ]),

  course(ENG, "Engineering Thermodynamics", ["thermo for engineers", "applied thermodynamics"], [
    t("Systems, properties and states", { outcome: "fix a state from two properties" }),
    t("Work, heat and the first law", { outcome: "run an energy balance on closed and open systems" }),
    t("Properties of pure substances", { aliases: ["steam tables"], outcome: "read property tables including two-phase states" }),
    t("The second law and entropy", { outcome: "test a proposed device against the second law" }),
    t("Power cycles", { aliases: ["rankine cycle", "brayton cycle"], outcome: "analyse the cycles that make electricity and thrust" }),
    t("Refrigeration cycles", { aliases: ["heat pumps"], outcome: "analyse cooling and its coefficient of performance" }),
    t("Mixtures and psychrometrics", { aliases: ["humidity"], outcome: "condition air on the psychrometric chart" }),
    t("Combustion basics", { outcome: "balance a combustion reaction and its energy" }),
  ]),

  course(ENG, "Electric Circuits", ["circuits", "circuit analysis", "intro circuits"], [
    t("Charge, current, voltage and power", { outcome: "keep the sign conventions straight" }),
    t("Resistive circuits", { aliases: ["kirchhoff's laws"], outcome: "solve any resistive network systematically" }),
    t("Nodal and mesh analysis", { outcome: "choose and execute the systematic method" }),
    t("Circuit theorems", { aliases: ["thevenin", "superposition"], outcome: "simplify with Thevenin and superposition" }),
    t("Operational amplifiers", { aliases: ["op amps"], outcome: "analyse the standard op-amp blocks" }),
    t("Capacitors and inductors", { outcome: "handle elements that remember" }),
    t("First and second-order transients", { aliases: ["rc circuits"], outcome: "predict a circuit's response to a switch" }),
    t("Sinusoidal steady state", { aliases: ["phasors", "impedance"], outcome: "solve AC circuits with phasors" }),
    t("AC power", { outcome: "compute real, reactive and apparent power" }),
  ]),

  course(ENG, "Signals and Systems", ["signals", "linear systems"], [
    t("Signals and their operations", { outcome: "classify and transform signals in time" }),
    t("Linear time-invariant systems", { aliases: ["convolution"], outcome: "predict outputs by convolution" }),
    t("Fourier series", { outcome: "decompose periodic signals into tones" }),
    t("The Fourier transform", { aliases: ["frequency domain"], outcome: "move between time and frequency fluently" }),
    t("Filtering", { outcome: "read and design simple filters" }),
    t("Sampling", { aliases: ["nyquist"], outcome: "sample without aliasing and explain why" }),
    t("The Laplace transform", { outcome: "analyse systems with poles and zeros" }),
    t("Stability and feedback", { outcome: "judge stability from pole locations" }),
  ]),

  course(ENG, "Materials Science", ["intro materials", "materials engineering", "materials science and engineering"], [
    t("Atomic structure and bonding in materials", { outcome: "connect bonding to a material's personality" }),
    t("Crystal structures", { outcome: "describe how atoms pack and what that permits" }),
    t("Defects", { aliases: ["dislocations"], outcome: "explain why real materials are weaker and more useful than perfect ones" }),
    t("Diffusion", { outcome: "predict how atoms move through solids" }),
    t("Mechanical properties", { aliases: ["hardness", "toughness"], outcome: "measure and compare strength, ductility and toughness" }),
    t("Phase diagrams", { outcome: "read what phases exist at a composition and temperature" }),
    t("Heat treatment of metals", { aliases: ["steel"], outcome: "harden and soften steel on purpose" }),
    t("Polymers, ceramics and composites", { outcome: "choose a material family for a job" }),
    t("Failure", { aliases: ["fatigue", "fracture"], outcome: "explain why parts break at loads they once held" }),
  ]),
] as const;
