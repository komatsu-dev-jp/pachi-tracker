import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPEvidenceAnalytics,
  priorityScoreOf,
  rankStrategyCandidates,
} from "../pevidenceAnalytics.js";
import {
  buildPEvidenceBacktest,
  estimateProcessNoise,
} from "../pevidenceBacktest.js";

const machine = {
  name: "精度向上テスト機",
  modelName: "P精度向上TEST",
  modelVerified: true,
  allocationVerified: true,
  border1K: 18,
  avgPayoutPerHit: 1000,
  stdDev: 4000,
  stdDevMethod: "p-evidence-branching-v2",
  synthProb: 319.6,
  muraCoef: 50000,
};

function rowForRate(num, rate, date, {
  spins = 720,
  island = "A島",
  event = "",
} = {}) {
  const inputBalls = 250 * spins / rate;
  const hits = Math.max(1, Math.ceil(inputBalls / machine.avgPayoutPerHit) + 2);
  return {
    date,
    num: String(num),
    machineName: machine.name,
    island,
    normalSpins: spins,
    totalStarts: hits,
    val: hits * machine.avgPayoutPerHit - inputBalls,
    event,
  };
}

function scan(date, rows, event = "") {
  return {
    id: `scan-${date}-${rows[0]?.num || "none"}`,
    storeId: "store-a",
    storeName: "精度向上店",
    date,
    event,
    createdAt: `${date}T12:00:00.000Z`,
    rows,
  };
}

test("日次変動は大量データでも翌日信頼度を上限化し、予測区間を残す", () => {
  const date = "2026-07-01";
  const result = buildPEvidenceAnalytics({
    scans: [scan(date, [rowForRate("101", 22, date, { spins: 100000 })])],
    customMachines: [machine],
  });
  const row = result.currentRows[0];
  const processOnlyRow = result.historyRows[0];

  assert.equal(result.processNoise.global.source, "default");
  assert.equal(result.processNoise.global.sd, 1.75);
  assert.ok(row.dataConfidence > 0.98);
  assert.ok(processOnlyRow.confidence >= 0.5 && processOnlyRow.confidence <= 0.65);
  assert.ok(row.confidence <= processOnlyRow.confidence);
  assert.ok(row.predictedHigh - row.predictedLow >= 2 * 1.96 * 1.75);
});

test("部分プーリングは同日peerを使い、未来日の追加では過去予測を変えない", () => {
  const date = "2026-07-01";
  const rows = [
    rowForRate("101", 22, date, { spins: 180 }),
    ...Array.from({ length: 8 }, (_, index) => (
      rowForRate(String(102 + index), 14, date, { spins: 1440 })
    )),
  ];
  const base = buildPEvidenceAnalytics({
    scans: [scan(date, rows)],
    customMachines: [machine],
  });
  const target = base.historyRows.find((row) => row.num === "101" && row.date === date);
  assert.ok(target.priorAdjustment < 0);
  assert.ok(target.priorMean < target.border);
  assert.ok(target.priorSources.some((source) => source.type === "same-day-machine-peers"));

  const futureDate = "2026-07-02";
  const withFuture = buildPEvidenceAnalytics({
    scans: [
      scan(date, rows),
      scan(futureDate, [
        rowForRate("101", 30, futureDate),
        rowForRate("102", 30, futureDate),
      ]),
    ],
    customMachines: [machine],
  });
  const historicalTarget = withFuture.historyRows.find(
    (row) => row.num === "101" && row.date === date,
  );
  assert.equal(historicalTarget.priorMean, target.priorMean);
  assert.equal(historicalTarget.predictedRotation, target.predictedRotation);
});

test("急に開いた翌日の締め確率は平均予測と分散へ一度だけ織り込まれる", () => {
  const rates = [18, 24, 14, 18, 24, 14, 18, 24, 14, 24];
  const scans = rates.map((rate, index) => {
    const date = `2026-07-${String(index + 1).padStart(2, "0")}`;
    return scan(date, [rowForRate("101", rate, date)]);
  });
  const result = buildPEvidenceAnalytics({
    scans,
    customMachines: [machine],
    params: {
      cusumThresholdMultiplier: 1,
      cusumSlackMultiplier: 0.1,
      minDailySamples1K: 1,
      markovMinTransitions: 2,
    },
  });
  const current = result.currentRows[0];

  assert.equal(current.tightEvidence.openShock.detected, true);
  assert.ok(current.tightEvidence.openShock.total > 0);
  assert.ok(current.tightProbability > 0);
  assert.ok(current.tightenedRotation <= current.heldRotation);
  assert.ok(current.predictedRotation <= current.heldRotation);
  assert.ok(current.tightMeanAdjustment <= 0);
  assert.ok(current.transitionVariance >= 0);
  assert.notEqual(current.contextAdjustment, -8);
});

test("LCBランキングは平均が少し高い不安定台より、下限が高い安定台を上位にする", () => {
  const unstable = {
    machineName: "不安定台",
    num: "101",
    predictedRotation: 22,
    nextDayVariance: 9,
    effectiveBorder: 18,
    score: 100,
    confidence: 0.6,
  };
  const stable = {
    machineName: "安定台",
    num: "102",
    predictedRotation: 21,
    nextDayVariance: 1,
    effectiveBorder: 18,
    score: 50,
    confidence: 0.6,
  };
  assert.ok(priorityScoreOf(stable) > priorityScoreOf(unstable));
  assert.equal(rankStrategyCandidates([unstable, stable])[0].num, "102");
});

test("日次ノイズは既知分散を除いた誤差から学習し、疎な層は全体へ縮約する", () => {
  const pairs = Array.from({ length: 16 }, (_, index) => ({
    store: "store-a",
    machineName: "精度向上テスト機",
    error: index % 2 ? 3 : -3,
    forecastVariance: 0.25,
    observationVariance: 0.25,
  }));
  const model = estimateProcessNoise(pairs);
  const profile = model.byProfile["store-a___精度向上テスト機"];

  assert.equal(model.global.source, "learned");
  assert.ok(model.global.sd > 2);
  assert.equal(profile.source, "pooled");
  assert.ok(profile.reliability > 0 && profile.reliability < 1);
});

test("推奨上位5台のバックテストだけを層別し、過去だけで改善した偏り補正を有効化する", () => {
  const rows = [];
  for (let day = 1; day <= 26; day += 1) {
    const date = `2026-06-${String(day).padStart(2, "0")}`;
    for (let machineIndex = 1; machineIndex <= 6; machineIndex += 1) {
      rows.push({
        store: "store-a",
        machineName: `候補機${machineIndex}`,
        num: String(100 + machineIndex),
        date,
        valid: true,
        dailyRate: 19,
        dailyStandardError: 0.2,
        predictedRotation: machineIndex <= 5 ? 22 : 20,
        predictedLow: 17,
        predictedHigh: 27,
        nextDayVariance: 1,
        confidence: 0.8,
        border: 18,
        machine: { name: `候補機${machineIndex}`, muraCoef: 50000 },
      });
    }
  }
  const backtest = buildPEvidenceBacktest(rows);

  assert.equal(backtest.selection.recommendedTop5.n, 125);
  assert.equal(backtest.biasCorrection.status, "active");
  assert.equal(backtest.biasCorrection.appliesAutomatically, true);
  assert.ok(backtest.biasCorrection.appliedRotationAdjustment < 0);
  assert.ok(
    backtest.biasCorrection.validation.corrected.mae
      < backtest.biasCorrection.validation.raw.mae,
  );
  assert.ok(backtest.selection.byVerdict.strong.n > 0);
});
