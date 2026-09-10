// Ad hoc regression check for the Government branch sectors (Legislative,
// Executive, Judicial, State/Local) — the scoring split in effectiveSector,
// the PATHWAY_TO_SECTORS mapping, and the explicit-branch shortcut in
// pathway derivation. Same transpile-in-memory approach as the other
// scripts/check-*.mjs files; no test framework is wired into this repo.
//
// Run with: node scripts/check-government-branches.mjs

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

const careerPathwayOut = transpile('career-pathway.ts');
let derivationOut = transpile('pathway-derivation.ts');
assert.ok(derivationOut.includes('require("@/lib/career-pathway")'), 'expected pathway-derivation.ts to import from @/lib/career-pathway');
derivationOut = derivationOut.replace('require("@/lib/career-pathway")', 'require("./career-pathway.checktmp.cjs")');

const careerPathwayTmp = path.join(libDir, 'career-pathway.checktmp.cjs');
const derivationTmp = path.join(libDir, 'pathway-derivation.checktmp.cjs');
writeFileSync(careerPathwayTmp, careerPathwayOut);
writeFileSync(derivationTmp, derivationOut);

let mod, deriveAlumniPathways;
try {
  mod = require(careerPathwayTmp);
  ({ deriveAlumniPathways } = require(derivationTmp));
} finally {
  unlinkSync(careerPathwayTmp);
  unlinkSync(derivationTmp);
}

const { isGovernmentSector, CAREER_SECTORS, GOVERNMENT_BRANCHES, matchScore } = mod;

// ── isGovernmentSector recognizes plain "Government" and all 4 branches ────
{
  assert.ok(isGovernmentSector('Government'));
  for (const branch of GOVERNMENT_BRANCHES) assert.ok(isGovernmentSector(branch), `expected ${branch} to be recognized`);
  assert.ok(!isGovernmentSector('Private'));
  assert.ok(!isGovernmentSector(''));
  assert.equal(GOVERNMENT_BRANCHES.length, 4);
  for (const branch of GOVERNMENT_BRANCHES) assert.ok(CAREER_SECTORS.includes(branch), `expected CAREER_SECTORS to include ${branch}`);
}

// ── Pathway derivation: an explicit branch tag short-circuits straight to
// the matching pathway, without needing org/title text to match anything ──
{
  const role = (title, org, sector) => ({ phase: 'Current', title, org, sector, start: '2025-01', end: '', notes: '', is_volunteer: false });

  const legislative = deriveAlumniPathways([role('Analyst', 'Some Obscure Office', 'Government – Legislative Branch')]);
  assert.ok(legislative.pathways.includes('Stay in Congress'), 'Legislative Branch sector should derive Stay in Congress even with no recognizable org text');

  const executive = deriveAlumniPathways([role('Analyst', 'Some Obscure Office', 'Government – Executive Branch')]);
  assert.ok(executive.pathways.includes('Executive Branch'), 'Executive Branch sector should derive Executive Branch pathway directly');

  const stateLocal = deriveAlumniPathways([role('Analyst', 'Some Obscure Office', 'Government – State/Local')]);
  assert.ok(stateLocal.pathways.includes('State & Local Government'), 'State/Local sector should derive State & Local Government pathway directly');

  // Judicial Branch has no pathway of its own yet — falls through to the
  // org/title heuristics same as plain "Government", and an unrecognizable
  // org/title should still come back empty rather than throwing.
  const judicial = deriveAlumniPathways([role('Clerk', 'Some Obscure Chambers', 'Government – Judicial Branch')]);
  assert.equal(judicial.pathways.length, 0, 'Judicial Branch with no recognizable org/title should derive nothing, not crash');

  // Plain "Government" (branch unspecified) still falls back to the existing
  // org/title heuristics, unchanged from before this feature.
  const plainCongress = deriveAlumniPathways([role('Legislative Director', 'Office of Sen. Gary Peters', 'Government')]);
  assert.ok(plainCongress.pathways.includes('Stay in Congress'), 'plain Government should still derive via org/title heuristics');
}

// ── Score-only refinement: PATHWAY_TO_SECTORS now points at real, visible
// branch sectors, so a fellow targeting "Stay in Congress" should score a
// sector-match bonus against an alum explicitly tagged Legislative Branch,
// even when currently_on_hill (the old hidden-split heuristic) says the
// opposite — the explicit tag should win, not the guess.
{
  const alum = {
    sector: 'Government – Legislative Branch', currently_on_hill: false,
    contact: true, policy_areas: [], realized_pathway: 'Stay in Congress',
  };
  const result = matchScore([], ['Stay in Congress'], alum);
  assert.ok(result.sectorMatch, 'an alum explicitly tagged Legislative Branch should score a sector match, regardless of currently_on_hill');

  // A plain-"Government" alum still relies on the currently_on_hill guess,
  // same as before this feature.
  const guessed = matchScore([], ['Stay in Congress'], { sector: 'Government', currently_on_hill: true, contact: true, policy_areas: [], realized_pathway: '' });
  assert.ok(guessed.sectorMatch, 'plain Government + currently_on_hill=true should still guess Legislative Branch for scoring');
}

console.log('ok — Government branch sector checks passed');
