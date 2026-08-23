// Computing. Library sweep 2026-08-23. "ap computer science a" lands on Intro Programming (it is
// a first programming course); bare "python" stays un-aliased — fundamentals vs data work vs
// automation is the fork the clarify question asks, per the turn contract's own example.

import { course, t } from "./authoring";

const CS = "computer-science";

export const COMPUTER_SCIENCE_COURSES = [
  course(CS, "Introduction to Programming", ["intro programming", "programming fundamentals", "cs 101", "intro to programming", "ap computer science a", "ap computer science principles", "learn to code"], [
    t("How programs run", { outcome: "trace what the computer does with a line of code" }),
    t("Variables and types", { outcome: "choose types and predict what operations do" }),
    t("Control flow", { aliases: ["conditionals", "loops"], outcome: "write branches and loops that terminate" }),
    t("Functions", { outcome: "factor repeated work into functions with clean interfaces" }),
    t("Collections", { aliases: ["lists", "dictionaries"], outcome: "pick the right collection and use it idiomatically" }),
    t("Strings and text processing", { outcome: "slice, search and build text safely" }),
    t("Errors and debugging", { outcome: "read a stack trace and fix what it points at" }),
    t("Files and input", { outcome: "read and write files without losing data" }),
    t("Program design", { aliases: ["decomposition"], outcome: "split a problem before coding it" }),
    t("A first project", { outcome: "carry a small program from idea to working" }),
  ]),

  course(CS, "Data Structures and Algorithms", ["dsa", "data structures", "algorithms", "cs 201"], [
    t("Complexity analysis", { aliases: ["big o"], outcome: "read and state running times in big-O honestly" }),
    t("Arrays and linked lists", { outcome: "choose between them by operation cost" }),
    t("Stacks and queues", { outcome: "recognise problems that are secretly a stack" }),
    t("Hash tables", { aliases: ["hash maps"], outcome: "explain hashing, collisions and the amortised bargain" }),
    t("Trees", { aliases: ["binary search trees"], outcome: "search, insert and traverse a BST" }),
    t("Heaps and priority queues", { outcome: "use a heap where order-of-urgency matters" }),
    t("Graphs and traversal", { aliases: ["bfs", "dfs"], outcome: "model with a graph and traverse it both ways" }),
    t("Shortest paths and spanning trees", { aliases: ["dijkstra"], outcome: "run Dijkstra and say when it is wrong to" }),
    t("Sorting", { aliases: ["quicksort", "mergesort"], outcome: "compare the classic sorts by cost and stability" }),
    t("Recursion and dynamic programming", { aliases: ["dp"], outcome: "turn overlapping recursion into a table" }),
  ]),

  course(CS, "Computer Systems", ["computer organization", "computer architecture", "systems programming"], [
    t("Data representation", { aliases: ["binary", "two's complement"], outcome: "read bits as numbers, text and instructions" }),
    t("The processor", { aliases: ["cpu", "instruction cycle"], outcome: "trace fetch–decode–execute" }),
    t("Assembly language basics", { outcome: "follow a small assembly routine" }),
    t("The memory hierarchy", { aliases: ["caches"], outcome: "explain why locality is speed" }),
    t("Virtual memory", { outcome: "explain what an address really names" }),
    t("Linking and loading", { outcome: "say what happens between compile and run" }),
    t("Exceptions and processes", { outcome: "trace a system call across the boundary" }),
    t("Concurrency at the systems level", { aliases: ["threads"], outcome: "spot a data race and fence it" }),
  ]),

  course(CS, "Operating Systems", ["os", "intro operating systems"], [
    t("What an operating system is", { outcome: "name the kernel's jobs and its boundary" }),
    t("Processes and threads", { outcome: "contrast processes and threads and their costs" }),
    t("Scheduling", { outcome: "compare schedulers by fairness and throughput" }),
    t("Synchronization", { aliases: ["locks", "semaphores"], outcome: "use locks correctly and name the deadlock conditions" }),
    t("Memory management", { aliases: ["paging"], outcome: "explain paging and what a page fault costs" }),
    t("File systems", { outcome: "follow a file from name to blocks" }),
    t("Input, output and devices", { outcome: "explain how the kernel talks to hardware" }),
    t("Virtualization and containers", { outcome: "tell a virtual machine from a container" }),
  ]),

  course(CS, "Databases", ["intro databases", "sql", "database systems"], [
    t("The relational model", { aliases: ["tables", "keys"], outcome: "read a schema and its keys" }),
    t("SQL queries", { aliases: ["select", "joins"], outcome: "write joins that answer real questions" }),
    t("Data modelling", { aliases: ["er diagrams"], outcome: "design a schema from requirements" }),
    t("Normalization", { outcome: "spot redundancy and normalise it away, knowingly" }),
    t("Indexes and query performance", { outcome: "explain what an index buys and costs" }),
    t("Transactions", { aliases: ["acid"], outcome: "state what ACID promises and when it matters" }),
    t("Concurrency control", { outcome: "explain how two writers avoid corrupting each other" }),
    t("Beyond relational", { aliases: ["nosql"], outcome: "say when a document or key-value store fits better" }),
  ]),

  course(CS, "Computer Networks", ["networking", "intro networks", "computer networking"], [
    t("The layered model", { aliases: ["osi model", "tcp/ip model"], outcome: "place a protocol at its layer and say why layers exist" }),
    t("The physical and link layers", { aliases: ["ethernet"], outcome: "explain how bits cross a wire and a local network" }),
    t("The network layer", { aliases: ["ip", "routing"], outcome: "follow a packet across networks by its addresses" }),
    t("The transport layer", { aliases: ["tcp", "udp"], outcome: "choose TCP or UDP and defend it" }),
    t("The application layer", { aliases: ["http", "dns"], outcome: "trace a URL from name to page" }),
    t("Network security basics", { aliases: ["tls"], outcome: "explain what HTTPS protects and from whom" }),
    t("Wireless and mobile networks", { outcome: "name what changes when the link is air" }),
    t("Network performance", { aliases: ["latency", "bandwidth"], outcome: "diagnose slow with the right vocabulary" }),
  ]),

  course(CS, "Web Development", ["web dev", "intro web development", "full stack development"], [
    t("How the web works", { aliases: ["http basics"], outcome: "narrate a request from address bar to pixels" }),
    t("HTML", { outcome: "structure a page with meaningful elements" }),
    t("CSS", { aliases: ["layout", "flexbox"], outcome: "lay out a responsive page on purpose" }),
    t("JavaScript in the browser", { aliases: ["dom"], outcome: "make a page respond to its user" }),
    t("The server side", { aliases: ["apis", "rest"], outcome: "design and consume a small API" }),
    t("Data persistence for the web", { outcome: "connect an app to a database safely" }),
    t("Authentication and security", { aliases: ["xss", "sql injection"], outcome: "name the classic attacks and their standard defences" }),
    t("Deployment", { outcome: "put an app on the internet and keep it there" }),
  ]),

  course(CS, "Machine Learning", ["intro machine learning", "ml", "ml 101"], [
    t("What learning from data means", { outcome: "tell supervised from unsupervised problems" }),
    t("Data preparation", { aliases: ["features"], outcome: "build features and split data without leaking" }),
    t("Linear models", { aliases: ["linear regression", "logistic regression"], outcome: "fit, read and criticise a linear model" }),
    t("Model evaluation", { aliases: ["overfitting", "cross-validation"], outcome: "measure a model without fooling yourself" }),
    t("Decision trees and ensembles", { aliases: ["random forests"], outcome: "explain why many weak trees beat one strong one" }),
    t("Neural networks", { aliases: ["deep learning"], outcome: "explain what a layer learns and what training adjusts" }),
    t("Unsupervised learning", { aliases: ["clustering"], outcome: "cluster data and judge whether the clusters mean anything" }),
    t("Machine learning in practice", { aliases: ["bias", "deployment"], outcome: "name the failure modes that appear after the demo" }),
  ]),

  course(CS, "Cybersecurity Fundamentals", ["intro cybersecurity", "cybersecurity", "security fundamentals", "comptia security+"], [
    t("Thinking in threats", { aliases: ["threat models"], outcome: "state what you protect, from whom, at what cost" }),
    t("Cryptography basics", { aliases: ["encryption", "hashing"], outcome: "choose symmetric, asymmetric or hash for a job" }),
    t("Authentication and access control", { outcome: "compare factors and design least privilege" }),
    t("Network security", { aliases: ["firewalls", "vpn"], outcome: "place defences on a network diagram" }),
    t("Application security", { aliases: ["owasp"], outcome: "recognise the common web vulnerabilities" }),
    t("Social engineering", { aliases: ["phishing"], outcome: "spot manipulation aimed at humans, not machines" }),
    t("Security operations", { aliases: ["incident response"], outcome: "outline detect–respond–recover for an incident" }),
    t("Risk and compliance", { outcome: "weigh a control against the risk it retires" }),
  ]),
] as const;
