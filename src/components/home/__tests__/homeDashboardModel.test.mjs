import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDeltaStatus,
  buildMonthOverview,
  getNextAction,
  latestArchive,
} from "../homeDashboardModel.js";

test("月間期待値・目標残額・進捗率を集計する", () => {
  const archives = [
    { date: "2026-07-02", investYen: 10000, recoveryYen: 7000, stats: { workAmount: 2500 } },
    { date: "2026-07-05", investYen: 10000, recoveryYen: 18000, stats: { effectiveWorkAmount: 3500 } },
    { date: "2026-06-30", investYen: 1000, recoveryYen: 9000, stats: { workAmount: 9000 } },
  ];
  const result = buildMonthOverview(archives, 10000, new Date(2026, 6, 10, 12));

  assert.equal(result.expected, 6000);
  assert.equal(result.actual, 5000);
  assert.equal(result.variance, -1000);
  assert.equal(result.remaining, 4000);
  assert.equal(result.progress, 60);
  assert.equal(result.activeDays, 2);
  assert.equal(result.winSessionRate, 50);
  assert.equal(result.chartData[4].cumulativeEv, 6000);
  assert.equal(result.chartData[9].cumulativeEv, 6000);
  assert.equal(result.chartData[10].cumulativeEv, null);
});

test("目標超過では達成済みになり、残額は0円になる", () => {
  const result = buildMonthOverview(
    [{ date: "2026-07-01", stats: { workAmount: 12000 } }],
    10000,
    new Date(2026, 6, 2)
  );
  assert.equal(result.achieved, true);
  assert.equal(result.progress, 120);
  assert.equal(result.remaining, 0);
});

test("保存順ではなく日時が新しい実戦記録を返す", () => {
  const result = latestArchive([
    { id: "newer", date: "2026-07-12", time: "09:00" },
    { id: "older", date: "2026-07-10", time: "18:00" },
    { id: "newest", date: "2026-07-12", time: "21:00" },
  ]);
  assert.equal(result.id, "newest");
});

test("差玉解析台数は選択店舗内で同じ台を二重計上しない", () => {
  const scans = [
    { storeId: 1, date: "2026-07-17", createdAt: "2026-07-17T09:00:00+09:00", rows: [{ num: 101 }, { num: 102 }] },
    { storeId: 1, date: "2026-07-17", createdAt: "2026-07-17T10:00:00+09:00", rows: [{ num: 101 }, { num: 103 }] },
    { storeId: 2, date: "2026-07-17", createdAt: "2026-07-17T11:00:00+09:00", rows: [{ num: 201 }] },
  ];
  const result = buildDeltaStatus(scans, { id: 1, name: "A店" }, "2026-07-17");
  assert.equal(result.machineCount, 3);
  assert.equal(result.hasTodayScan, true);
  assert.equal(result.scopeLabel, "A店");
});

test("次の行動は実戦中を最優先する", () => {
  const action = getNextAction({
    sessionStarted: true,
    stores: [{ id: 1, name: "A店" }],
    selectedStore: { id: 1, name: "A店" },
    hasTodayRecord: true,
    hasTodayScan: true,
  });
  assert.equal(action.kind, "record");
});

test("実戦前は差玉解析の有無で解析と台選びを切り替える", () => {
  const common = {
    sessionStarted: false,
    stores: [{ id: 1, name: "A店" }],
    selectedStore: { id: 1, name: "A店" },
    hasTodayRecord: false,
  };
  assert.equal(getNextAction({ ...common, hasTodayScan: false }).kind, "delta");
  assert.equal(getNextAction({ ...common, hasTodayScan: true }).kind, "strategy");
});

test("当日の実戦終了後は分析を案内する", () => {
  const action = getNextAction({
    sessionStarted: false,
    stores: [{ id: 1, name: "A店" }],
    selectedStore: { id: 1, name: "A店" },
    hasTodayRecord: true,
    hasTodayScan: false,
  });
  assert.equal(action.kind, "analysis");
});

test("遊タイム期待値を月間累計期待値へ加算する", () => {
  const result = buildMonthOverview([{
    date: "2026-07-05",
    stats: { workAmount: 1500 },
    yutimeDecision: { result: { valid: true, selectedEV: 2500 } },
  }], 10000, new Date(2026, 6, 10, 12));

  assert.equal(result.expected, 4000);
  assert.equal(result.remaining, 6000);
  assert.equal(result.progress, 40);
  assert.equal(result.chartData[4].cumulativeEv, 4000);
});
