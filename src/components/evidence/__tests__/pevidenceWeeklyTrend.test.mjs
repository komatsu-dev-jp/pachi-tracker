import assert from "node:assert/strict";
import {
  buildPEvidenceBacktest,
  buildWeeklyBacktestTrend,
} from "../pevidenceBacktest.js";

const calibrationHistory = [{
  id: "calibration-2026-07-01",
  effectiveFrom: "2026-07-01",
  previousPriorBalls: 50000,
  appliedPriorBalls: 62500,
}];

function pair(id, actualDate, {
  error,
  covered95,
  within1,
  history = [],
} = {}) {
  return {
    id,
    actualDate,
    error,
    absoluteError: Math.abs(error),
    squaredError: error ** 2,
    covered95,
    within1,
    machineName: "P週次テスト機",
    machineRecordName: "P週次テスト機 M1",
    calibrationHistory: history,
  };
}

const trend = buildWeeklyBacktestTrend([
  pair("a", "2026-06-29", {
    error: 2,
    covered95: true,
    within1: false,
    history: calibrationHistory,
  }),
  pair("b", "2026-07-05", {
    error: -1,
    covered95: false,
    within1: true,
    history: calibrationHistory,
  }),
  pair("c", "2026-07-06", {
    error: 0,
    covered95: true,
    within1: true,
  }),
]);

assert.equal(trend.length, 2);
assert.deepEqual(
  trend.map(({ weekStart, weekEnd, n }) => ({ weekStart, weekEnd, n })),
  [
    { weekStart: "2026-06-29", weekEnd: "2026-07-05", n: 2 },
    { weekStart: "2026-07-06", weekEnd: "2026-07-12", n: 1 },
  ],
  "週は月曜開始・日曜終了でまとめる",
);
assert.equal(trend[0].mae, 1.5);
assert.equal(trend[0].bias, 0.5, "bias は予測値 - 実測値");
assert.equal(trend[0].rmse, Math.sqrt(2.5));
assert.equal(trend[0].within1Rate, 0.5);
assert.equal(trend[0].coverage95, 0.5);
assert.deepEqual(trend[0].calibrationEvents, [{
  machineName: "P週次テスト機 M1",
  effectiveFrom: "2026-07-01",
  previousPriorBalls: 50000,
  appliedPriorBalls: 62500,
}], "同じ校正履歴を複数ペアが参照しても週内イベントは重複させない");
assert.deepEqual(trend[1].calibrationEvents, []);

assert.deepEqual(
  buildWeeklyBacktestTrend([
    pair("a", "2026-06-29", { error: 2, covered95: true, within1: false }),
    pair("b", "2026-07-06", { error: 1, covered95: true, within1: true }),
  ], { maxWeeks: 1 }).map((week) => week.weekStart),
  ["2026-07-06"],
  "表示上限では新しい週を残す",
);

function row(date, {
  predictedRotation = 20,
  predictedLow = 18,
  predictedHigh = 22,
  dailyRate = 20,
} = {}) {
  return {
    store: "store-a",
    machineName: "P週次テスト機",
    num: "101",
    date,
    valid: true,
    predictedRotation,
    predictedLow,
    predictedHigh,
    dailyRate,
    border: 18,
    machine: {
      name: "P週次テスト機 M1",
      modelName: "PTEST-WEEK",
      muraCoef: 50000,
      pevidenceCalibrationHistory: calibrationHistory,
    },
  };
}

const integrated = buildPEvidenceBacktest([
  row("2026-06-28", { predictedRotation: 21 }),
  row("2026-06-29", { dailyRate: 19, predictedRotation: 20 }),
  row("2026-06-30", { dailyRate: 20 }),
]);
assert.equal(integrated.weeklyTrend.length, 1);
assert.equal(integrated.weeklyTrend[0].weekStart, "2026-06-29");
assert.equal(integrated.weeklyTrend[0].n, 2);
assert.equal(integrated.weeklyTrend[0].mae, 1);
assert.equal(integrated.weeklyTrend[0].bias, 1);
assert.equal(integrated.weeklyTrend[0].coverage95, 1);
assert.equal(integrated.weeklyTrend[0].calibrationEvents.length, 1);

console.log("pevidenceWeeklyTrend.test.mjs: all tests passed");
