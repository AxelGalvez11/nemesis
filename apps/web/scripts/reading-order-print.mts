/**
 * Print the reading-order signature of the checked-in sample documents, so the
 * frozen values in `lib/pdf/reading-order.test.ts` can be regenerated after a
 * DELIBERATE change.
 *
 * Run from apps/web:
 *   npx tsx scripts/reading-order-print.mts
 */

import { orderOf, sampleModels, textHash } from "../lib/pdf/reading-order.ts";

const models = await sampleModels("public");
for (const [name, model] of Object.entries(models)) {
  console.log(`\n${name}: units=${model.units.length} blocks=${model.blocks.length}`);
  console.log(`  hash  ${textHash(model)}`);
  console.log(`  order ${orderOf(model)}`);
}
