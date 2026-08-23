// Mathematics and statistics. Library sweep 2026-08-23. "calc 1/2/3" are the names students
// actually type; "ap calculus ab/bc" map to the courses that cover the same ground.

import { course, t } from "./authoring";

const MATH = "mathematics";
const STAT = "statistics";

export const MATHEMATICS_COURSES = [
  course(MATH, "College Algebra", ["algebra", "college algebra 101", "intermediate algebra"], [
    t("Expressions and equations", { outcome: "solve linear and absolute-value equations cleanly" }),
    t("Functions and graphs", { aliases: ["function notation"], outcome: "read a function's story off its graph" }),
    t("Linear functions and systems", { outcome: "solve a system and say what the solution means" }),
    t("Quadratics", { aliases: ["parabolas"], outcome: "solve by factoring, completing the square and the formula" }),
    t("Polynomials", { outcome: "sketch a polynomial from its zeros and end behaviour" }),
    t("Rational expressions and equations", { outcome: "simplify safely and name what is undefined" }),
    t("Exponents and radicals", { outcome: "move between radical and exponent forms" }),
    t("Exponential and logarithmic functions", { aliases: ["logs"], outcome: "solve growth and decay problems with logs" }),
    t("Inequalities", { outcome: "solve and graph inequalities, including compound ones" }),
  ]),

  course(MATH, "Precalculus", ["precalc", "pre-calculus", "ap precalculus"], [
    t("Functions in depth", { aliases: ["transformations", "inverses"], outcome: "build, shift and invert functions" }),
    t("Polynomial and rational functions", { outcome: "analyse zeros, asymptotes and end behaviour" }),
    t("Exponentials and logarithms", { outcome: "model growth and decay and solve for time" }),
    t("Trigonometric functions", { aliases: ["trig", "unit circle"], outcome: "evaluate trig anywhere on the unit circle" }),
    t("Trigonometric identities and equations", { outcome: "prove an identity and solve a trig equation" }),
    t("Applications of trigonometry", { aliases: ["law of sines", "law of cosines"], outcome: "solve a triangle that is not right" }),
    t("Polar coordinates and complex numbers", { outcome: "translate between rectangular and polar worlds" }),
    t("Vectors", { outcome: "add, scale and dot vectors with meaning" }),
    t("Sequences and series", { outcome: "work arithmetic and geometric patterns to their limits" }),
    t("Conic sections", { outcome: "recognise and graph the conics from equations" }),
  ]),

  course(MATH, "Calculus I", ["calc 1", "calculus 1", "ap calculus ab", "differential calculus"], [
    t("Limits and continuity", { outcome: "evaluate limits and say what continuity buys" }),
    t("The derivative", { aliases: ["differentiation"], outcome: "read a derivative as a rate and as a slope" }),
    t("Differentiation rules", { aliases: ["chain rule", "product rule"], outcome: "differentiate anything built from the standard parts" }),
    t("Implicit differentiation and related rates", { outcome: "solve a related-rates problem from scratch" }),
    t("Applications of the derivative", { children: [
      t("Curve sketching", { aliases: ["extrema"], outcome: "find and classify a function's extremes" }),
      t("Optimization", { outcome: "turn a word problem into a maximisation and solve it" }),
      t("Linear approximation", { outcome: "estimate with a tangent line and bound the error informally" }),
    ] }),
    t("The definite integral", { aliases: ["riemann sums"], outcome: "read an integral as accumulated change" }),
    t("The fundamental theorem of calculus", { outcome: "connect derivatives and integrals and use both directions" }),
    t("Basic integration techniques", { aliases: ["substitution"], outcome: "integrate by recognising a derivative in disguise" }),
  ]),

  course(MATH, "Calculus II", ["calc 2", "calculus 2", "ap calculus bc", "integral calculus"], [
    t("Integration techniques", { aliases: ["integration by parts", "partial fractions"], outcome: "choose and execute the right technique" }),
    t("Applications of integration", { aliases: ["volumes", "arc length"], outcome: "set up an integral for a solid or a curve length" }),
    t("Improper integrals", { outcome: "decide convergence before computing" }),
    t("Differential equations basics", { aliases: ["separable equations"], outcome: "solve separable equations and read slope fields" }),
    t("Sequences", { outcome: "decide whether a sequence settles" }),
    t("Infinite series", { aliases: ["convergence tests"], outcome: "pick the right convergence test and apply it" }),
    t("Power series", { outcome: "find where a power series lives" }),
    t("Taylor series", { aliases: ["taylor polynomials"], outcome: "build a Taylor series and use it to approximate" }),
    t("Parametric and polar calculus", { outcome: "differentiate and integrate along parametric and polar curves" }),
  ]),

  course(MATH, "Calculus III", ["calc 3", "calculus 3", "multivariable calculus", "vector calculus"], [
    t("Vectors and the geometry of space", { outcome: "work with lines, planes and surfaces in three dimensions" }),
    t("Vector-valued functions", { outcome: "describe motion along a curve" }),
    t("Partial derivatives", { outcome: "read how a surface tilts in each direction" }),
    t("The gradient and directional derivatives", { outcome: "find the steepest direction and use it" }),
    t("Multivariable optimization", { aliases: ["lagrange multipliers"], outcome: "optimise with and without constraints" }),
    t("Multiple integrals", { aliases: ["double integrals", "triple integrals"], outcome: "set up bounds that match the region" }),
    t("Integration in other coordinates", { aliases: ["polar", "cylindrical", "spherical"], outcome: "pick coordinates that fit the symmetry" }),
    t("Vector fields, line and surface integrals", { outcome: "compute work and flux" }),
    t("The big theorems", { aliases: ["green's theorem", "stokes' theorem", "divergence theorem"], outcome: "choose the theorem that turns a hard integral easy" }),
  ]),

  course(MATH, "Linear Algebra", ["intro linear algebra", "matrix algebra", "lin alg"], [
    t("Systems of linear equations", { aliases: ["gaussian elimination"], outcome: "row-reduce and interpret every outcome" }),
    t("Matrices and matrix algebra", { outcome: "multiply, invert and read matrices as maps" }),
    t("Determinants", { outcome: "compute a determinant and say what it measures" }),
    t("Vector spaces and subspaces", { aliases: ["span", "basis"], outcome: "test independence and build a basis" }),
    t("Linear transformations", { outcome: "see a matrix as a transformation and back" }),
    t("Eigenvalues and eigenvectors", { aliases: ["diagonalization"], outcome: "find eigenpairs and use them to understand a map" }),
    t("Orthogonality", { aliases: ["projections", "least squares"], outcome: "project onto a subspace and fit data by least squares" }),
    t("Applications of linear algebra", { aliases: ["markov chains"], outcome: "recognise linear algebra inside an applied problem" }),
  ]),

  course(MATH, "Differential Equations", ["diff eq", "ode", "ordinary differential equations"], [
    t("Modelling with differential equations", { outcome: "write the equation a situation obeys" }),
    t("First-order equations", { aliases: ["separable", "linear first order"], outcome: "solve the standard first-order families" }),
    t("Qualitative methods", { aliases: ["slope fields", "equilibria"], outcome: "predict long-run behaviour without solving" }),
    t("Second-order linear equations", { aliases: ["oscillators"], outcome: "solve constant-coefficient equations and read the motion" }),
    t("Laplace transforms", { outcome: "solve an initial-value problem by transform" }),
    t("Systems of differential equations", { aliases: ["phase plane"], outcome: "classify a linear system's portrait" }),
    t("Series solutions", { outcome: "solve near an ordinary point by power series" }),
    t("Numerical methods", { aliases: ["euler's method"], outcome: "step a solution forward and bound your trust in it" }),
  ]),

  course(STAT, "Statistics", ["intro statistics", "ap statistics", "stats 101", "elementary statistics"], [
    t("Describing data", { aliases: ["descriptive statistics"], outcome: "choose and read the right summary and plot" }),
    t("Study design", { aliases: ["sampling", "experiments"], outcome: "tell what a design can and cannot conclude" }),
    t("Probability foundations", { outcome: "compute with independence and conditioning" }),
    t("Random variables and distributions", { aliases: ["normal distribution", "binomial"], outcome: "use the normal and binomial models where they fit" }),
    t("Sampling distributions", { aliases: ["central limit theorem"], outcome: "explain why averages behave better than data" }),
    t("Confidence intervals", { outcome: "build one and say, correctly, what it means" }),
    t("Hypothesis testing", { aliases: ["p-values"], outcome: "run a test and interpret the p-value without overclaiming" }),
    t("Inference for two samples and proportions", { outcome: "pick the right test for the comparison" }),
    t("Chi-square and categorical data", { outcome: "test independence in a table" }),
    t("Regression", { aliases: ["least squares line"], outcome: "fit a line, read its slope, and respect its limits" }),
  ]),

  course(STAT, "Probability", ["probability theory", "intro probability"], [
    t("Counting", { aliases: ["combinatorics", "permutations"], outcome: "count outcomes without listing them" }),
    t("Probability axioms and rules", { outcome: "compute with unions, intersections and complements" }),
    t("Conditional probability and Bayes' rule", { aliases: ["bayes theorem"], outcome: "update beliefs with Bayes and avoid the base-rate trap" }),
    t("Discrete random variables", { aliases: ["expectation"], outcome: "compute expectation and variance from a distribution" }),
    t("Common discrete distributions", { aliases: ["binomial", "poisson"], outcome: "match a story to its distribution" }),
    t("Continuous random variables", { aliases: ["density functions"], outcome: "work with densities and cumulative functions" }),
    t("Common continuous distributions", { aliases: ["normal", "exponential"], outcome: "use the normal and exponential families" }),
    t("Joint distributions", { aliases: ["covariance", "independence"], outcome: "reason about two random quantities at once" }),
    t("Limit theorems", { aliases: ["law of large numbers", "central limit theorem"], outcome: "state what the two great limit theorems promise" }),
  ]),

  course(MATH, "Discrete Mathematics", ["discrete math", "discrete structures"], [
    t("Logic and proofs", { aliases: ["propositional logic"], outcome: "write a direct, contrapositive and contradiction proof" }),
    t("Sets and functions", { outcome: "compute with sets and classify functions" }),
    t("Induction and recursion", { aliases: ["mathematical induction"], outcome: "prove by induction and define recursively" }),
    t("Counting", { aliases: ["pigeonhole principle"], outcome: "count with the standard tools, including inclusion–exclusion" }),
    t("Relations", { aliases: ["equivalence relations"], outcome: "recognise orders and equivalences" }),
    t("Graphs", { aliases: ["graph theory"], outcome: "model a problem as a graph and use its language" }),
    t("Trees", { outcome: "use trees for counting, searching and spanning" }),
    t("Number theory basics", { aliases: ["modular arithmetic"], outcome: "compute mod n and see where cryptography starts" }),
  ]),
] as const;
