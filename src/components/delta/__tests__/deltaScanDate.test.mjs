import assert from "node:assert/strict";
import {
  deleteDeltaScans,
  findDeltaScanDateTargets,
  updateDeltaScanDate,
} from "../deltaScanDate.js";

const scans = [
  {
    id: "scan-a",
    storeId: "store-1",
    storeName: "テスト店",
    date: "2026-07-27",
    machineName: "Pテスト",
    rows: [
      { num: "101", island: "A島", date: "2026-07-27", val: 1000 },
      { num: "102", island: "A島", val: 2000 },
    ],
    createdAt: "2026-07-27T12:00:00.000Z",
  },
  {
    id: "scan-b",
    storeId: "store-1",
    date: "2026-07-27",
    machineName: "P別機種",
    rows: [{ num: "201", island: "B島", date: "2026-07-26", val: 3000 }],
  },
  {
    id: "scan-c",
    storeId: "store-2",
    date: "2026-07-27",
    machineName: "Pテスト",
    rows: [{ num: "301", island: "A島", val: 4000 }],
  },
];

const targets = findDeltaScanDateTargets(scans, {
  date: "2026-07-27",
  storeKey: "store-1",
  island: "A島",
});
assert.deepEqual(targets.map((scan) => scan.id), ["scan-a"]);

const fallbackIslandTargets = findDeltaScanDateTargets([
  {
    id: "fallback",
    storeName: "名称だけの店",
    date: "2026-07-27",
    machineName: "Pフォールバック",
    rows: [{ num: "1" }],
  },
], {
  date: "2026-07-27",
  storeKey: "名称だけの店",
  island: "Pフォールバック島",
});
assert.deepEqual(fallbackIslandTargets.map((scan) => scan.id), ["fallback"]);

const changedAt = "2026-07-28T01:02:03.000Z";
const updated = updateDeltaScanDate(scans, {
  scanIds: targets.map((scan) => scan.id),
  fromDate: "2026-07-27",
  toDate: "2026-07-26",
  changedAt,
});
assert.equal(updated.ok, true);
assert.equal(updated.updatedCount, 1);
assert.equal(updated.scans[0].date, "2026-07-26");
assert.equal(updated.scans[0].rows[0].date, "2026-07-26", "同じ旧日付を持つ行も変更する");
assert.equal(updated.scans[0].rows[1].date, undefined, "日付未設定の行はスキャン日を引き継ぐため変更しない");
assert.equal(updated.scans[1], scans[1], "対象外スキャンは同じ参照のまま残す");
assert.deepEqual(updated.scans[0].dateCorrections, [{
  from: "2026-07-27",
  to: "2026-07-26",
  changedAt,
}]);

const preserveMismatchedRow = updateDeltaScanDate(scans, {
  scanIds: ["scan-b"],
  fromDate: "2026-07-27",
  toDate: "2026-07-26",
  changedAt,
});
assert.equal(
  preserveMismatchedRow.scans[1].rows[0].date,
  "2026-07-26",
  "変更先と一致している読取日付はそのまま保持する",
);

assert.deepEqual(
  updateDeltaScanDate(scans, {
    scanIds: ["scan-a"],
    fromDate: "2026-07-27",
    toDate: "2026-07-27",
  }),
  { ok: false, reason: "same-date", scans, updatedCount: 0 },
);
assert.equal(updateDeltaScanDate(scans, {
  scanIds: ["scan-a"],
  fromDate: "2026-07-27",
  toDate: "2026-02-30",
}).reason, "invalid-date");
assert.equal(updateDeltaScanDate(scans, {
  scanIds: ["missing"],
  fromDate: "2026-07-27",
  toDate: "2026-07-26",
}).reason, "no-target");

const deleted = deleteDeltaScans(scans, {
  scanIds: ["scan-a"],
  fromDate: "2026-07-27",
});
assert.equal(deleted.ok, true);
assert.equal(deleted.deletedCount, 1);
assert.equal(deleted.deletedRowCount, 2);
assert.deepEqual(deleted.scans.map((scan) => scan.id), ["scan-b", "scan-c"]);
assert.equal(deleted.scans[0], scans[1], "削除対象外のデータは変更しない");

const staleDelete = deleteDeltaScans(scans, {
  scanIds: ["scan-a"],
  fromDate: "2026-07-26",
});
assert.deepEqual(staleDelete, {
  ok: false,
  reason: "no-target",
  scans,
  deletedCount: 0,
  deletedRowCount: 0,
});
assert.equal(deleteDeltaScans(scans, {
  scanIds: ["scan-a"],
  fromDate: "2026-02-30",
}).reason, "invalid-date");
assert.equal(deleteDeltaScans(scans, {
  scanIds: [],
  fromDate: "2026-07-27",
}).reason, "no-target");

console.log("deltaScanDate.test.mjs: all tests passed");
