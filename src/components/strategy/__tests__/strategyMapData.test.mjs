import assert from "node:assert/strict";
import { buildStrategyMap } from "../strategyMapData.js";

const machine = {
  name: "検証機",
  border1K: 17,
  avgPayoutPerHit: 1400,
  stdDev: 6000,
};
const scans = [
  {
    id: "d1", storeId: "s1", storeName: "検証店", date: "2026-07-01", createdAt: "2026-07-01T12:00:00Z",
    rows: [{ num: "101", machineName: "検証機", island: "1島", normalSpins: 800, totalStarts: 10, val: 2000 }],
  },
  {
    id: "d2", storeId: "s1", storeName: "検証店", date: "2026-07-02", createdAt: "2026-07-02T12:00:00Z",
    rows: [{ num: "101", machineName: "検証機", island: "1島", normalSpins: 900, totalStarts: 12, val: 1000 }],
  },
];

const empty = buildStrategyMap();
assert.equal(empty.total, 0);
assert.equal(empty.top5.length, 0);

const liveDecision = { action: "collecting", actionLabel: "次の判定まで計測", nextCheckpointK: 3 };
const map = buildStrategyMap({ scans, customMachines: [machine], playingNum: 101, liveDecision });
assert.equal(map.source, "delta");
assert.equal(map.total, 1);
assert.equal(map.all[0].num, 101);
assert.equal(map.all[0].isPlaying, true);
assert.equal(map.all[0].liveDecision, liveDecision);
assert.equal(map.all[0].evidence.observationCount, 2);
assert.ok(map.all[0].rot > 0);
assert.ok(map.all[0].confidence >= 0 && map.all[0].confidence <= 100);
assert.equal(map.all[0].history.length, 2);

// 別店舗のスキャンが混ざっていても、解析・推奨は表示中の店舗に限定される
const multiStoreScans = [
  ...scans,
  {
    id: "d3", storeId: "s2", storeName: "別店", date: "2026-06-30", createdAt: "2026-06-30T12:00:00Z",
    rows: [{ num: "101", machineName: "検証機", island: "1島", normalSpins: 900, totalStarts: 12, val: 5000 }],
  },
];
const multiStoreMap = buildStrategyMap({ scans: multiStoreScans, customMachines: [machine] });
assert.equal(multiStoreMap.total, 1, "表示は最新スキャンの店舗のみ");
assert.ok(
  multiStoreMap.analytics.latestRows.every((row) => row.store === "s1"),
  "解析対象に他店舗の台を含めない"
);
assert.ok(
  multiStoreMap.portfolio.plan.every((item) => String(item.number) === "101"),
  "ポートフォリオに他店舗の台を含めない"
);
assert.equal(
  multiStoreMap.all[0].history.length, 2,
  "スパークラインの履歴に他店舗の同番号データを混ぜない"
);

const hallMaps = {
  s1: [
    { id: "layout-b", name: "B島", start: 201, end: 206, machineName: "検証機" },
    { id: "layout-a", name: "1島", start: 101, end: 106, machineName: "検証機" },
  ],
};
const mappedLayout = buildStrategyMap({ scans, customMachines: [machine], hallMaps });
assert.equal(mappedLayout.islands.length, 2);
assert.equal(mappedLayout.islands[0].name, "B島");
assert.equal(mappedLayout.islands[0].start, 201);
assert.equal(mappedLayout.islands[0].end, 206);
assert.equal(mappedLayout.islands[0].machines.length, 0);
assert.equal(mappedLayout.islands[1].name, "1島");
assert.equal(mappedLayout.islands[1].machines[0].num, 101);
assert.equal(mappedLayout.islands[1].registeredLayout, true);

console.log("strategyMapData.test.mjs: all tests passed");
