import assert from "node:assert/strict";
import {
  DECISION_LOWER_DEFAULT_Z,
  DECISION_LOWER_TARGET_COVERAGE,
  decisionLowerBound,
  normalCdf,
  predictionInterval95,
  probabilityAboveThreshold,
  quantilePinballLoss,
} from "../rotationForecast.js";

assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-7);
assert.ok(Math.abs(normalCdf(1) - 0.8413447) < 1e-6);

const interval = predictionInterval95(17, 4);
assert.ok(Math.abs(interval.low - 13.0800720309) < 1e-9);
assert.ok(Math.abs(interval.high - 20.9199279691) < 1e-9);

const lower = decisionLowerBound(17, 4);
assert.ok(Math.abs(lower - (17 - DECISION_LOWER_DEFAULT_Z * 2)) < 1e-12);
assert.equal(DECISION_LOWER_TARGET_COVERAGE, 0.8);
assert.ok(lower > interval.low, "判断用の下位20%点は、表示用95%範囲の下端より極端に低くしない");

assert.ok(Math.abs(probabilityAboveThreshold(18, 4, 18) - 0.5) < 1e-7);
assert.ok(probabilityAboveThreshold(20, 4, 18) > 0.84);
assert.equal(probabilityAboveThreshold(18, 0, 18), 0.5);

assert.equal(quantilePinballLoss(18, 17, 0.2), 0.2);
assert.equal(quantilePinballLoss(16, 17, 0.2), 0.8);

console.log("rotationForecast.test.mjs: all tests passed");
