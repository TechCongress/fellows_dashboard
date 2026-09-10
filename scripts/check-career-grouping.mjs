// Ad hoc regression check for lib/career-pathway.ts's tenure grouping and
// duration math. No test framework is wired into this repo, so this script
// transpiles the module in memory (via the already-installed `typescript`
// package) and asserts against the real exported functions directly.
//
// Run with: node scripts/check-career-grouping.mjs

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const srcPath = path.join(import.meta.dirname, '..', 'lib', 'career-pathway.ts');
const source = readFileSync(srcPath, 'utf8');

const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
  fileName: srcPath,
});

// `@/types` is a path alias (webpack/tsconfig only) that resolves to nothing
// under plain `require`. Every import from it is type-only, so transpiling
// already elided the statement — but guard in case that ever changes.
assert.ok(!outputText.includes("require(\"@/types\")"), 'expected @/types import to be elided as type-only');

const tmpPath = srcPath.replace(/\.ts$/, '.checktmp.cjs');
writeFileSync(tmpPath, outputText);
let mod;
try {
  mod = require(tmpPath);
} finally {
  unlinkSync(tmpPath);
}

const { groupByOrganization, totalDurationLabel, durationLabel } = mod;

function role(org, start, end) {
  return { org, sector: 'Private', start, end };
}

// ── Case 1: consecutive same-org roles (the bug just fixed) ────────────────
// Two summer internships at the same company, a year apart, with no other
// employer in between — these merge into one tenure block. The total should
// be the sum of each role's own time, not the first-start-to-last-end span.
{
  const roles = [role('Connexus Corporation', '2016-06', '2016-08'), role('Connexus Corporation', '2017-06', '2017-08')];
  const tenures = groupByOrganization(roles);
  assert.equal(tenures.length, 1, 'consecutive same-org roles should merge into one tenure');
  assert.equal(tenures[0].roles.length, 2);
  assert.equal(
    totalDurationLabel(tenures[0].roles, tenures[0].start, tenures[0].end),
    '6 mos',
    'summed duration should be 3 mos + 3 mos, not the 1 yr 3 mos span'
  );
}

// ── Case 2: non-consecutive same-org roles (left and came back) ────────────
// Same employer, but with a different employer's role in between. Per the
// documented rule, this must NOT merge into one tenure — that would even
// more badly overstate tenure by spanning across an unrelated job.
{
  const roles = [
    role('Acme Corp', '2015-01', '2016-01'),
    role('Other Company', '2016-06', '2017-06'),
    role('Acme Corp', '2019-01', '2020-01'),
  ];
  const tenures = groupByOrganization(roles);
  assert.equal(tenures.length, 3, 'a same-org role separated by a different employer must not merge');
  const acmeTenures = tenures.filter((t) => t.org === 'Acme Corp');
  assert.equal(acmeTenures.length, 2, 'the two Acme Corp stints should stay as two distinct tenures');
  // Inclusive of both endpoints (documented durationLabel behavior), so
  // Jan 2015 -> Jan 2016 is 13 months, not 12.
  assert.equal(durationLabel(acmeTenures[0].start, acmeTenures[0].end), '1 yr 1 mo');
  assert.equal(durationLabel(acmeTenures[1].start, acmeTenures[1].end), '1 yr 1 mo');
}

console.log('ok — career-pathway grouping/duration checks passed');
