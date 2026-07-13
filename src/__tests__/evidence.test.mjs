import assert from "node:assert/strict";
import { runEvidence } from "../evidence.js";

const empty = runEvidence({});
assert.equal(empty.confidence, 0);
assert.equal(empty.goodMachineScore, 0);
assert.equal(empty.hasEstimate, false);

const noTrials = runEvidence({ theoreticalBorder: 18, start1K: 22 });
assert.equal(noTrials.predictedRotation, 18);
assert.equal(noTrials.confidence, 0);

const sample = runEvidence({
  theoreticalBorder: 18,
  effectiveStart1K: 22,
  cashKCount: 200,
}, { priorBalls: 50000 });
assert.equal(sample.confidence, 0.5);
assert.equal(sample.predictedRotation, 20);
assert.equal(sample.borderDifference, 2);
assert.equal(sample.goodMachineScore, 100);
assert.equal(sample.grade, "鉄板");

const weak = runEvidence({
  theoreticalBorder: 18,
  effectiveStart1K: 16,
  cashKCount: 200,
}, { priorBalls: 50000 });
assert.equal(weak.predictedRotation, 17);
assert.equal(weak.goodMachineScore, 0);
assert.equal(weak.grade, "回収注意");

console.log("evidence.test.mjs: all tests passed");
