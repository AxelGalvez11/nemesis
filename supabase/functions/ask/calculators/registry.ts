// Clinical-calculator registry. The answer engine imports CALCULATORS to discover tools, read
// each one's `inputs` (to ask the user for missing values), and `run` the deterministic formula.

import type { CalculatorDef } from "./types.ts";
import { renalCalculators } from "./renal.ts";
import { bodyCalculators } from "./body.ts";
import { labsCalculators } from "./labs.ts";
import { conversionsCalculators } from "./conversions.ts";
import { cardiologyCalculators } from "./cardiology.ts";
import { severityCalculators } from "./severity.ts";

export const CALCULATORS: CalculatorDef[] = [
  ...renalCalculators,
  ...bodyCalculators,
  ...labsCalculators,
  ...conversionsCalculators,
  ...cardiologyCalculators,
  ...severityCalculators,
];

export function getCalculator(id: string): CalculatorDef | undefined {
  return CALCULATORS.find((c) => c.id === id);
}

export function listCalculators(category?: string): CalculatorDef[] {
  return category ? CALCULATORS.filter((c) => c.category === category) : CALCULATORS;
}
