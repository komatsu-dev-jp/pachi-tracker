// src/components/analysis/__tests__/analyzerSelectors.test.mjs
// 実行: node --test src/components/analysis/__tests__/analyzerSelectors.test.mjs
//   （または node src/components/analysis/__tests__/analyzerSelectors.test.mjs でも可）
//
// パチ analyzer（詳細分析）用集計セレクタの境界値テスト。
// - 空配列・1件・旧アーカイブ形式（effective* 欠落）で破綻しないこと
// - 回転率/ボーダー差のフォールバック順が既存表示ロジックと一致すること
// - ヒストグラムのビン集計・データ不足判定
// - 店舗別/曜日別の集計値（EV フォールバック・実損益）

import { test } from "node:test";
import assert from "node:assert";
import {
  getSpinRate,
  getBorderDiff,
  buildSpinRateTrend,
  buildBorderDiffHistogram,
  aggregateByStore,
  aggregateByWeekday,
  HISTOGRAM_MIN_SAMPLE,
} from "../analyzerSelectors.js";

// テスト用アーカイブ生成ヘルパー
function arc(over = {}) {
  return {
    id: 1,
    date: "2026-05-12",
    time: "10:00",
    storeName: "店A",
    machineName: "機種X",
    investYen: 0,
    recoveryYen: 0,
    stats: {},
    ...over,
  };
}

// ──────────── getSpinRate / getBorderDiff フォールバック ────────────

test("getSpinRate: effective を最優先", () => {
  assert.strictEqual(
    getSpinRate(arc({ stats: { effectiveStart1K: 20, start1KCorrected: 19, start1K: 18 } })),
    20
  );
});
test("getSpinRate: 旧アーカイブ（start1K のみ）", () => {
  assert.strictEqual(getSpinRate(arc({ stats: { start1K: 18 } })), 18);
});
test("getSpinRate: 数値が無ければ null", () => {
  assert.strictEqual(getSpinRate(arc({ stats: {} })), null);
  assert.strictEqual(getSpinRate(arc({ stats: { start1K: null } })), null);
  assert.strictEqual(getSpinRate(arc({ stats: { start1K: Infinity } })), null);
  assert.strictEqual(getSpinRate(undefined), null);
});
test("getBorderDiff: フォールバック順と null 扱い", () => {
  assert.strictEqual(getBorderDiff(arc({ stats: { effectiveBDiff: -2, bDiff: 1 } })), -2);
  assert.strictEqual(getBorderDiff(arc({ stats: { bDiff: 1.5 } })), 1.5);
  assert.strictEqual(getBorderDiff(arc({ stats: {} })), null);
});

// ──────────── buildSpinRateTrend ────────────

test("trend: machineName 未指定なら空配列", () => {
  assert.deepStrictEqual(buildSpinRateTrend([arc()], ""), []);
});
test("trend: 空配列で破綻しない", () => {
  assert.deepStrictEqual(buildSpinRateTrend([], "機種X"), []);
});
test("trend: 1件（時系列1点）", () => {
  const pts = buildSpinRateTrend([arc({ stats: { start1K: 18.5 } })], "機種X");
  assert.strictEqual(pts.length, 1);
  assert.strictEqual(pts[0].value, 18.5);
  assert.strictEqual(pts[0].label, "5/12");
});
test("trend: 時系列ソート（日付→時刻→id）と回転率未記録の除外", () => {
  const archives = [
    arc({ id: 3, date: "2026-05-13", time: "09:00", stats: { start1K: 21 } }),
    arc({ id: 1, date: "2026-05-12", time: "10:00", stats: { start1K: 18 } }),
    arc({ id: 2, date: "2026-05-12", time: "14:00", stats: { start1K: 19 } }),
    arc({ id: 4, date: "2026-05-14", time: "09:00", stats: {} }), // 回転率なし→除外
    arc({ id: 5, date: "2026-05-15", machineName: "機種Y", stats: { start1K: 99 } }), // 別機種→除外
  ];
  const pts = buildSpinRateTrend(archives, "機種X");
  assert.deepStrictEqual(pts.map((p) => p.value), [18, 19, 21]);
});
test("trend: 旧アーカイブ（time 欠落）は id でソート", () => {
  const archives = [
    arc({ id: 200, date: "2026-05-12", time: undefined, stats: { start1K: 20 } }),
    arc({ id: 100, date: "2026-05-12", time: undefined, stats: { start1K: 17 } }),
  ];
  const pts = buildSpinRateTrend(archives, "機種X");
  assert.deepStrictEqual(pts.map((p) => p.value), [17, 20]);
});

// ──────────── buildBorderDiffHistogram ────────────

test("histogram: 空配列はデータ不足", () => {
  const h = buildBorderDiffHistogram([]);
  assert.strictEqual(h.total, 0);
  assert.strictEqual(h.enough, false);
  assert.deepStrictEqual(h.bins, []);
  assert.strictEqual(h.avg, null);
  assert.strictEqual(h.plusRate, null);
});
test("histogram: 1件はデータ不足（閾値未満）", () => {
  const h = buildBorderDiffHistogram([arc({ stats: { bDiff: 2 } })]);
  assert.strictEqual(h.total, 1);
  assert.strictEqual(h.enough, false);
  assert.ok(h.total < HISTOGRAM_MIN_SAMPLE);
});
test("histogram: 閾値件数でデータ充足", () => {
  const archives = [
    arc({ stats: { bDiff: -1.5 } }),
    arc({ stats: { bDiff: 0.5 } }),
    arc({ stats: { bDiff: 2.5 } }),
  ];
  const h = buildBorderDiffHistogram(archives, { binSize: 1 });
  assert.strictEqual(h.total, 3);
  assert.strictEqual(h.enough, true);
  assert.strictEqual(h.min, -1.5);
  assert.strictEqual(h.max, 2.5);
  // avg = (-1.5 + 0.5 + 2.5) / 3
  assert.ok(Math.abs(h.avg - 0.5) < 1e-9);
  // x>=0 は 2件 → 66.67%
  assert.ok(Math.abs(h.plusRate - (2 / 3) * 100) < 1e-9);
  // ビンの count 合計はサンプル数と一致
  assert.strictEqual(h.bins.reduce((s, b) => s + b.count, 0), 3);
});
test("histogram: ボーダー差未記録は除外", () => {
  const archives = [
    arc({ stats: { bDiff: 1 } }),
    arc({ stats: {} }), // 除外
    arc({ stats: { bDiff: -1 } }),
  ];
  const h = buildBorderDiffHistogram(archives);
  assert.strictEqual(h.total, 2);
});

// ──────────── aggregateByStore ────────────

test("store: 空配列で空配列", () => {
  assert.deepStrictEqual(aggregateByStore([]), []);
});
test("store: EV フォールバック（effectiveWorkAmount ?? workAmount）と実損益集計", () => {
  const archives = [
    arc({ storeName: "店A", investYen: 1000, recoveryYen: 3000, stats: { effectiveWorkAmount: 500, workAmount: 400 } }),
    arc({ storeName: "店A", investYen: 0, recoveryYen: 0, stats: { workAmount: 200 } }), // 旧形式
    arc({ storeName: "店B", investYen: 5000, recoveryYen: 1000, stats: { effectiveWorkAmount: 100 } }),
  ];
  const rows = aggregateByStore(archives);
  const a = rows.find((r) => r.key === "店A");
  const b = rows.find((r) => r.key === "店B");
  // 店A: EV = 500(effective) + 200(workAmount フォールバック) = 700
  assert.strictEqual(a.evAmount, 700);
  assert.strictEqual(a.sessions, 2);
  assert.strictEqual(a.realSessions, 1);
  assert.strictEqual(a.actualPL, 2000); // 3000-1000
  assert.strictEqual(a.hasActual, true);
  assert.strictEqual(b.actualPL, -4000); // 1000-5000
  // 実損益がある店は前に、その中で actualPL 降順（店A +2000 > 店B -4000）
  assert.strictEqual(rows[0].key, "店A");
  assert.strictEqual(rows[1].key, "店B");
});
test("store: 店舗名が空なら「未設定」にまとめる", () => {
  const rows = aggregateByStore([arc({ storeName: "" }), arc({ storeName: "   " })]);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].label, "未設定");
  assert.strictEqual(rows[0].sessions, 2);
});

// ──────────── aggregateByWeekday ────────────

test("weekday: 空配列で空配列", () => {
  assert.deepStrictEqual(aggregateByWeekday([]), []);
});
test("weekday: 2026-05-12 は火曜", () => {
  const rows = aggregateByWeekday([arc({ date: "2026-05-12", stats: { workAmount: 100 } })]);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].label, "火曜");
  assert.strictEqual(rows[0].evAmount, 100);
});
test("weekday: 不正な日付は除外、日→土の順で返す", () => {
  const archives = [
    arc({ date: "2026-05-16", stats: { workAmount: 10 } }), // 土
    arc({ date: "2026-05-12", stats: { workAmount: 20 } }), // 火
    arc({ date: "bad-date", stats: { workAmount: 99 } }),   // 除外
  ];
  const rows = aggregateByWeekday(archives);
  assert.strictEqual(rows.length, 2);
  // key は曜日番号（火=2 < 土=6）
  assert.deepStrictEqual(rows.map((r) => r.label), ["火曜", "土曜"]);
});
test("weekday: evAvg = evAmount / sessions", () => {
  const archives = [
    arc({ date: "2026-05-12", stats: { workAmount: 100 } }),
    arc({ date: "2026-05-12", stats: { workAmount: 300 } }),
  ];
  const rows = aggregateByWeekday(archives);
  assert.strictEqual(rows[0].sessions, 2);
  assert.strictEqual(rows[0].evAmount, 400);
  assert.strictEqual(rows[0].evAvg, 200);
});
