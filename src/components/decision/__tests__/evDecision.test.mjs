// src/components/decision/__tests__/evDecision.test.mjs
// 実行: node src/components/decision/__tests__/evDecision.test.mjs

import assert from 'node:assert';
import { evDecision } from '../evDecision.js';

const cases = {
  empty:          { ev: {},                                                       expected: 'stop' },
  continueStrong: { ev: { ev1K: 400, netRot: 1500, jpCount: 5, bDiff: 2.5 },    expected: 'continue_strong' },
  continue:       { ev: { ev1K: 200, netRot: 1500, jpCount: 5, bDiff: 1.0 },    expected: 'continue' },
  hold:           { ev: { ev1K: 50,  netRot: 1500, jpCount: 5, bDiff: 0.3 },    expected: 'hold' },
  stop:           { ev: { ev1K: -100, netRot: 1500, jpCount: 5, bDiff: -1.5 },  expected: 'stop' },
};

const out = {};
let passed = 0;
let failed = 0;

for (const [name, { ev, expected }] of Object.entries(cases)) {
  const result = evDecision(ev);
  out[name] = { input: ev, result, expected };
  try {
    assert.strictEqual(result.verdict, expected);
    passed++;
  } catch {
    console.error(`FAIL [${name}]: expected "${expected}", got "${result.verdict}"`);
    failed++;
  }
}

console.log(JSON.stringify(out, null, 2));
console.log(`\n${passed} passed / ${failed} failed`);
if (failed > 0) process.exit(1);
