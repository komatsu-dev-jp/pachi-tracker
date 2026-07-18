import test from "node:test";
import assert from "node:assert/strict";
import { calcPreciseEV } from "../logic.js";
import { runEvidence } from "../evidence.js";
import {
  applyEconomicEV,
  calculateTrayCreditYen,
  heldBallCostPerK,
  normalizeArchiveEconomics,
} from "../economics.js";

const close = (actual, expected, tolerance = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`);
};

function makeRows(cashK, mochiK, chodamaK = 0) {
  const rows = [];
  let invest = 0;
  for (let i = 0; i < cashK; i += 1) {
    invest += 1000;
    rows.push({ type: "data", mode: "cash", thisRot: 20, invest });
  }
  for (let i = 0; i < mochiK; i += 1) {
    rows.push({ type: "data", mode: "mochi", thisRot: 20, invest, ballsConsumed: 250 });
  }
  for (let i = 0; i < chodamaK; i += 1) {
    rows.push({ type: "data", mode: "chodama", thisRot: 20, invest, ballsConsumed: 250 });
  }
  return rows;
}

function calculate(rows, exRate = 280, extra = {}) {
  const base = calcPreciseEV({
    rotRows: rows,
    startRot: 0,
    jpLog: extra.jpLog || [],
    rentBalls: 250,
    exRate,
    synthDenom: 319.7,
    rotPerHour: 220,
    totalTrayBalls: extra.totalTrayBalls || 0,
    border: 18,
    spec1R: 140,
    specAvgRounds: 32,
    specSapo: 0,
    chodamaSettings: { includeChodamaInBalance: extra.includeChodamaInBalance !== false },
  });
  return applyEconomicEV(base, {
    rotRows: rows,
    jpLog: extra.jpLog || [],
    totalTrayBalls: extra.totalTrayBalls || 0,
    rentBalls: 250,
    exRate,
    rotPerHour: 220,
  });
}

test("持ち玉1Kは250玉貸し・280玉交換なら約892.86円", () => {
  close(heldBallCostPerK(250, 280), 1000 * 250 / 280);
});

test("等価交換では現金と持ち玉のコスト・期待値が一致する", () => {
  const cash = calculate(makeRows(10, 0), 250);
  const mixed = calculate(makeRows(5, 5), 250);
  const held = calculate(makeRows(0, 10), 250);
  close(cash.economicCostYen, 10000);
  close(mixed.economicCostYen, 10000);
  close(held.economicCostYen, 10000);
  close(cash.economicWorkAmount, mixed.economicWorkAmount);
  close(cash.economicWorkAmount, held.economicWorkAmount);
});

test("非等価交換では持ち玉比率が上がるほど期待値が正しく改善する", () => {
  const cash = calculate(makeRows(10, 0));
  const mixed = calculate(makeRows(5, 5));
  const held = calculate(makeRows(0, 10));
  close(cash.economicCostYen, 10000);
  close(mixed.economicCostYen, 5000 + 5 * (1000 * 250 / 280));
  close(held.economicCostYen, 10 * (1000 * 250 / 280));
  close(mixed.economicWorkAmount - cash.economicWorkAmount, 5 * (1000 - 1000 * 250 / 280));
  close(held.economicWorkAmount - cash.economicWorkAmount, 10 * (1000 - 1000 * 250 / 280));
  assert.ok(held.economicWorkAmount > mixed.economicWorkAmount);
  assert.ok(mixed.economicWorkAmount > cash.economicWorkAmount);
});

test("貯玉は収支設定にかかわらず判断用EVで交換価値をコスト計上する", () => {
  const rows = makeRows(5, 0, 5);
  const included = calculate(rows, 280, { includeChodamaInBalance: true });
  const excluded = calculate(rows, 280, { includeChodamaInBalance: false });
  close(included.chodamaCostYen, 5 * (1000 * 250 / 280));
  close(excluded.chodamaCostYen, included.chodamaCostYen);
  close(excluded.economicWorkAmount, included.economicWorkAmount);
});

test("上皿は現金なら貸玉単価、持ち玉なら交換単価で差し引く", () => {
  const cash = calculateTrayCreditYen({
    rotRows: [{ type: "hit", chainId: 1, mode: "cash" }],
    jpLog: [{ chainId: 1, trayBalls: 100 }],
    rentBalls: 250,
    exRate: 280,
  });
  const held = calculateTrayCreditYen({
    rotRows: [{ type: "hit", chainId: 2, mode: "mochi" }],
    jpLog: [{ chainId: 2, trayBalls: 100 }],
    rentBalls: 250,
    exRate: 280,
  });
  close(cash.trayCreditYen, 400);
  close(held.trayCreditYen, 100 * 1000 / 280);
  assert.ok(cash.trayCreditYen > held.trayCreditYen);
});

test("モード不明の古い上皿記録は過大評価を避けて交換単価を使う", () => {
  const result = calculateTrayCreditYen({
    jpLog: [{ trayBalls: 100 }],
    rentBalls: 250,
    exRate: 280,
  });
  close(result.trayCreditYen, 100 * 1000 / 280);
});

test("過去記録を再計算し、貯玉円換算も正しい向きへ修正する", () => {
  const rows = makeRows(5, 0, 5);
  const oldStats = calcPreciseEV({
    rotRows: rows,
    startRot: 0,
    jpLog: [],
    rentBalls: 250,
    exRate: 280,
    synthDenom: 319.7,
    rotPerHour: 220,
    totalTrayBalls: 0,
    border: 18,
    spec1R: 140,
    specAvgRounds: 32,
    specSapo: 0,
    chodamaSettings: { includeChodamaInBalance: true },
  });
  const archive = {
    rotRows: rows,
    jpLog: [],
    totalTrayBalls: 0,
    settings: { rentBalls: 250, exRate: 280, rotPerHour: 220 },
    stats: oldStats,
    chodamaYen: 5600,
  };
  const normalized = normalizeArchiveEconomics(archive);
  close(normalized.stats.economicCostYen, 5000 + 5 * (1000 * 250 / 280));
  assert.equal(normalized.chodamaYen, Math.round(1250 * 1000 / 280));
  assert.strictEqual(normalizeArchiveEconomics(normalized), normalized);
});

test("スロット記録はパチンコ用の経済計算で加工しない", () => {
  const archive = {
    gameType: "slot",
    investYen: 20000,
    recoveryYen: 35000,
    settings: { rentBalls: 250, exRate: 280, rotPerHour: 220 },
    stats: { workAmount: 1234 },
    rotRows: [{ type: "data", mode: "cash", invest: 1000 }],
  };
  assert.strictEqual(normalizeArchiveEconomics(archive), archive);
  assert.strictEqual(archive.stats.calculationVersion, undefined);
  assert.strictEqual(archive.chodamaYen, undefined);
});

test("端数の持ち玉消費をK比率へ正確に反映する", () => {
  const rows = [{ type: "data", mode: "mochi", thisRot: 10, invest: 0, ballsConsumed: 140 }];
  const result = calculate(rows, 280);
  close(result.mochiKCount, 140 / 250);
  close(result.economicCostYen, 140 * 1000 / 280);
});

test("台性能の推定は持ち玉補正後ではなく物理回転率を使う", () => {
  const evidence = runEvidence({
    start1K: 18,
    effectiveStart1K: 21,
    theoreticalBorder: 17,
    cashKCount: 0,
    mochiKCount: 10,
    chodamaKCount: 0,
  }, { priorBalls: 0 });
  close(evidence.observedRotation, 18);
  close(evidence.predictedRotation, 18);
});
