// Physics and the earth and space sciences. Library sweep 2026-08-23. No bare "physics" alias —
// mechanics vs electromagnetism is a real fork the clarify question exists to ask.

import { course, t } from "./authoring";

const PHYS = "physics";
const EARTH = "earth-science";
const ASTRO = "astronomy";

export const PHYSICS_EARTH_SPACE_COURSES = [
  course(PHYS, "Physics I: Mechanics", ["physics 1", "physics 101", "mechanics", "ap physics 1", "classical mechanics", "intro mechanics"], [
    t("Units, vectors and measurement", { outcome: "resolve a vector and keep units honest" }),
    t("Kinematics", { aliases: ["motion in one and two dimensions"], outcome: "predict where a projectile lands" }),
    t("Newton's laws", { aliases: ["forces"], outcome: "draw a free-body diagram and solve it" }),
    t("Work and energy", { aliases: ["conservation of energy"], outcome: "solve a problem by tracking energy instead of forces" }),
    t("Momentum and collisions", { outcome: "use conservation of momentum on a collision" }),
    t("Rotation", { aliases: ["torque", "angular momentum"], outcome: "carry the linear ideas over to spinning things" }),
    t("Gravitation", { aliases: ["orbits"], outcome: "explain an orbit as perpetual falling" }),
    t("Oscillations", { aliases: ["simple harmonic motion"], outcome: "read amplitude, period and energy off a spring problem" }),
    t("Waves and sound", { outcome: "relate frequency, wavelength and speed" }),
    t("Fluids", { aliases: ["pressure", "buoyancy"], outcome: "explain floating with Archimedes, not intuition" }),
  ]),

  course(PHYS, "Physics II: Electricity and Magnetism", ["physics 2", "e&m", "electromagnetism", "ap physics 2", "electricity and magnetism"], [
    t("Electric charge and Coulomb's law", { outcome: "compute the force between charges" }),
    t("Electric fields", { outcome: "read and draw field diagrams" }),
    t("Electric potential", { aliases: ["voltage"], outcome: "tell field from potential and relate the two" }),
    t("Capacitance", { outcome: "explain what a capacitor stores and how" }),
    t("Current and resistance", { aliases: ["ohm's law"], outcome: "use Ohm's law where it applies, and say where it does not" }),
    t("Direct-current circuits", { aliases: ["circuits"], outcome: "solve a series–parallel network" }),
    t("Magnetic fields and forces", { outcome: "predict the force on a moving charge" }),
    t("Electromagnetic induction", { aliases: ["faraday's law"], outcome: "explain how a changing field makes a current" }),
    t("Alternating current and electromagnetic waves", { outcome: "connect oscillating circuits to light" }),
    t("Geometric and wave optics", { aliases: ["optics", "lenses"], outcome: "trace rays through a lens and explain interference" }),
  ]),

  course(PHYS, "Modern Physics", ["intro modern physics", "quantum and relativity"], [
    t("Special relativity", { aliases: ["time dilation"], outcome: "work a time-dilation problem and say what is actually relative" }),
    t("The quantum idea", { aliases: ["photoelectric effect"], outcome: "explain why light comes in lumps" }),
    t("Wave–particle duality", { aliases: ["de broglie"], outcome: "say what interferes in a double-slit experiment" }),
    t("The quantum atom", { aliases: ["atomic spectra"], outcome: "connect energy levels to spectral lines" }),
    t("Quantum mechanics essentials", { aliases: ["wavefunction", "uncertainty principle"], outcome: "read a probability density and state the uncertainty trade" }),
    t("Nuclear physics", { aliases: ["radioactivity", "half-life"], outcome: "work a half-life problem and name the decay types" }),
    t("Particles and forces", { aliases: ["standard model"], outcome: "name the families of the standard model" }),
    t("Applications of modern physics", { aliases: ["lasers", "semiconductors"], outcome: "connect a device to the quantum effect inside it" }),
  ]),

  course(PHYS, "Thermodynamics", ["thermal physics", "heat and thermodynamics"], [
    t("Temperature and heat", { outcome: "distinguish temperature, heat and internal energy" }),
    t("The ideal gas", { aliases: ["gas laws"], outcome: "use the ideal-gas law and know when it lies" }),
    t("The first law", { aliases: ["energy conservation"], outcome: "track heat and work through a process" }),
    t("Heat engines and the second law", { aliases: ["entropy"], outcome: "explain why no engine is perfect" }),
    t("Entropy in depth", { outcome: "read entropy as counting arrangements" }),
    t("Heat transfer", { aliases: ["conduction", "convection", "radiation"], outcome: "pick the dominant transfer mode in a situation" }),
    t("Phase transitions", { outcome: "read a phase diagram" }),
    t("Statistical view of thermodynamics", { outcome: "connect molecular motion to macroscopic laws" }),
  ]),

  course(EARTH, "Environmental Science", ["ap environmental science", "apes", "enviro sci", "environmental studies"], [
    t("Earth's systems", { aliases: ["spheres"], outcome: "name the spheres and how they exchange matter" }),
    t("Ecosystems and biodiversity", { outcome: "explain what biodiversity buys an ecosystem" }),
    t("Human populations", { outcome: "read a demographic transition diagram" }),
    t("Land and water use", { aliases: ["agriculture"], outcome: "weigh a land-use choice's trade-offs" }),
    t("Energy resources", { aliases: ["fossil fuels", "renewables"], outcome: "compare energy sources by cost, footprint and limits" }),
    t("Pollution", { aliases: ["air pollution", "water pollution"], outcome: "trace a pollutant from source to harm" }),
    t("Climate change", { aliases: ["global warming"], outcome: "explain the greenhouse mechanism and the human fingerprint" }),
    t("Sustainability and policy", { outcome: "evaluate an intervention beyond its intentions" }),
  ]),

  course(EARTH, "Geology", ["physical geology", "intro geology", "earth science"], [
    t("Minerals and rocks", { aliases: ["rock cycle"], outcome: "classify a rock and read its history" }),
    t("Plate tectonics", { outcome: "explain earthquakes, volcanoes and mountains with one theory" }),
    t("Earthquakes and Earth's interior", { aliases: ["seismology"], outcome: "read a seismogram's story about the deep Earth" }),
    t("Volcanism", { outcome: "connect a volcano's shape to its magma" }),
    t("Weathering, erosion and deposition", { outcome: "read a landscape as a work in progress" }),
    t("Rivers, groundwater and coasts", { aliases: ["hydrology"], outcome: "trace water's paths and what they carve" }),
    t("Geologic time", { aliases: ["stratigraphy", "dating"], outcome: "order events from strata and date them radiometrically" }),
    t("Earth resources and hazards", { outcome: "connect geology to what we mine and what we should not build on" }),
  ]),

  course(ASTRO, "Astronomy", ["intro astronomy", "astro 101"], [
    t("The sky and its motions", { aliases: ["celestial sphere"], outcome: "explain seasons and phases without a mnemonic" }),
    t("Light and telescopes", { aliases: ["spectra"], outcome: "say what a spectrum reveals about a star" }),
    t("The solar system", { aliases: ["planets"], outcome: "compare the planet families and why they differ" }),
    t("The Sun", { outcome: "explain what powers the Sun and what its weather does to us" }),
    t("Stars and their lives", { aliases: ["stellar evolution", "hr diagram"], outcome: "read an H–R diagram as a story of stellar lives" }),
    t("Stellar death", { aliases: ["supernovae", "black holes"], outcome: "match a star's mass to its ending" }),
    t("Galaxies", { aliases: ["milky way"], outcome: "place the Sun in the galaxy and the galaxy among others" }),
    t("Cosmology", { aliases: ["big bang"], outcome: "state the evidence that the universe had a beginning" }),
    t("Life in the universe", { aliases: ["exoplanets"], outcome: "explain how exoplanets are found and what makes one interesting" }),
  ]),

  course(EARTH, "Meteorology", ["weather and climate", "intro meteorology"], [
    t("The atmosphere", { outcome: "name the layers and what each does" }),
    t("Solar energy and temperature", { outcome: "explain why the equator is hot and deserts are dry" }),
    t("Moisture and clouds", { aliases: ["humidity"], outcome: "predict cloud formation from rising air" }),
    t("Precipitation", { outcome: "explain how drops grow big enough to fall" }),
    t("Pressure and wind", { outcome: "read a pressure map's winds" }),
    t("Air masses and fronts", { outcome: "forecast a front's weather sequence" }),
    t("Storms", { aliases: ["thunderstorms", "hurricanes", "tornadoes"], outcome: "explain what powers severe weather" }),
    t("Climate and climate change", { outcome: "tell weather from climate and read a climate record" }),
  ]),
] as const;
