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

const { groupByOrganization, totalDurationLabel, durationLabel, phaseDateViolation, inferredPriorRole, primaryRoleConflict } = mod;

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

// ── Case 3: phaseDateViolation — phase-vs-cohort validation ─────────────────
{
  // 2024+ cohort: a Post-Fellowship role dated before the cohort year is invalid.
  assert.ok(phaseDateViolation('Post-Fellowship', '2023-06', 'January 2024'), 'pre-cohort Post-Fellowship role should be flagged');
  // Same year as cohort is fine — cutoff is January, the earliest month, so
  // nothing in the cohort year itself can be "before" it.
  assert.equal(phaseDateViolation('Post-Fellowship', '2024', 'January 2024'), null, 'bare cohort-year start should not be flagged');
  assert.equal(phaseDateViolation('Post-Fellowship', '2025-03', 'January 2024'), null, 'a later role should not be flagged');

  // Mirror case: a Pre-Fellowship role dated during/after the cohort year is invalid.
  assert.ok(phaseDateViolation('Pre-Fellowship', '2024-01', 'January 2024'), 'same-year Pre-Fellowship role should be flagged');
  assert.equal(phaseDateViolation('Pre-Fellowship', '2023-12', 'January 2024'), null, 'a genuinely earlier role should not be flagged');

  // Pre-2024 cohorts: only the genuinely ambiguous SAME-YEAR case is skipped
  // (unknown whether the cutoff was January or June that year). A different
  // year is unambiguous either way, so it's still caught — this is the real
  // bug this fixed: a 2012 Post-Fellowship role for a 2017-cohort alum.
  assert.equal(phaseDateViolation('Post-Fellowship', '2019-03', 'June 2019'), null, 'same-year role for a pre-2024 cohort is genuinely ambiguous (Jan or June cutoff) and should not be flagged');
  assert.ok(phaseDateViolation('Post-Fellowship', '2012', '2017'), 'a role from a clearly earlier year should still be flagged even for a pre-2024 cohort (the real Christopher Soghoian case: 2012 role, 2017 cohort)');
  assert.ok(phaseDateViolation('Post-Fellowship', '2018-01', 'June 2019'), 'a role from the year before a pre-2024 cohort should still be flagged');
  assert.equal(phaseDateViolation('Pre-Fellowship', '2019-08', 'June 2019'), null, 'same-year Pre-Fellowship role for a pre-2024 cohort is also ambiguous and should not be flagged');
  assert.ok(phaseDateViolation('Pre-Fellowship', '2020-01', 'June 2019'), 'a Pre-Fellowship role from clearly after a pre-2024 cohort should still be flagged');

  // Untouched phases and unparseable inputs are always fine.
  assert.equal(phaseDateViolation('Fellowship', '2020-01', 'January 2024'), null, 'Fellowship phase is not checked');
  assert.equal(phaseDateViolation('Post-Fellowship', '', 'January 2024'), null, 'no start date means nothing to check');
  assert.equal(phaseDateViolation('Post-Fellowship', '2020-01', ''), null, 'no cohort means nothing to check');
}

// ── Case 4: inferredPriorRole — the role immediately before the fellowship ──
{
  function entry(phase, title, org, start, isVolunteer) {
    return { phase, title, org, start, end: '', is_volunteer: !!isVolunteer };
  }

  // Two Pre-Fellowship roles, no volunteer roles: the later one (closer to
  // the fellowship) wins, not just the most recent role of any phase.
  {
    const history = [
      entry('Pre-Fellowship', 'Intern', 'Old Org', '2020-06'),
      entry('Pre-Fellowship', 'Analyst', 'Recent Org', '2022-01'),
      entry('Fellowship', 'CIF', 'TechCongress', '2024-01'),
    ];
    const prior = inferredPriorRole(history);
    assert.equal(prior?.title, 'Analyst', 'should pick the LATER Pre-Fellowship role, not the first one');
  }

  // A volunteer role right before the fellowship is skipped in favor of the
  // last PAID Pre-Fellowship role, even though the volunteer one is later.
  {
    const history = [
      entry('Pre-Fellowship', 'Analyst', 'Paid Job', '2022-01'),
      entry('Pre-Fellowship', 'Board Member', 'Nonprofit', '2023-06', true),
      entry('Fellowship', 'CIF', 'TechCongress', '2024-01'),
    ];
    const prior = inferredPriorRole(history);
    assert.equal(prior?.title, 'Analyst', 'a later volunteer role should not be picked over the last paid one');
  }

  // Every Pre-Fellowship role is volunteer, or there's no career history at
  // all: nothing to infer, so null rather than a misleading guess.
  {
    assert.equal(inferredPriorRole([entry('Pre-Fellowship', 'Board Member', 'Nonprofit', '2023-06', true)]), null, 'all-volunteer history should infer nothing');
    assert.equal(inferredPriorRole([]), null, 'no history should infer nothing');
  }

  // Post-Fellowship and Current roles never count as "prior" — only
  // Pre-Fellowship does.
  {
    const history = [entry('Post-Fellowship', 'Should Not Count', 'Org', '2025-01')];
    assert.equal(inferredPriorRole(history), null, 'a Post-Fellowship role should never be inferred as Prior Role');
  }
}

// ── Case 5: primaryRoleConflict — at most one featured current role ────────
{
  function cur(title, isVolunteer, isPrimary) {
    return { phase: 'Current', title, is_volunteer: !!isVolunteer, is_primary: !!isPrimary };
  }

  assert.equal(primaryRoleConflict([cur('A', false, true), cur('B', false, false)]), false, 'a single Primary flag should not conflict');
  assert.equal(primaryRoleConflict([cur('A', false, true), cur('B', false, true)]), true, 'two Current roles both marked Primary should conflict');
  assert.equal(
    primaryRoleConflict([cur('A', false, true), cur('B', true, true)]),
    false,
    'a volunteer role marked Primary should not count toward the conflict — only paid Current roles compete for the slot'
  );
  assert.equal(primaryRoleConflict([]), false, 'no roles should not conflict');
  assert.equal(
    primaryRoleConflict([{ phase: 'Post-Fellowship', is_primary: true }, { phase: 'Post-Fellowship', is_primary: true }]),
    false,
    'Primary flags on non-Current roles should never conflict — only Current roles compete for the slot'
  );
}

console.log('ok — career-pathway grouping/duration/phase-date/prior-role/primary-role checks passed');
