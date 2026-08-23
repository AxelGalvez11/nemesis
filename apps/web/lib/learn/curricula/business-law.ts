// Business, accounting, finance and the first-year law curriculum. Library sweep 2026-08-23.
// The law courses are the classic 1L subjects — which is also most of what the bar tests, but the
// structures here are authored from the fields themselves, not from any bar outline. "cpa" and
// "bar exam" are deliberately NOT aliases: each spans several of these courses, and picking one
// silently would hand a learner a fraction wearing the whole exam's name. The deep-research
// builder is the honest answer for whole-exam prep.

import { course, t } from "./authoring";

const ACCT = "accounting";
const FIN = "finance";
const BUS = "business";
const LAW = "law";

export const BUSINESS_LAW_COURSES = [
  course(ACCT, "Financial Accounting", ["intro accounting", "accounting 101", "financial accounting 1"], [
    t("The accounting equation", { aliases: ["debits and credits"], outcome: "keep assets equal to claims, always" }),
    t("Recording transactions", { aliases: ["journal entries"], outcome: "journalise ordinary business events" }),
    t("Adjusting entries and the accounting cycle", { aliases: ["accruals"], outcome: "close a period correctly" }),
    t("The income statement", { outcome: "read what a period earned and how" }),
    t("The balance sheet", { outcome: "read what is owned, owed and left over" }),
    t("The statement of cash flows", { outcome: "explain why profit and cash disagree" }),
    t("Receivables and inventory", { aliases: ["fifo", "lifo"], outcome: "value inventory and doubtful debts defensibly" }),
    t("Long-lived assets and depreciation", { outcome: "depreciate and say what the number means" }),
    t("Liabilities and equity", { outcome: "distinguish debt from ownership on the books" }),
    t("Financial statement analysis", { aliases: ["ratios"], outcome: "judge a company from its statements with ratios" }),
  ]),

  course(ACCT, "Managerial Accounting", ["management accounting", "cost accounting", "accounting 102"], [
    t("Costs and cost behaviour", { aliases: ["fixed and variable costs"], outcome: "classify costs and predict how they move" }),
    t("Cost-volume-profit analysis", { aliases: ["break-even"], outcome: "find break-even and read the margin of safety" }),
    t("Job and process costing", { outcome: "cost a product under either system" }),
    t("Activity-based costing", { outcome: "trace overhead to what actually drives it" }),
    t("Budgeting", { aliases: ["master budget"], outcome: "build an operating budget that hangs together" }),
    t("Variance analysis", { aliases: ["standard costs"], outcome: "explain why actuals missed the plan" }),
    t("Relevant costs for decisions", { aliases: ["make or buy"], outcome: "ignore sunk costs when it counts" }),
    t("Performance measurement", { aliases: ["roi"], outcome: "evaluate a division without gaming the metric" }),
  ]),

  course(ACCT, "Auditing", ["intro auditing", "audit"], [
    t("What an audit asserts", { aliases: ["assurance"], outcome: "state what an opinion does and does not promise" }),
    t("Professional ethics and independence", { outcome: "spot an independence problem before it spots you" }),
    t("Audit risk and materiality", { outcome: "size testing to what could mislead a reader" }),
    t("Internal control", { outcome: "evaluate controls and what their gaps permit" }),
    t("Audit evidence and procedures", { outcome: "match a procedure to the assertion it tests" }),
    t("Sampling", { outcome: "sample defensibly and extrapolate honestly" }),
    t("Auditing the major cycles", { aliases: ["revenue cycle"], outcome: "audit revenue and expenditure end to end" }),
    t("Reports and opinions", { outcome: "choose the right opinion for the facts found" }),
  ]),

  course(ACCT, "Income Taxation", ["intro taxation", "federal income tax", "tax accounting"], [
    t("The structure of an income tax", { outcome: "walk from income to tax due in order" }),
    t("Gross income and exclusions", { outcome: "decide what counts as income and what the law leaves out" }),
    t("Deductions", { aliases: ["standard deduction"], outcome: "sort deductions and take the right ones" }),
    t("Property transactions", { aliases: ["capital gains"], outcome: "compute gain, basis and its character" }),
    t("Business income and entities", { outcome: "contrast how entity choices are taxed" }),
    t("Credits", { outcome: "tell a credit from a deduction and why it matters" }),
    t("Timing and accounting methods", { outcome: "place income and expense in the right year" }),
    t("Tax procedure and ethics", { outcome: "know what positions may be taken and signed" }),
  ]),

  course(FIN, "Corporate Finance", ["intro finance", "finance 101", "business finance"], [
    t("The time value of money", { aliases: ["present value"], outcome: "move money across time correctly" }),
    t("Valuing bonds and stocks", { outcome: "price a bond and reason about a share" }),
    t("Risk and return", { aliases: ["diversification", "capm"], outcome: "explain what risk is paid for and what is not" }),
    t("Capital budgeting", { aliases: ["npv", "irr"], outcome: "accept and reject projects by NPV, and defend it" }),
    t("Cost of capital", { outcome: "build a discount rate that matches the risk" }),
    t("Capital structure", { aliases: ["leverage"], outcome: "weigh debt's discipline against its danger" }),
    t("Payout policy", { aliases: ["dividends"], outcome: "reason about dividends and buybacks" }),
    t("Working capital management", { outcome: "keep a firm liquid without waste" }),
  ]),

  course(FIN, "Personal Finance", ["money management", "financial literacy"], [
    t("Budgeting and cash flow", { outcome: "run a month on a plan instead of a vibe" }),
    t("Banking and emergency funds", { outcome: "structure accounts and a real cushion" }),
    t("Credit and debt", { aliases: ["credit scores"], outcome: "use credit without being used by it" }),
    t("Insurance", { outcome: "insure the catastrophic, skip the trivial" }),
    t("Investing fundamentals", { aliases: ["index funds"], outcome: "invest simply, diversified and long" }),
    t("Retirement accounts", { aliases: ["401k", "ira"], outcome: "use tax-advantaged accounts in the right order" }),
    t("Taxes for individuals", { outcome: "understand a paycheck and a return" }),
    t("Big purchases", { aliases: ["buying a home"], outcome: "run the rent-vs-buy and car maths honestly" }),
  ]),

  course(BUS, "Marketing", ["intro marketing", "marketing 101", "principles of marketing"], [
    t("Markets and customer value", { outcome: "state who the customer is and the job being done" }),
    t("Consumer behaviour", { outcome: "trace how buyers actually decide" }),
    t("Segmentation, targeting and positioning", { aliases: ["stp"], outcome: "carve a market and claim a position" }),
    t("Product and brand", { outcome: "manage a product's life and its brand's meaning" }),
    t("Pricing", { outcome: "price from value, cost and competition together" }),
    t("Channels and distribution", { outcome: "get product where buyers already are" }),
    t("Promotion and advertising", { aliases: ["digital marketing"], outcome: "build a campaign across paid, owned and earned" }),
    t("Marketing research and metrics", { outcome: "measure whether any of it worked" }),
  ]),

  course(BUS, "Management", ["intro management", "principles of management", "organizational behavior"], [
    t("What managers do", { outcome: "name the functions beyond bossing" }),
    t("Planning and strategy", { aliases: ["swot"], outcome: "connect goals to a plan that survives contact" }),
    t("Organizational structure", { outcome: "match a structure to a strategy" }),
    t("Motivation", { aliases: ["motivation theories"], outcome: "apply motivation theory beyond carrots and sticks" }),
    t("Leadership", { outcome: "contrast leadership styles and when each earns followers" }),
    t("Teams", { outcome: "diagnose and treat a struggling team" }),
    t("Communication and conflict", { outcome: "run disagreement productively" }),
    t("Control and change", { outcome: "measure performance and lead a change that sticks" }),
  ]),

  course(BUS, "Business Law", ["legal environment of business", "commercial law"], [
    t("Law and the courts for business", { outcome: "navigate where and how disputes get decided" }),
    t("Contract essentials", { outcome: "form a binding deal and know when one is not" }),
    t("Sales and commercial transactions", { aliases: ["ucc"], outcome: "apply the commercial code to goods" }),
    t("Agency and employment", { outcome: "know when one person's acts bind another" }),
    t("Business organizations", { aliases: ["llc", "corporations"], outcome: "choose an entity for liability and control" }),
    t("Torts in business", { outcome: "recognise negligence and its business shapes" }),
    t("Intellectual property basics", { outcome: "tell patent from copyright from trademark from secret" }),
    t("Regulation and compliance", { outcome: "map the regulators a business answers to" }),
  ]),

  course(LAW, "Contracts", ["contract law", "contracts 1"], [
    t("Formation", { aliases: ["offer and acceptance"], outcome: "find offer, acceptance and the moment of the deal" }),
    t("Consideration", { outcome: "test a promise for the bargain that binds it" }),
    t("Defences to formation", { aliases: ["duress", "misrepresentation"], outcome: "spot the deal that never really formed" }),
    t("The statute of frauds", { outcome: "know which deals demand writing" }),
    t("Interpretation and the parol evidence rule", { outcome: "decide what the contract actually says" }),
    t("Performance and breach", { aliases: ["conditions"], outcome: "call a breach material or minor, with consequences" }),
    t("Excuses", { aliases: ["impossibility", "frustration"], outcome: "argue when non-performance is forgiven" }),
    t("Remedies", { aliases: ["damages"], outcome: "measure expectation damages and their limits" }),
    t("Third parties", { aliases: ["assignment"], outcome: "trace rights that travel beyond the signers" }),
  ]),

  course(LAW, "Torts", ["tort law", "torts 1"], [
    t("Intentional torts", { aliases: ["battery", "assault"], outcome: "run the elements of the intentional torts" }),
    t("Defences to intentional torts", { aliases: ["consent", "self-defense"], outcome: "match privilege to invasion" }),
    t("Negligence: duty and breach", { outcome: "state the duty and measure conduct against it" }),
    t("Causation", { aliases: ["proximate cause"], outcome: "connect breach to harm through both causation tests" }),
    t("Damages in tort", { outcome: "categorise recoverable harm" }),
    t("Defences to negligence", { aliases: ["comparative fault"], outcome: "apportion fault under the modern rules" }),
    t("Strict liability", { aliases: ["abnormally dangerous activities"], outcome: "identify liability without fault" }),
    t("Products liability", { outcome: "run a defect claim on all three theories" }),
    t("Defamation and privacy", { outcome: "balance reputation against speech" }),
  ]),

  course(LAW, "Criminal Law", ["crim law", "criminal law 1"], [
    t("Principles of punishment", { outcome: "argue why we punish, and what that licenses" }),
    t("The elements of a crime", { aliases: ["actus reus", "mens rea"], outcome: "pair act and mental state for any offence" }),
    t("Homicide", { aliases: ["murder", "manslaughter"], outcome: "grade a killing across the homicide ladder" }),
    t("Other offences against persons and property", { aliases: ["theft", "robbery"], outcome: "distinguish the acquisition crimes" }),
    t("Inchoate crimes", { aliases: ["attempt", "conspiracy"], outcome: "find liability before the harm lands" }),
    t("Accomplice liability", { outcome: "attach guilt to helpers correctly" }),
    t("Defences", { aliases: ["self-defense", "insanity"], outcome: "run justification against excuse" }),
    t("Constitutional limits on criminal law", { outcome: "name what legality and proportionality forbid" }),
  ]),

  course(LAW, "Constitutional Law", ["con law", "constitutional law 1"], [
    t("Judicial review", { aliases: ["marbury"], outcome: "explain the courts' power to say no, and its limits" }),
    t("Federal legislative power", { aliases: ["commerce clause"], outcome: "test a statute against Congress's enumerated powers" }),
    t("Separation of powers", { aliases: ["executive power"], outcome: "referee a clash between the branches" }),
    t("Federalism limits", { outcome: "find where state power ends and federal begins" }),
    t("Due process", { aliases: ["substantive due process"], outcome: "run both due process inquiries" }),
    t("Equal protection", { outcome: "choose the scrutiny tier and apply it" }),
    t("Freedom of speech", { aliases: ["first amendment"], outcome: "categorise speech and the state's leash on it" }),
    t("Religion clauses", { outcome: "balance establishment against free exercise" }),
  ]),

  course(LAW, "Property", ["property law", "property 1"], [
    t("What property is", { aliases: ["possession"], outcome: "argue ownership from first possession to title" }),
    t("Estates in land", { aliases: ["fee simple", "life estate"], outcome: "classify present estates and what follows them" }),
    t("Future interests", { outcome: "name the remainder and when it vests" }),
    t("Concurrent ownership", { aliases: ["joint tenancy"], outcome: "manage co-owners' rights and ruptures" }),
    t("Landlord and tenant", { aliases: ["leases"], outcome: "allocate the lease's duties and remedies" }),
    t("Transfers of land", { aliases: ["deeds", "recording"], outcome: "close a conveyance and win a recording race" }),
    t("Easements and servitudes", { aliases: ["covenants"], outcome: "run rights over someone else's land" }),
    t("Adverse possession", { outcome: "test a trespasser's ripening claim" }),
    t("Takings and land use", { aliases: ["zoning", "eminent domain"], outcome: "know when regulation becomes taking" }),
  ]),

  course(LAW, "Civil Procedure", ["civ pro", "civil procedure 1"], [
    t("Personal jurisdiction", { outcome: "test whether this court can reach this defendant" }),
    t("Subject-matter jurisdiction", { aliases: ["diversity jurisdiction"], outcome: "place the case in state or federal court" }),
    t("Venue and transfer", { outcome: "find where the case belongs" }),
    t("Pleading", { aliases: ["complaints", "motions to dismiss"], outcome: "draft and attack a complaint" }),
    t("Discovery", { outcome: "get and guard information under the rules" }),
    t("Summary judgment", { outcome: "win or survive without trial" }),
    t("Trial and juries", { outcome: "preserve error and move for judgment at the right moments" }),
    t("Preclusion", { aliases: ["res judicata"], outcome: "stop the second bite at the apple" }),
    t("Joinder and class actions", { outcome: "assemble the right parties and claims" }),
  ]),

  course(LAW, "Evidence", ["evidence law", "trial evidence"], [
    t("Relevance", { outcome: "run the relevance gate and its balancing" }),
    t("Character evidence", { outcome: "apply the propensity ban and its exceptions" }),
    t("Impeachment", { outcome: "attack and rehabilitate a witness lawfully" }),
    t("Hearsay", { outcome: "spot hearsay and articulate why it is or is not" }),
    t("Hearsay exceptions", { aliases: ["excited utterance", "business records"], outcome: "fit a statement into its exception" }),
    t("Confrontation", { outcome: "apply the constitutional overlay in criminal cases" }),
    t("Privileges", { aliases: ["attorney-client privilege"], outcome: "protect what the law keeps confidential" }),
    t("Experts and opinions", { aliases: ["daubert"], outcome: "qualify an expert and challenge one" }),
    t("Authentication and best evidence", { outcome: "get documents and data admitted" }),
  ]),
] as const;
