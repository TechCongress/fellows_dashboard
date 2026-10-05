// Regression check for checklist task ids (lib/helpers.ts): old position-based
// cells ("0,1,3") read as the right tasks, ids round-trip, removed or unknown
// ids are dropped, and offboardingComplete / accomplishmentsDocSubmitted agree.
// Same transpile-in-memory approach as the other scripts/check-*.mjs files.
//
// Run with: node scripts/check-checklist-ids.mjs

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const srcPath = path.join(import.meta.dirname, '..', 'lib', 'helpers.ts');
const { outputText } = ts.transpileModule(readFileSync(srcPath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  fileName: srcPath,
});
const tmp = path.join(import.meta.dirname, 'helpers.checktmp.cjs');
writeFileSync(tmp, outputText);
let h;
try { h = require(tmp); } finally { unlinkSync(tmp); }
const { parseChecklist, serializeChecklist, offboardingComplete, accomplishmentsDocSubmitted, ONBOARDING_TASKS, OFFBOARDING_TASKS } = h;
const ids = (set) => [...set].sort().join(',');

// Old position cells read as the tasks that were in those positions.
assert.equal(serializeChecklist(parseChecklist('0,1,3', 'offboarding'), 'offboarding'), 'accomplishments-doc,exit-interview,rippling-offboard');
assert.equal(serializeChecklist(parseChecklist('12', 'onboarding'), 'onboarding'), 'placement-intake');
// Ids round-trip, and come back in checklist order whatever order they were saved in.
assert.equal(serializeChecklist(parseChecklist('rippling-offboard, accomplishments-doc', 'offboarding'), 'offboarding'), 'accomplishments-doc,rippling-offboard');
// A mix of old positions and ids (a half-converted cell) still reads correctly.
assert.equal(ids(parseChecklist('0,exit-interview', 'offboarding')), 'accomplishments-doc,exit-interview');
// Unknown ids, out-of-range positions and blanks are dropped.
assert.equal(serializeChecklist(parseChecklist('99,not-a-task,,', 'offboarding'), 'offboarding'), '');
assert.equal(parseChecklist('', 'onboarding').size, 0);
assert.equal(parseChecklist(undefined, 'offboarding').size, 0);
// Every task id is unique, within and across the two lists.
const all = [...ONBOARDING_TASKS, ...OFFBOARDING_TASKS].map((t) => t.id);
assert.equal(new Set(all).size, all.length, 'task ids must be unique');
// Completion and the Accomplishments document work with both formats.
assert.equal(offboardingComplete('0,1,2,3,4'), true);
assert.equal(offboardingComplete(OFFBOARDING_TASKS.map((t) => t.id).join(',')), true);
assert.equal(offboardingComplete('0,1,2,3'), false);
assert.equal(accomplishmentsDocSubmitted('0'), true);
assert.equal(accomplishmentsDocSubmitted('accomplishments-doc'), true);
assert.equal(accomplishmentsDocSubmitted('1,2'), false);

console.log('ok — checklist task id checks passed');
