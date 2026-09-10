// Ad hoc regression check for the "volunteer roles don't count toward
// pathway derivation" rule in lib/pathway-derivation.ts. No test framework is
// wired into this repo (see scripts/check-career-grouping.mjs), so this
// transpiles both lib/career-pathway.ts and lib/pathway-derivation.ts in
// memory (via the already-installed `typescript` package) and asserts
// against the real exported functions directly.
//
// Run with: node scripts/check-volunteer-exclusion.mjs

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const libDir = path.join(import.meta.dirname, '..', 'lib');

function transpile(fileName) {
  const srcPath = path.join(libDir, fileName);
  const { outputText } = ts.transpileModule(readFileSync(srcPath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: srcPath,
  });
  return outputText;
}

// career-pathway.ts has no non-type-only imports, so it transpiles standalone
// (see check-career-grouping.mjs). pathway-derivation.ts imports real values
// from it via the "@/lib/career-pathway" alias — rewritten here to a relative
// require so it resolves once both temp files sit side by side in lib/.
const careerPathwayOut = transpile('career-pathway.ts');
let derivationOut = transpile('pathway-derivation.ts');
assert.ok(
  derivationOut.includes('require("@/lib/career-pathway")'),
  'expected pathway-derivation.ts to import from the @/lib/career-pathway alias — did the import change?'
);
derivationOut = derivationOut.replace('require("@/lib/career-pathway")', 'require("./career-pathway.checktmp.cjs")');

const careerPathwayTmp = path.join(libDir, 'career-pathway.checktmp.cjs');
const derivationTmp = path.join(libDir, 'pathway-derivation.checktmp.cjs');
writeFileSync(careerPathwayTmp, careerPathwayOut);
writeFileSync(derivationTmp, derivationOut);

let deriveAlumniPathways;
try {
  ({ deriveAlumniPathways } = require(derivationTmp));
} finally {
  unlinkSync(careerPathwayTmp);
  unlinkSync(derivationTmp);
}

function role(phase, title, org, sector, start, isVolunteer) {
  return { phase, title, org, sector, start, end: '', notes: '', is_volunteer: !!isVolunteer };
}

// ── Case 1: a volunteer-only Current role must not become the derived pathway
{
  const history = [
    role('Post-Fellowship', 'Legislative Correspondent', 'Office of Sen. Gary Peters (D-MI)', 'Government', '2024-02'),
    role('Current', 'Board Member', 'Neighborhood Legal Aid Society', 'Policy/Think Tank/Nonprofit', '2025-01', true),
  ];
  const result = deriveAlumniPathways(history);
  assert.ok(!result.pathways.includes('Civil Society/Nonprofit'), 'a volunteer-only Current role should not surface as the derived pathway');
  // With the volunteer Current role excluded, this should fall back to the
  // most recent Post-Fellowship role instead — not come back empty.
  assert.ok(result.pathways.length > 0, 'should fall back to the paid Post-Fellowship role, not come back empty');
}

// ── Case 2: a volunteer Post-Fellowship role earns no prior-pathway credit either
{
  const history = [
    role('Post-Fellowship', 'Campaign Volunteer', 'Smith for Congress', 'Government', '2024-06', true),
    role('Current', 'Policy Analyst', 'RAND Corporation', 'Policy/Think Tank/Nonprofit', '2025-01'),
  ];
  const result = deriveAlumniPathways(history);
  assert.ok(!result.priorPathways.includes('Elected Office'), 'a volunteer Post-Fellowship role should not earn prior-pathway credit');
}

// ── Case 3: a non-volunteer Current role is unaffected by the exclusion
{
  const history = [role('Current', 'Policy Analyst', 'RAND Corporation', 'Policy/Think Tank/Nonprofit', '2025-01')];
  const result = deriveAlumniPathways(history);
  assert.ok(result.pathways.includes('Think Tank'), 'a paid Current role should still derive normally');
}

console.log('ok — volunteer-exclusion pathway-derivation checks passed');
