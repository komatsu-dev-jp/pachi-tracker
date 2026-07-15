import assert from "node:assert/strict";
import { assessLiveRotation, liveDecisionCheckpointText } from "../liveRotationDecision.js";

const decide = ({ k, spins, ...extra }) => assessLiveRotation({
  trueBorder: 18,
  totalK: k,
  normalSpins: spins,
  rentBalls: 250,
  rotationStdDevPerK: Math.sqrt(20 * (1 - 20 / 250)),
  ...extra,
});

const before3K = decide({ k: 2.9, spins: 62 });
assert.equal(before3K.action, "collecting");
assert.equal(before3K.nextCheckpointK, 3);
assert.equal(before3K.remainingBalls, 26);

const weak3K = decide({ k: 3, spins: 50 });
assert.equal(weak3K.action, "stop_candidate");
assert.ok(weak3K.decisionProbability < 0.1);

const strong3K = decide({ k: 3, spins: 70 });
assert.equal(strong3K.action, "continue_strong");
assert.ok(strong3K.decisionProbability >= 0.9);

const weak5K = decide({ k: 5, spins: 87 });
assert.equal(weak5K.action, "stop");

const strong5K = decide({ k: 5, spins: 113 });
assert.equal(strong5K.action, "continue_strong");

const gray10K = decide({ k: 10, spins: 200 });
assert.equal(gray10K.action, "compare");
assert.equal(gray10K.nextCheckpointK, 20);
assert.match(liveDecisionCheckpointText(gray10K), /20K/);

const withStrongPrior = decide({
  k: 5,
  spins: 100,
  priorRotation: 23,
  priorConfidence: 0.8,
  priorScore: 80,
});
assert.equal(withStrongPrior.targetMargin, 1.5);
assert.ok(withStrongPrior.priorEquivalentK <= 3);

const machineSd = decide({ k: 5, spins: 105, rotationStdDevPerK: 6.2 });
assert.equal(machineSd.standardDeviationSource, "machine");
assert.equal(machineSd.standardDeviationPerK, 6.2);

const noData = assessLiveRotation({ trueBorder: 0, totalK: 0, normalSpins: 0 });
assert.equal(noData.action, "no_data");

const safeFallback = assessLiveRotation({ trueBorder: 18, totalK: 3, normalSpins: 60, rentBalls: 250 });
assert.equal(safeFallback.standardDeviationSource, "safe_fallback");

console.log("liveRotationDecision.test.mjs: all tests passed");
