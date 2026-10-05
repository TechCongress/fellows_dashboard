/**
 * One-time conversion of the Fellows tab's checklist cells from positions
 * ("0,1,3") to task ids ("accomplishments-doc,exit-interview,...").
 *
 *   npx tsx --env-file=.env.local scripts/convert-checklist-ids.ts          # preview only
 *   npx tsx --env-file=.env.local scripts/convert-checklist-ids.ts --apply  # write the changes
 *
 * Only run --apply after the task-id update is live: the old dashboard code
 * reads positions and would see id-based cells as empty.
 */
import { convertChecklistCellsToIds } from '@/lib/sheets';

(async () => {
  const apply = process.argv.includes('--apply');
  const r = await convertChecklistCellsToIds(apply);
  console.log(`Fellows rows checked: ${r.rows}`);
  console.log(`Checklist cells to convert: ${r.cellsToChange}`);
  r.examples.forEach((e) => console.log(`  e.g. ${e}`));
  console.log(apply ? `Converted ${r.changed} cells.` : 'Preview only. Nothing was written. Re-run with --apply to convert.');
})().catch((e) => { console.error('Conversion failed:', e.message); process.exit(1); });
