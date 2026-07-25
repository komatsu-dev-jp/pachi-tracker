import test from "node:test";
import assert from "node:assert/strict";

import {
  assessStrategyPredictionDivergence,
  buildStrategyMap,
  buildStrategyPlanContext,
  getStrategyFreshness,
} from "../strategyMapData.js";
import {
  buildPEvidenceAnalytics,
  buildPortfolioPlan,
  classifyEvidenceScore,
  PE_PARAMS,
  pevidenceInternals,
} from "../../evidence/pevidenceAnalytics.js";
import { collectDeltaRows, estimateDeltaObservation } from "../../delta/deltaEvidence.js";
import { calculateStrategyEconomics } from "../../../economics.js";

const close = (actual, expected, tolerance = 1e-9) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
};

const auditMachine = {
  name: "監査テスト機",
  modelName: "P監査テスト機TEST",
  modelVerified: true,
  allocationVerified: true,
  border1K: 18,
  prob: "1/319.6",
  synthProb: 319.6,
  avgPayoutPerHit: 1400,
  hesoAvgPayout: 450,
  rushAvgPayout: 1500,
  rushEntryRate: 60,
  rushContinueRate: 81,
  stdDev: 4000,
  stdDevMethod: "p-evidence-branching-v2",
  muraCoef: 50000,
};

function activeRow(num = "101", date = "2026-07-10", island = "A島") {
  return {
    date,
    num,
    machineName: auditMachine.name,
    island,
    normalSpins: 720,
    totalStarts: 10,
    // 推定投入 = 10 * 1,400 - 5,000 = 9,000玉、実測 = 20回/K。
    val: 5000,
  };
}

function scanOf(rows, {
  id = "audit-scan",
  date = "2026-07-10",
  createdAt = `${date.replaceAll("/", "-")}T12:00:00.000Z`,
} = {}) {
  return {
    id,
    storeId: "audit-store",
    storeName: "監査店",
    date,
    createdAt,
    rows,
  };
}

test("換金率250/280の前提と実質ボーダー損益ゼロを一つの契約として固定する", () => {
  const commonMapArgs = {
    scans: [scanOf([activeRow()])],
    customMachines: [auditMachine],
    selectedStoreId: "audit-store",
    targetDate: "2026-07-10",
  };
  const equivalentMap = buildStrategyMap({
    ...commonMapArgs,
    plan: buildStrategyPlanContext({
      date: "2026-07-10",
      rentBalls: 250,
      exRate: 250,
      nonCashRatio: 0.5,
    }),
  });
  const nonEquivalentMap = buildStrategyMap({
    ...commonMapArgs,
    plan: buildStrategyPlanContext({
      date: "2026-07-10",
      rentBalls: 250,
      exRate: 280,
      nonCashRatio: 0.5,
    }),
  });

  assert.equal(equivalentMap.all[0].economicAssumptions.exRate, 250);
  assert.equal(nonEquivalentMap.all[0].economicAssumptions.exRate, 280);
  close(nonEquivalentMap.plan.ballValueYen, 1000 / 280);
  assert.equal(equivalentMap.all[0].border, equivalentMap.all[0].equivalentBorder);
  assert.ok(
    nonEquivalentMap.all[0].border > nonEquivalentMap.all[0].equivalentBorder,
    "非等価の現金利用分は実質ボーダーを押し上げる",
  );

  const equivalent = calculateStrategyEconomics({
    rotation: 18,
    equivalentBorder: 18,
    rentBalls: 250,
    exRate: 250,
    nonCashRatio: 0.5,
  });
  close(equivalent.effectiveBorder, 18);
  close(equivalent.evPerRot, 0);

  const nonEquivalent = calculateStrategyEconomics({
    rotation: 18,
    equivalentBorder: 18,
    rentBalls: 250,
    exRate: 280,
    nonCashRatio: 0.5,
  });
  assert.equal(nonEquivalent.exRate, 280);
  assert.ok(nonEquivalent.effectiveBorder > 18);

  const breakEven = calculateStrategyEconomics({
    rotation: nonEquivalent.effectiveBorder,
    equivalentBorder: 18,
    rentBalls: 250,
    exRate: 280,
    nonCashRatio: 0.5,
  });
  close(breakEven.evPerRot, 0);
});

test("score判定は信頼度20%・score10/50の境界で全画面共通になる", () => {
  assert.equal(classifyEvidenceScore(100, 0.199), "nodata");
  assert.equal(classifyEvidenceScore(100, 19.9), "nodata", "百分率の信頼度にも同じ境界を使う");
  assert.equal(classifyEvidenceScore(9.999, 0.2), "weak");
  assert.equal(classifyEvidenceScore(10, 0.2), "watch");
  assert.equal(classifyEvidenceScore(49.999, 100), "watch");
  assert.equal(classifyEvidenceScore(50, 100), "strong");
});

test("締め兆候がある台はscoreが高くても共通portfolioから除外する", () => {
  const base = {
    machineName: auditMachine.name,
    hourly: 2000,
    hourlyRisk: 1000,
    sharpe: 2,
    verdict: "strong",
    valid: true,
    actionable: true,
    recommendationStatus: "actionable",
  };
  const result = buildPortfolioPlan([
    { ...base, num: "101", score: 999, nailAlert: "締め状態が継続" },
    { ...base, num: "102", score: 998, nailAlert: "ニュートラル", tightProbability: 0.95 },
    { ...base, num: "103", score: 50, nailAlert: "ニュートラル", tightProbability: 0.2 },
  ], {
    plannedHours: 6,
    spinsPerHour: 210,
    rentBalls: 250,
  });

  assert.deepEqual(
    result.plan.map((item) => String(item.number)),
    ["103"],
    "釘アラートだけでなく締め確率60%以上も配分から外す",
  );
  assert.equal(result.totalHours, 6);
});

test("既定の実戦時間は6時間・1,260回転に統一する", () => {
  const plan = buildStrategyPlanContext({ date: "2026-07-10" });
  assert.equal(plan.plannedHours, 6);
  assert.equal(plan.sessionSpins, 1260);
  assert.equal(PE_PARAMS.portfolioHours, 6);
  assert.equal(PE_PARAMS.sessionSpins, 1260);
});

test("P-EVIDENCEの日次観測はDelta直式と完全一致する", () => {
  const row = activeRow();
  const delta = estimateDeltaObservation(row, auditMachine, {
    graphStepBalls: PE_PARAMS.graphStepBalls,
    minRate: 5,
    maxRate: 45,
  });
  const pevidence = pevidenceInternals.estimateDaily(row, auditMachine, PE_PARAMS);

  assert.equal(delta.valid, true);
  assert.equal(pevidence.valid, true);
  close(pevidence.dailyRate, delta.observedRotation);
  close(pevidence.estimatedInputBalls, delta.estimatedInputBalls);
  close(pevidence.inputVariance, delta.inputVariance);
});

test("当り0・差玉プラスはinvalidとなり、tightProbabilityは0でなくnullになる", () => {
  const impossible = {
    ...activeRow(),
    normalSpins: 720,
    totalStarts: 0,
    val: 1000,
  };
  const delta = estimateDeltaObservation(impossible, auditMachine);
  assert.equal(delta.valid, false);

  const result = buildPEvidenceAnalytics({
    scans: [scanOf([impossible])],
    customMachines: [auditMachine],
  });
  assert.equal(result.latestRows.length, 1);
  assert.equal(result.latestRows[0].valid, false);
  assert.equal(result.latestRows[0].verdict, "nodata");
  assert.equal(result.latestRows[0].tightProbability, null);
  assert.equal(result.latestRows[0].tightEvidence.status, "unavailable");
});

test("日付のハイフン・スラッシュと1桁月日が混在しても最新日を正しく選ぶ", () => {
  const freshness = getStrategyFreshness([
    scanOf([activeRow("101", "2026/7/9")], {
      id: "date-old",
      date: "2026/7/9",
      createdAt: "2026-07-09T12:00:00.000Z",
    }),
    scanOf([activeRow("101", "2026-7-10")], {
      id: "date-new",
      date: "2026-7-10",
      createdAt: "2026-07-10T12:00:00.000Z",
    }),
  ], "2026/7/11");

  assert.equal(freshness.sourceDate, "2026-07-10");
  assert.equal(freshness.targetDate, "2026-07-11");
  assert.equal(freshness.ageDays, 1);
  assert.equal(freshness.status, "prepared");

  const deltaRows = collectDeltaRows([
    scanOf([activeRow("101", "2026/7/9")], {
      id: "delta-date",
      date: "2026/7/9",
      createdAt: "2026-07-09T12:00:00.000Z",
    }),
  ]);
  assert.equal(deltaRows[0]?.date, "2026-07-09", "Delta履歴も同じ正規日付を使う");
  assert.equal(
    collectDeltaRows([scanOf([activeRow("101", "2026-02-31")], { date: "2026-02-31" })]).length,
    0,
    "実在しない暦日は分析へ入れない",
  );
  assert.equal(
    buildPEvidenceAnalytics({
      scans: [scanOf([activeRow("101", "2026-02-31")], { date: "2026-02-31" })],
      customMachines: [auditMachine],
    }).rawRowCount,
    0,
    "P-EVIDENCEも実在しない暦日を分析へ入れない",
  );
});

test("nodata台は島平均と島の分析済み台数から除外する", () => {
  const invalid = {
    ...activeRow("102"),
    totalStarts: 0,
    val: 1000,
  };
  const map = buildStrategyMap({
    scans: [scanOf([activeRow("101"), invalid])],
    customMachines: [auditMachine],
    selectedStoreId: "audit-store",
    targetDate: "2026-07-10",
  });
  const validMachine = map.all.find((item) => String(item.num) === "101");
  const invalidMachine = map.all.find((item) => String(item.num) === "102");
  const island = map.islands.find((item) => item.id === "A島");

  assert.equal(validMachine?.recommendationStatus, "actionable");
  assert.equal(invalidMachine?.verdict, "nodata");
  assert.equal(invalidMachine?.recommendationStatus, "reference");
  assert.equal(invalidMachine?.tomorrowTight, null, "算定不能を0%に見せない");
  assert.equal(map.islandAvgRot("A島"), validMachine.rot);
  assert.equal(island?.analyzedMachines, 1);
});

test("最新日の読取失敗で前日の予測・稼働状態を復活させない", () => {
  const previous = scanOf([activeRow("101", "2026-07-09")], {
    id: "previous-valid",
    date: "2026-07-09",
    createdAt: "2026-07-09T12:00:00.000Z",
  });
  const failed = scanOf([{
    ...activeRow("101", "2026-07-10"),
    val: null,
    status: "failed",
  }], {
    id: "current-failed",
    date: "2026-07-10",
    createdAt: "2026-07-10T12:00:00.000Z",
  });
  const map = buildStrategyMap({
    scans: [previous, failed],
    customMachines: [auditMachine],
    selectedStoreId: "audit-store",
    targetDate: "2026-07-10",
  });
  const machine = map.all[0];
  const island = map.islandStats[0];

  assert.equal(machine.verdict, "nodata");
  assert.equal(machine.recommendationStatus, "reference");
  assert.equal(machine.rot, null);
  assert.equal(machine.confidence, 0);
  assert.equal(machine.activityStatus, "invalid");
  assert.equal(machine.profitChanceStatus, "data-missing");
  assert.equal(machine.tomorrowTight, null);
  assert.equal(island.activeMachines, 0);
  assert.equal(island.invalidMachines, 1);
  assert.equal(island.activitySignal, "読取除外あり");
});

test("行の日付が不正・スキャン日と不一致でも前日予測を復活させない", () => {
  const previous = scanOf([activeRow("101", "2026-07-09")], {
    id: "date-defense-previous",
    date: "2026-07-09",
    createdAt: "2026-07-09T12:00:00.000Z",
  });
  const invalidRowDate = scanOf([activeRow("101", "2026-02-31")], {
    id: "date-defense-current",
    date: "2026-07-10",
    createdAt: "2026-07-10T12:00:00.000Z",
  });
  const map = buildStrategyMap({
    scans: [previous, invalidRowDate],
    customMachines: [auditMachine],
    selectedStoreId: "audit-store",
    targetDate: "2026-07-10",
  });
  const machine = map.all[0];

  assert.equal(map.freshness.status, "fresh");
  assert.equal(machine.verdict, "nodata");
  assert.equal(machine.recommendationStatus, "reference");
  assert.equal(machine.rot, null);
  assert.equal(machine.confidence, 0);
  assert.equal(machine.activityStatus, "invalid");
  assert.equal(machine.profitChanceStatus, "data-missing");
  assert.equal(machine.nailAlert, "データ除外");
  assert.equal(map.islandStats[0].activeMachines, 0);
  assert.equal(map.islandStats[0].invalidMachines, 1);
});

test("実戦観測は貸玉単位を250玉基準へ正規化し、投入玉数は物理玉で保持する", () => {
  const baseScan = scanOf([activeRow("101", "2026-07-09")], {
    id: "practice-base",
    date: "2026-07-09",
    createdAt: "2026-07-09T12:00:00.000Z",
  });
  const baseArgs = {
    scans: [baseScan],
    customMachines: [auditMachine],
    selectedStoreId: "audit-store",
    targetDate: "2026-07-10",
  };
  const withoutPractice = buildStrategyMap(baseArgs).all[0];
  const with250 = buildStrategyMap({
    ...baseArgs,
    archives: [{
      date: "2026-07-10",
      storeId: "audit-store",
      storeName: "監査店",
      machineName: auditMachine.name,
      num: "101",
      settings: { rentBalls: 250 },
      stats: { start1K: 20, cashKCount: 10 },
    }],
  }).all[0];
  const with280 = buildStrategyMap({
    ...baseArgs,
    archives: [{
      date: "2026-07-10",
      storeId: "audit-store",
      storeName: "監査店",
      machineName: auditMachine.name,
      num: "101",
      settings: { rentBalls: 280 },
      // 22.4回/1,000円 × 250/280 = 20回/250玉。
      // 8.92857K × 280玉 = 2,500玉。
      stats: { start1K: 22.4, cashKCount: 2500 / 280 },
    }],
  }).all[0];

  assert.ok(with250.evidenceSources.includes("archive"));
  assert.ok(with280.evidenceSources.includes("archive"));
  close(
    with250.rotationEstimate.inputBalls - withoutPractice.rotationEstimate.inputBalls,
    2500,
  );
  close(
    with280.rotationEstimate.inputBalls - withoutPractice.rotationEstimate.inputBalls,
    2500,
  );
  close(with250.rotationEstimate.mean, with280.rotationEstimate.mean, 0.1);
});

test("対象日より未来の実戦記録を予測へ混ぜない", () => {
  const baseScan = scanOf([activeRow("101", "2026-07-09")], {
    id: "future-defense-base",
    date: "2026-07-09",
    createdAt: "2026-07-09T12:00:00.000Z",
  });
  const common = {
    scans: [baseScan],
    customMachines: [auditMachine],
    selectedStoreId: "audit-store",
    targetDate: "2026-07-10",
  };
  const baseline = buildStrategyMap(common).all[0];
  const withFuture = buildStrategyMap({
    ...common,
    archives: [{
      date: "2026-07-11",
      storeId: "audit-store",
      storeName: "監査店",
      machineName: auditMachine.name,
      num: "101",
      settings: { rentBalls: 250 },
      stats: { start1K: 30, cashKCount: 20 },
    }],
    liveSession: {
      date: "2026-07-11",
      storeId: "audit-store",
      storeName: "監査店",
      machineName: auditMachine.name,
      machineNum: "101",
      settings: { rentBalls: 250 },
      stats: { start1K: 30, cashKCount: 20 },
    },
  }).all[0];

  assert.deepEqual(withFuture.evidenceSources, baseline.evidenceSources);
  close(withFuture.rotationEstimate.mean, baseline.rotationEstimate.mean);
  close(withFuture.rotationEstimate.inputBalls, baseline.rotationEstimate.inputBalls);
  assert.equal(withFuture.dataCoverage.toDate, "2026-07-09");
});

test("4円・2円・1円・0.5円の実測を同じ250玉基準で見切り判定する", () => {
  const rates = [
    { rentBalls: 250, observedRotation: 18 },
    { rentBalls: 500, observedRotation: 36 },
    { rentBalls: 1000, observedRotation: 72 },
    { rentBalls: 2000, observedRotation: 144 },
  ];
  for (const rate of rates) {
    const result = assessStrategyPredictionDivergence({
      isPlaying: true,
      actionable: true,
      liveDecision: { totalK: 3, observedRotation: rate.observedRotation },
      predictedLowPer250: 19,
      predictionConfidence: 0.2,
      rentBalls: rate.rentBalls,
    });
    assert.equal(result.status, "below-lower-bound");
    assert.equal(result.label, "見切り検討");
    assert.equal(result.actualPer250, 18);
    assert.equal(result.predictedLowPer250, 19);
    assert.equal(result.shortfall, 1);

    const equal = assessStrategyPredictionDivergence({
      isPlaying: true,
      actionable: true,
      liveDecision: {
        totalK: 3,
        observedRotation: 19 * rate.rentBalls / 250,
      },
      predictedLowPer250: 19,
      predictionConfidence: 0.2,
      rentBalls: rate.rentBalls,
    });
    assert.equal(equal.status, "within-range", "下限と同値なら見切り表示にしない");
  }
});

test("見切り判定は3K・信頼度20%・同一店舗機種台を満たし、ライブ値で比較線を動かさない", () => {
  const baseArgs = {
    scans: [scanOf([activeRow("101", "2026-07-10")])],
    customMachines: [auditMachine],
    selectedStoreId: "audit-store",
    targetDate: "2026-07-10",
    playingNum: "101",
  };
  const baseline = buildStrategyMap(baseArgs).all[0];
  const predictedLow = baseline.strategyBaseline.low;
  assert.ok(predictedLow > 1);

  const liveDecision = {
    action: "stop_candidate",
    totalK: 10,
    observedRotation: 1,
  };
  const live = buildStrategyMap({
    ...baseArgs,
    liveDecision,
    liveSession: {
      date: "2026-07-10",
      storeId: "audit-store",
      storeName: "監査店",
      machineName: auditMachine.name,
      machineNum: "101",
      ev: { start1K: 1, cashKCount: 10, netRot: 10 },
      settings: { rentBalls: 250 },
    },
  }).all[0];
  assert.equal(live.isPlaying, true);
  assert.equal(live.strategyDivergence.status, "below-lower-bound");
  assert.equal(live.strategyDivergence.predictedLowPer250, predictedLow);
  assert.equal(live.strategyBaseline.low, predictedLow);
  assert.notEqual(
    live.rotationEstimate.low,
    predictedLow,
    "表示中の融合予測は動いても、見切り比較線はライブ値を混ぜる前のままにする",
  );

  const wrongStore = buildStrategyMap({
    ...baseArgs,
    liveDecision,
    liveSession: {
      date: "2026-07-10",
      storeId: "another-store",
      machineName: auditMachine.name,
      machineNum: "101",
      ev: { start1K: 1, cashKCount: 10, netRot: 10 },
      settings: { rentBalls: 250 },
    },
  }).all[0];
  assert.equal(wrongStore.isPlaying, false);
  assert.equal(wrongStore.strategyDivergence.status, "insufficient-data");

  for (const mismatchedIdentity of [
    { storeId: "audit-store", machineName: "別機種", machineNum: "101" },
    { storeId: "audit-store", machineName: auditMachine.name, machineNum: "102" },
  ]) {
    const mismatch = buildStrategyMap({
      ...baseArgs,
      liveDecision,
      liveSession: {
        date: "2026-07-10",
        ...mismatchedIdentity,
        ev: { start1K: 1, cashKCount: 10, netRot: 10 },
        settings: { rentBalls: 250 },
      },
    }).all[0];
    assert.equal(mismatch.isPlaying, false);
    assert.equal(mismatch.strategyDivergence.status, "insufficient-data");
  }

  for (const partial of [
    { totalK: 2.99, predictionConfidence: 1 },
    { totalK: 3, predictionConfidence: 0.199 },
  ]) {
    const result = assessStrategyPredictionDivergence({
      isPlaying: true,
      actionable: true,
      liveDecision: { totalK: partial.totalK, observedRotation: 1 },
      predictedLowPer250: 19,
      predictionConfidence: partial.predictionConfidence,
      rentBalls: 250,
    });
    assert.equal(result.status, "insufficient-data");
  }
});
