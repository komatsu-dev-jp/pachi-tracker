import assert from "node:assert/strict";
import {
  buildBacktestPairs,
  buildCalibrationCandidates,
  buildDecisionLowerCalibration,
  buildPEvidenceBacktest,
  summarizeBacktestPairs,
} from "../pevidenceBacktest.js";

const machine = { name: "テスト機", muraCoef: 50000 };

function row(date, {
  store = "store-a",
  machineName = "テスト機",
  num = "101",
  valid = true,
  predictedRotation = 20,
  predictedLow = 18,
  predictedHigh = 22,
  dailyRate = 20,
  border = 18,
  rowMachine = machine,
} = {}) {
  return {
    store,
    machineName,
    num,
    date,
    valid,
    predictedRotation,
    predictedLow,
    predictedHigh,
    dailyRate,
    border,
    machine: rowMachine,
  };
}

const metricRows = [
  row("2026-07-01", {
    predictedRotation: 20,
    predictedLow: 18,
    predictedHigh: 22,
    dailyRate: 19,
  }),
  row("2026-07-02", {
    predictedRotation: 19,
    predictedLow: 18.5,
    predictedHigh: 19.5,
    dailyRate: 18,
  }),
  row("2026-07-03", {
    predictedRotation: 21,
    predictedLow: 19,
    predictedHigh: 23,
    dailyRate: 20,
  }),
];

const result = buildPEvidenceBacktest(metricRows);
const key = "store-a___テスト機___101";
assert.equal(result.pairs.length, 2);
assert.deepEqual(
  result.pairs.map((pair) => [pair.predictionDate, pair.actualDate]),
  [
    ["2026-07-01", "2026-07-02"],
    ["2026-07-02", "2026-07-03"],
  ],
);
assert.equal(result.overall.n, 2);
assert.equal(result.overall.mae, 1.5);
assert.equal(result.overall.bias, 0.5, "bias は予測 - 実測。正なら過大予測");
assert.equal(result.overall.rmse, Math.sqrt(2.5));
assert.equal(result.overall.within1Rate, 0.5);
assert.equal(result.overall.coverage95, 0.5);
assert.equal(result.overall.decisionLowerCoverage, 0.5);
assert.equal(result.overall.decisionLowerTargetCoverage, 0.8);
assert.equal(result.overall.sitCount, 2);
assert.equal(result.overall.falseSitRate, 0.5);
assert.ok(result.overall.decisionLowerPinballLoss > 0);
assert.ok(result.overall.thresholdBrierScore >= 0);
assert.deepEqual(result.byKeyList, [result.byKey[key]]);
assert.equal(result.byKey[key].n, 2);
assert.equal(result.biasDefinition, "prediction-minus-actual");

const emptyMetrics = summarizeBacktestPairs([]);
assert.deepEqual(emptyMetrics, {
  n: 0,
  mae: null,
  bias: null,
  rmse: null,
  within1Rate: null,
  coverage95: null,
  decisionLowerCoverage: null,
  decisionLowerTargetCoverage: 0.8,
  decisionLowerCalibrationError: null,
  averageDecisionLowerWidth: null,
  decisionLowerPinballLoss: null,
  thresholdSampleCount: 0,
  thresholdBrierScore: null,
  sitCount: 0,
  skipCount: 0,
  falseSitRate: null,
  falseSkipRate: null,
});

assert.equal(result.decisionLowerCalibration.status, "awaiting-samples");
assert.equal(result.decisionLowerCalibration.minRequired, 100);
assert.equal(result.decisionLowerCalibration.remainingSamples, 98);

const standardizedPairs = Array.from({ length: 100 }, (_, index) => ({
  id: `pair-${index}`,
  actualDate: `2026-${String(Math.floor(index / 28) + 1).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}`,
  error: index < 81 ? 0.9 : 2,
  forecastVariance: 1,
}));
const calibratedLower = buildDecisionLowerCalibration(standardizedPairs);
assert.equal(calibratedLower.status, "calibrated");
assert.equal(calibratedLower.sampleCount, 100);
assert.equal(calibratedLower.k, 0.9);
assert.equal(calibratedLower.observedCoverage, 0.81);
assert.equal(
  buildDecisionLowerCalibration(standardizedPairs.slice(0, 99), {
    decisionCalibrationMinSamples: 1,
  }).status,
  "awaiting-samples",
  "判断用下限は指定で安全最低件数100を下回れない",
);

// 店舗・機種・台番号のどれかが違えば、別履歴として扱う。
const identityPairs = buildBacktestPairs([
  row("2026-07-01"),
  row("2026-07-02", { dailyRate: 19 }),
  row("2026-07-01", { store: "store-b" }),
  row("2026-07-02", { store: "store-b", dailyRate: 21 }),
  row("2026-07-01", { num: "102" }),
  row("2026-07-02", { num: "102", dailyRate: 22 }),
]);
assert.equal(identityPairs.length, 3);
assert.equal(new Set(identityPairs.map((pair) => pair.key)).size, 3);

// 同じ履歴・同じ日の複数行は、入力順で片方を選ばず日ごと除外する。
assert.equal(buildBacktestPairs([
  row("2026-07-01"),
  row("2026-07-02", { dailyRate: 19 }),
  row("2026-07-02", { dailyRate: 21 }),
  row("2026-07-03"),
]).length, 0);

// invalid 行を飛び越えてペアにせず、暦上の翌日だけを採用する。
assert.equal(buildBacktestPairs([
  row("2026-07-01"),
  row("2026-07-02", { valid: false }),
  row("2026-07-03"),
]).length, 0);
assert.equal(buildBacktestPairs([
  row("2026-07-01"),
  row("2026-07-03"),
]).length, 0);

// 不完全な予測区間や実測はバックテストへ混ぜない。
assert.equal(buildBacktestPairs([
  row("2026-07-01", { predictedHigh: null }),
  row("2026-07-02"),
]).length, 0);
assert.equal(buildBacktestPairs([
  row("2026-07-01"),
  row("2026-07-02", { dailyRate: null }),
]).length, 0);

// 将来行を足しても、既に確定した過去ペアの値は変わらない。
const base = buildPEvidenceBacktest(metricRows);
const withFuture = buildPEvidenceBacktest([
  ...metricRows,
  row("2026-07-04", { dailyRate: 17 }),
]);
assert.deepEqual(withFuture.pairs.slice(0, base.pairs.length), base.pairs);
assert.equal(withFuture.pairs.length, base.pairs.length + 1);

function calibrationRows(dayCount) {
  return Array.from({ length: dayCount }, (_, index) => row(
    `2026-06-${String(index + 1).padStart(2, "0")}`,
    {
      predictedRotation: 20,
      predictedLow: 17,
      predictedHigh: 23,
      dailyRate: 19 + (index % 3),
    },
  ));
}

const originalMachine = structuredClone(machine);
const belowThresholdPairs = buildBacktestPairs(calibrationRows(20));
const belowThreshold = buildCalibrationCandidates(belowThresholdPairs);
assert.equal(belowThresholdPairs.length, 19);
assert.equal(belowThreshold[0].recommendedPriorBalls, null);
assert.equal(belowThreshold[0].eligible, false);
assert.equal(belowThreshold[0].reason, "insufficient-samples");

const enoughRows = calibrationRows(21);
const enoughPairs = buildBacktestPairs(enoughRows);
const enough = buildCalibrationCandidates(enoughPairs);
assert.equal(enoughPairs.length, 20);
assert.equal(enough[0].n, 20);
assert.equal(typeof enough[0].recommendedPriorBalls, "number");
assert.equal(enough[0].proposalOnly, true);
assert.equal(enough[0].appliesAutomatically, false);
assert.deepEqual(machine, originalMachine, "校正は提案のみで機種マスタを変更しない");
assert.deepEqual(enoughRows[0].machine, originalMachine);

// 閾値を下げる指定が来ても、安全下限の20件を維持する。
assert.equal(
  buildCalibrationCandidates(belowThresholdPairs, { minCalibrationSamples: 1 })[0]
    .recommendedPriorBalls,
  null,
);

// 校正は全店舗共通なので、店舗を切り替えても校正前の古い実績を
// 「新しく集まったサンプル」と誤認しない。
const latestCalibrationHistory = [
  {
    id: "older-large-sample-count",
    approvedAt: "2026-05-01T09:00:00.000Z",
    effectiveFrom: "2026-05-01",
    sampleCount: 999,
    previousPriorBalls: 40000,
    appliedPriorBalls: 45000,
  },
  {
    id: "latest-smaller-sample-count",
    approvedAt: "2026-06-25T09:00:00.000Z",
    effectiveFrom: "2026-06-25",
    sampleCount: 20,
    previousPriorBalls: 45000,
    appliedPriorBalls: 50000,
  },
];
const anotherStoreRows = calibrationRows(30).map((entry, index) => ({
  ...entry,
  store: "store-b",
  machine: {
    ...machine,
    pevidenceCalibrationHistory: latestCalibrationHistory,
  },
  date: `2026-06-${String(index + 1).padStart(2, "0")}`,
}));
const anotherStoreCandidate = buildCalibrationCandidates(
  buildBacktestPairs(anotherStoreRows),
)[0];
assert.equal(anotherStoreCandidate.n, 29);
assert.equal(
  anotherStoreCandidate.samplesSinceCalibration,
  5,
  "最新校正の有効日以後に作った予測だけを新規サンプルとして数える",
);
assert.equal(anotherStoreCandidate.eligible, false);
assert.equal(anotherStoreCandidate.reason, "awaiting-new-samples");
assert.equal(anotherStoreCandidate.remainingSamples, 15);
