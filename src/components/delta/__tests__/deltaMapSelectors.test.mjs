// src/components/delta/__tests__/deltaMapSelectors.test.mjs
// 実行: node --test src/components/delta/__tests__/deltaMapSelectors.test.mjs
//
// 「マップで見る」用セレクタの境界値テスト。

import { test } from "node:test";
import assert from "node:assert";
import {
  listScanDates,
  buildScanIndex,
  buildIslandOverlay,
  coverageOf,
} from "../deltaMapSelectors.js";

// テスト用スキャン生成ヘルパ。
function scan({ id, storeId, date, rows = [], createdAt }) {
  return { id, storeId, storeName: "店A", date, machineName: "", rows, createdAt };
}
function row(num, val) {
  return { num: String(num), val, px: 100, rank: "C" };
}

// ──────────── listScanDates ────────────

test("listScanDates: 日付を降順ユニークで返す", () => {
  const scans = [
    scan({ id: "1", storeId: 7, date: "2026-06-01", createdAt: "a" }),
    scan({ id: "2", storeId: 7, date: "2026-06-10", createdAt: "b" }),
    scan({ id: "3", storeId: 7, date: "2026-06-01", createdAt: "c" }),
  ];
  assert.deepStrictEqual(listScanDates(scans, 7), ["2026-06-10", "2026-06-01"]);
});

test("listScanDates: 店舗フィルタ（storeId 文字列化照合）", () => {
  const scans = [
    scan({ id: "1", storeId: "7", date: "2026-06-01", createdAt: "a" }),
    scan({ id: "2", storeId: 9, date: "2026-06-02", createdAt: "b" }),
  ];
  assert.deepStrictEqual(listScanDates(scans, 7), ["2026-06-01"]);
  assert.deepStrictEqual(listScanDates(scans, "9"), ["2026-06-02"]);
});

test("listScanDates: storeId が null のスキャンは拾わない", () => {
  const scans = [
    scan({ id: "1", storeId: null, date: "2026-06-01", createdAt: "a" }),
  ];
  assert.deepStrictEqual(listScanDates(scans, 7), []);
});

test("listScanDates: 空入力・非配列は空配列", () => {
  assert.deepStrictEqual(listScanDates([], 7), []);
  assert.deepStrictEqual(listScanDates(null, 7), []);
});

// ──────────── buildScanIndex ────────────

test("buildScanIndex: 日付フィルタで該当行のみ統合", () => {
  const scans = [
    scan({ id: "1", storeId: 7, date: "2026-06-01", rows: [row(816, 1000)], createdAt: "a" }),
    scan({ id: "2", storeId: 7, date: "2026-06-02", rows: [row(817, 2000)], createdAt: "b" }),
  ];
  const idx = buildScanIndex(scans, 7, "2026-06-01");
  assert.strictEqual(idx.size, 1);
  assert.strictEqual(idx.get("816").val, 1000);
  assert.strictEqual(idx.get("817"), undefined);
});

test("buildScanIndex: 同一台番号は createdAt が新しい方を優先", () => {
  const scans = [
    scan({ id: "1", storeId: 7, date: "2026-06-01", rows: [row(816, 1000)], createdAt: "2026-06-01T09:00:00.000Z" }),
    scan({ id: "2", storeId: 7, date: "2026-06-01", rows: [row(816, 5000)], createdAt: "2026-06-01T12:00:00.000Z" }),
  ];
  const idx = buildScanIndex(scans, 7, "2026-06-01");
  assert.strictEqual(idx.get("816").val, 5000);
});

test("buildScanIndex: 古い createdAt は新しい採用済みを上書きしない", () => {
  const scans = [
    scan({ id: "2", storeId: 7, date: "2026-06-01", rows: [row(816, 5000)], createdAt: "2026-06-01T12:00:00.000Z" }),
    scan({ id: "1", storeId: 7, date: "2026-06-01", rows: [row(816, 1000)], createdAt: "2026-06-01T09:00:00.000Z" }),
  ];
  const idx = buildScanIndex(scans, 7, "2026-06-01");
  assert.strictEqual(idx.get("816").val, 5000);
});

test("buildScanIndex: num の文字列照合（数値 num も拾う）", () => {
  const scans = [
    scan({ id: "1", storeId: 7, date: "2026-06-01", rows: [{ num: 816, val: 1000, rank: "C" }], createdAt: "a" }),
  ];
  const idx = buildScanIndex(scans, 7, "2026-06-01");
  assert.ok(idx.has("816"));
});

// ──────────── buildIslandOverlay ────────────

test("buildIslandOverlay: 範囲走査・short 下2桁・データなし null", () => {
  const idx = new Map([["817", row(817, 3000)]]);
  const cells = buildIslandOverlay({ start: 816, end: 818 }, idx);
  assert.strictEqual(cells.length, 3);
  assert.deepStrictEqual(cells.map((c) => c.num), ["816", "817", "818"]);
  assert.deepStrictEqual(cells.map((c) => c.short), ["16", "17", "18"]);
  assert.strictEqual(cells[0].row, null);
  assert.strictEqual(cells[1].row.val, 3000);
  assert.strictEqual(cells[2].row, null);
});

test("buildIslandOverlay: 3桁未満の台番号は short そのまま", () => {
  const cells = buildIslandOverlay({ start: 1, end: 3 }, new Map());
  assert.deepStrictEqual(cells.map((c) => c.short), ["1", "2", "3"]);
});

test("buildIslandOverlay: start>end は昇順に正規化", () => {
  const cells = buildIslandOverlay({ start: 5, end: 3 }, new Map());
  assert.deepStrictEqual(cells.map((c) => c.num), ["3", "4", "5"]);
});

test("buildIslandOverlay: 無効な島は空配列", () => {
  assert.deepStrictEqual(buildIslandOverlay({}, new Map()), []);
  assert.deepStrictEqual(buildIslandOverlay(null, new Map()), []);
});

// ──────────── coverageOf ────────────

test("coverageOf: 全島の hit と total を集計", () => {
  const idx = new Map([["816", row(816, 1)], ["819", row(819, 1)]]);
  const islands = [
    { id: "a", start: 816, end: 817 }, // 816 hit, 817 miss
    { id: "b", start: 818, end: 819 }, // 818 miss, 819 hit
  ];
  assert.deepStrictEqual(coverageOf(islands, idx), { hit: 2, total: 4 });
});

test("coverageOf: 空島・非配列は { hit:0, total:0 }", () => {
  assert.deepStrictEqual(coverageOf([], new Map()), { hit: 0, total: 0 });
  assert.deepStrictEqual(coverageOf(null, new Map()), { hit: 0, total: 0 });
});
