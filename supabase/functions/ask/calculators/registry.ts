// Clinical-calculator registry. The answer engine imports CALCULATORS to discover tools, read
// each one's `inputs` (to ask the user for missing values), and `run` the deterministic formula.
// Groups are added here as they land (body, labs, conversions, cardiology, severity scores).

import type { CalculatorDef } from "./types.ts";
import { renalCalculators } from "./renal.ts";

export const CALCULATORS: CalculatorDef[] = [
  ...renalCalculators,
];

export function getCalculator(id: string): CalculatorDef | undefined {
  return CALCULATORS.find((c) => c.id === id);
}

export function listCalculators(category?: string): CalculatorDef[] {
  return category ? CALCULATORS.filter((c) => c.category === category) : CALCULATORS;
}
