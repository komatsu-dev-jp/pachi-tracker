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
});

test("店舗ID未指定でも登録済み店舗を優先し、空のサンプル店舗を表示しない", () => {
  const result = resolveStoreDetail([store], null, { archives: [] });
  assert.equal(result.id, "store-1");
  assert.equal(result.name, "テストホール");
  assert.equal(result.isRealStore, true);
  assert.equal(result.analysisScore, 0);
});
