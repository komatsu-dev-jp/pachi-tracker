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
  evidence:       { ev: { netRot: 0, evidence: { hasEstimate: true, trueBorder: 17, predictedRotation: 19, borderDifference: 2, confidence: 0.8, deltaConfidence: 0.8, liveConfidence: 0, delta: { observationCount: 3 } } }, expected: 'continue' },
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

// P-EVIDENCE有効時は信頼度内訳のラベルが「実戦/差玉」になる
const evidenceParts = evDecision(cases.evidence.ev).confidenceParts;
assert.strictEqual(evidenceParts.rotLabel, "実戦");
assert.strictEqual(evidenceParts.jpLabel, "差玉");
const fallbackParts = evDecision(cases.continue.ev).confidenceParts;
assert.strictEqual(fallbackParts.rotLabel, "回転");
assert.strictEqual(fallbackParts.jpLabel, "大当り");

console.log(JSON.stringify(out, null, 2));
console.log(`\n${passed} passed / ${failed} failed`);
if (failed > 0) process.exit(1);
