import test from "node:test";
import assert from "node:assert/strict";
import { buildStoreAnalytics, resolveStoreDetail } from "../storeDetailSelectors.js";

const store = { id: "store-1", name: "テストホール", rentBalls: 250, exRate: 280, chodama: 1000 };

test("店舗記録が無い場合は架空値を返さない", () => {
  const result = buildStoreAnalytics([], store);
  assert.equal(result.analysisScore, 0);
  assert.equal(result.dataSufficiency.validRecords, 0);
  assert.equal(result.judgmentLog.good, 0);
  assert.deepEqual(result.trends, []);
});

test("店舗別の記録・時間帯・機種・判断を実データから集計する", () => {
  const result = buildStoreAnalytics([
    {
      storeId: "store-1",
      date: "2026-07-14",
      time: "10:00",
      machineName: "機種A",
      decisionSnapshots: [{ action: "continue" }, { action: "stop" }],
    },
    { storeName: "テストホール", date: "2026-07-15", time: "18:30", machineName: "機種B" },
    { storeId: "other", date: "2026-07-15", time: "13:00", machineName: "対象外" },
  ], store);

  assert.equal(result.dataSufficiency.validRecords, 2);
  assert.equal(result.dataSufficiency.knownMachines, 2);
  assert.equal(result.dataSufficiency.dayOfWeekCovered, 2);
  assert.equal(result.dataSufficiency.timeSlotCovered, 2);
  assert.equal(result.judgmentLog.good, 1);
  assert.equal(result.judgmentLog.review, 1);
  assert.equal(result.judgmentLog.withdrawal, 1);
  assert.equal(result.lastUpdatedLabel, "7月15日");
  assert.equal(result.trends.length, 3);
  assert.deepEqual(result.analyticsDetail.machines.map((item) => item.name), ["機種B", "機種A"]);
  assert.equal(result.analyticsDetail.judgments.good[0].machineName, "機種A");
  assert.equal(result.analyticsDetail.judgments.withdrawal[0].date, "2026-07-14");
});

test("店舗ID未指定でも登録済み店舗を優先し、空のサンプル店舗を表示しない", () => {
  const result = resolveStoreDetail([store], null, { archives: [] });
  assert.equal(result.id, "store-1");
  assert.equal(result.name, "テストホール");
  assert.equal(result.isRealStore, true);
  assert.equal(result.analysisScore, 0);
});

test("信頼度は記録件数の境界値で未記録・低・中・高に変わる", () => {
  const makeRecords = (count) => Array.from({ length: count }, (_, index) => ({
    id: `record-${index}`,
    storeId: store.id,
    date: `2026-07-${String((index % 20) + 1).padStart(2, "0")}`,
    time: "10:00",
  }));

  assert.equal(buildStoreAnalytics(makeRecords(0), store).dataReliability, "未記録");
  assert.equal(buildStoreAnalytics(makeRecords(1), store).dataReliability, "低");
  assert.equal(buildStoreAnalytics(makeRecords(2), store).dataReliability, "低");
  assert.equal(buildStoreAnalytics(makeRecords(3), store).dataReliability, "中");
  assert.equal(buildStoreAnalytics(makeRecords(9), store).dataReliability, "中");
  assert.equal(buildStoreAnalytics(makeRecords(10), store).dataReliability, "高");
});

test("直近5件を日付順に並べ、投資・回収・貯玉価値から収支を計算する", () => {
  const archives = Array.from({ length: 6 }, (_, index) => ({
    id: `record-${index}`,
    storeId: store.id,
    date: `2026-07-${String(index + 10).padStart(2, "0")}`,
    time: index % 2 ? "18:30" : "10:00",
    machineName: `機種${index}`,
    investYen: 10000 + index * 100,
    recoveryYen: 15000 + index * 200,
    chodamaYen: 500,
    stats: { effectiveWorkAmount: 1200 + index },
  }));
  const result = buildStoreAnalytics(archives, store);

  assert.equal(result.analyticsDetail.recentRecords.length, 5);
  assert.equal(result.analyticsDetail.recentRecords[0].date, "2026-07-15");
  assert.equal(result.analyticsDetail.recentRecords.at(-1).date, "2026-07-11");
  assert.equal(result.analyticsDetail.recentRecords[0].actualProfitYen, 5000);
  assert.equal(result.analyticsDetail.recentRecords[0].expectedValueYen, 1205);
});

test("貯玉履歴は店舗別に絞り込み、最新順と円換算を返す", () => {
  const result = resolveStoreDetail([store], store.id, {
    archives: [],
    chodamaLog: [
      { id: "older", storeId: store.id, date: "2026-07-10", type: "deposit", balls: 200, balanceBefore: 800, balanceAfter: 1000 },
      { id: "latest", storeName: store.name, date: "2026-07-12", type: "withdraw", balls: 100, balanceBefore: 1000, balanceAfter: 900 },
      { id: "other", storeId: "other", date: "2026-07-15", type: "deposit", balls: 9999 },
    ],
  });

  assert.deepEqual(result.chodama.balanceHistory.map((item) => item.id), ["latest", "older"]);
  assert.equal(result.chodama.storeBallsYen, 3571);
  assert.equal(result.exchangeInfo.ballUnitYen, 100 / 28);
});
