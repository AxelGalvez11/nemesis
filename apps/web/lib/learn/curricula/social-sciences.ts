// The social sciences. Library sweep 2026-08-23. Bare "economics" is deliberately not an alias —
// micro vs macro is a real fork for the clarify question; the AP names are unambiguous and map.

import { course, t } from "./authoring";

const PSY = "psychology";
const SOC = "sociology";
const ECON = "economics";
const POLI = "political-science";
const GEO = "geography";
const ANTH = "anthropology";

export const SOCIAL_SCIENCE_COURSES = [
  course(PSY, "Psychology", ["intro psychology", "psych 101", "ap psychology", "general psychology"], [
    t("Psychology as a science", { aliases: ["research methods"], outcome: "tell a finding from an anecdote" }),
    t("The brain and behaviour", { aliases: ["biological psychology"], outcome: "connect major brain systems to what they do" }),
    t("Sensation and perception", { outcome: "explain how raw input becomes experience" }),
    t("Learning", { aliases: ["conditioning"], outcome: "tell classical from operant conditioning in the wild" }),
    t("Memory", { outcome: "explain why memory is reconstruction, not playback" }),
    t("Cognition and language", { aliases: ["thinking", "biases"], outcome: "name the classic biases and catch one in yourself" }),
    t("Development across the lifespan", { aliases: ["developmental psychology"], outcome: "match milestones and stages to ages, loosely and honestly" }),
    t("Personality", { outcome: "compare the big personality frameworks" }),
    t("Social psychology", { aliases: ["conformity", "attribution"], outcome: "explain how situations move behaviour more than traits do" }),
    t("Psychological disorders and treatment", { aliases: ["abnormal psychology"], outcome: "describe major disorders and what treatment evidence supports" }),
  ]),

  course(SOC, "Sociology", ["intro sociology", "soc 101"], [
    t("The sociological imagination", { outcome: "read a private trouble as a public issue" }),
    t("Research methods in sociology", { outcome: "judge what a survey or ethnography can claim" }),
    t("Culture", { aliases: ["norms", "values"], outcome: "explain how culture scripts the ordinary" }),
    t("Socialization", { outcome: "trace how a self gets built" }),
    t("Social structure and institutions", { outcome: "name the institutions and what each organises" }),
    t("Deviance and social control", { outcome: "explain deviance as a label as well as an act" }),
    t("Stratification and class", { aliases: ["inequality"], outcome: "read mobility data and what blocks it" }),
    t("Race and ethnicity", { outcome: "distinguish prejudice, discrimination and structural patterns" }),
    t("Gender and family", { outcome: "trace how gender is learned and enforced" }),
    t("Social change", { aliases: ["social movements"], outcome: "explain how movements start, grow and win or fail" }),
  ]),

  // "micro" deliberately absent — it collides with Microbiology; the clarify question owns it.
  course(ECON, "Microeconomics", ["intro microeconomics", "ap microeconomics", "econ 101"], [
    t("Scarcity and choice", { aliases: ["opportunity cost"], outcome: "state the real cost of a choice" }),
    t("Supply and demand", { outcome: "predict a price move from a shift, correctly" }),
    t("Elasticity", { outcome: "say who bears a price change and why" }),
    t("Consumer choice", { aliases: ["utility"], outcome: "explain a demand curve from preferences" }),
    t("Production and costs", { outcome: "read a firm's cost curves" }),
    t("Perfect competition", { outcome: "find a competitive firm's output and profit" }),
    t("Monopoly and market power", { outcome: "explain what power over price costs everyone else" }),
    t("Imperfect competition", { aliases: ["oligopoly", "game theory"], outcome: "reason through a simple strategic game" }),
    t("Market failures", { aliases: ["externalities", "public goods"], outcome: "name why markets underprice pollution and underfund lighthouses" }),
    t("Labour markets and inequality", { outcome: "explain what sets wages" }),
  ]),

  course(ECON, "Macroeconomics", ["macro", "intro macroeconomics", "ap macroeconomics"], [
    t("Measuring an economy", { aliases: ["gdp"], outcome: "read GDP for what it counts and misses" }),
    t("Unemployment and inflation", { outcome: "define both properly and read their reports" }),
    t("Economic growth", { outcome: "name what actually raises living standards over decades" }),
    t("Aggregate demand and supply", { outcome: "trace a shock through the AD–AS frame" }),
    t("The financial system", { aliases: ["banking"], outcome: "explain how banks create money" }),
    t("Monetary policy", { aliases: ["the federal reserve", "interest rates"], outcome: "trace a rate change to spending and prices" }),
    t("Fiscal policy", { aliases: ["government spending", "deficits"], outcome: "weigh stimulus against debt honestly" }),
    t("International trade and exchange rates", { outcome: "explain who gains from trade and what a strong currency costs" }),
    t("Business cycles and crises", { outcome: "narrate a recession's anatomy" }),
  ]),

  course(POLI, "American Government", ["us government", "ap us government", "ap gov", "american politics", "us gov"], [
    t("Constitutional foundations", { aliases: ["the constitution"], outcome: "explain the founding bargains and their logic" }),
    t("Federalism", { outcome: "sort a policy question into national, state or shared" }),
    t("Congress", { outcome: "follow a bill and name where it can die" }),
    t("The presidency", { outcome: "distinguish formal powers from practical ones" }),
    t("The courts", { aliases: ["judicial review"], outcome: "explain what judicial review is and where it came from" }),
    t("Civil liberties and civil rights", { outcome: "tell liberties from rights and cite the landmark moves" }),
    t("Political behaviour and opinion", { aliases: ["polling"], outcome: "read a poll without being fooled" }),
    t("Campaigns and elections", { outcome: "explain how electoral rules shape strategy" }),
    t("Parties, interest groups and media", { outcome: "trace how organised interests move policy" }),
  ]),

  course(POLI, "Comparative Politics", ["ap comparative government", "comparative government"], [
    t("Comparing political systems", { outcome: "use cases to test claims about institutions" }),
    t("States and regimes", { aliases: ["democracy", "authoritarianism"], outcome: "classify regimes by how power is won and held" }),
    t("Democratic institutions", { aliases: ["parliamentary systems"], outcome: "contrast presidential and parliamentary designs" }),
    t("Authoritarian politics", { outcome: "explain how non-democracies actually govern" }),
    t("Elections and party systems", { outcome: "connect electoral rules to party counts" }),
    t("Political economy", { outcome: "compare how states manage markets" }),
    t("Political change", { aliases: ["revolutions", "democratization"], outcome: "name what makes transitions succeed or collapse" }),
  ]),

  course(GEO, "Human Geography", ["ap human geography", "aphg", "intro human geography"], [
    t("Thinking geographically", { aliases: ["maps", "scale"], outcome: "read maps as arguments, not just pictures" }),
    t("Population and migration", { outcome: "read population pyramids and explain who moves and why" }),
    t("Culture and identity in space", { aliases: ["cultural landscapes"], outcome: "trace how culture spreads and marks the land" }),
    t("Language and religion", { outcome: "map the big families and their movement" }),
    t("Political geography", { aliases: ["borders"], outcome: "explain how lines on maps get drawn and contested" }),
    t("Agriculture and rural land use", { outcome: "connect farming systems to their landscapes" }),
    t("Cities and urban land use", { aliases: ["urbanization"], outcome: "read a city's structure with the classic models" }),
    t("Industry and development", { outcome: "compare development measures and what they hide" }),
    t("Globalization", { outcome: "trace one product's geography end to end" }),
  ]),

  course(ANTH, "Anthropology", ["intro anthropology", "cultural anthropology", "anth 101"], [
    t("The anthropological perspective", { aliases: ["ethnography"], outcome: "explain what fieldwork knows that surveys cannot" }),
    t("Human evolution", { aliases: ["paleoanthropology"], outcome: "sketch the hominin story and its evidence" }),
    t("Archaeology's methods", { outcome: "say how the ground preserves and dates the past" }),
    t("Language and culture", { aliases: ["linguistic anthropology"], outcome: "explain how language and worldview entangle" }),
    t("Kinship and social organization", { outcome: "read a kinship system on its own terms" }),
    t("Economic and political anthropology", { outcome: "compare how societies organise exchange and power" }),
    t("Religion and ritual", { outcome: "analyse a ritual's work in its community" }),
    t("Culture change and globalization", { outcome: "trace how communities absorb and resist change" }),
  ]),
] as const;
