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

// 貸玉レートが4円等価（250玉/K）以外でも、累積玉数はレート基準で数える
const lowRate = runEvidence({
  theoreticalBorder: 18,
  effectiveStart1K: 22,
  cashKCount: 200,
}, { priorBalls: 50000, ballsPerK: 500 });
assert.ok(Math.abs(lowRate.liveConfidence - 2 / 3) < 1e-9, "ballsPerK=500 なら累積玉数は2倍");
assert.ok(Math.abs(lowRate.predictedRotation - 62 / 3) < 1e-9);

// 信頼度20%未満はグレードを断言しない
const lowConfidence = runEvidence({
  theoreticalBorder: 18,
  effectiveStart1K: 22,
  cashKCount: 10,
}, { priorBalls: 50000 });
assert.equal(lowConfidence.hasEstimate, true);
assert.ok(lowConfidence.confidence < 0.2);
assert.equal(lowConfidence.grade, "データ収集中");

// source ラベル: 推定なしは none、実測のみは live
assert.equal(empty.source, "none");
assert.equal(sample.source, "live");

// 信頼区間（3エンジン統一の事後分散式）:
// 実戦データが増えるほど狭まり、差玉事前分布の確信度も区間幅へ引き継ぐ
const noTrialsWidth = noTrials.predictedHigh - noTrials.predictedLow;
const sampleWidth = sample.predictedHigh - sample.predictedLow;
const bigSample = runEvidence({
  theoreticalBorder: 18,
  effectiveStart1K: 22,
  cashKCount: 1e6,
}, { priorBalls: 50000 });
assert.ok(sampleWidth < noTrialsWidth, "実戦データが増えるほど予測レンジが狭まる");
assert.ok(bigSample.predictedHigh - bigSample.predictedLow < sampleWidth);
const deltaOnly = runEvidence({ theoreticalBorder: 18 }, {
  priorBalls: 50000,
  priorConfidence: 0.9,
  priorRotation: 21,
});
assert.ok(
  deltaOnly.predictedHigh - deltaOnly.predictedLow < noTrialsWidth,
  "差玉解析の確信度が高いほど、実戦データなしでも予測レンジが狭い",
);
assert.ok(deltaOnly.predictedHigh > deltaOnly.predictedLow, "予測レンジは幅0に潰れない");

console.log("evidence.test.mjs: all tests passed");
