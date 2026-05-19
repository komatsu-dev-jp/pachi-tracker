// src/components/analysis/__tests__/analysisSelectors.test.mjs
// 実行: node src/components/analysis/__tests__/analysisSelectors.test.mjs
//
// 分析モード用集計セレクタの境界値テスト。
// - 空配列・不正データ・実損益なしの archive を含む混在ケースで集計が破綻しないこと
// - 月別／年別／通算の集計値が一致すること
// - 機種別 TOP5 の並び順（実損益優先 → 期待値順）

import assert from "node:assert";
import {
  aggregateByDay,
  aggregateByMonth,
  aggregateByYear,
  buildDailyChartPoints,
  buildMonthlyChartPoints,
  buildYearlyChartPoints,
  filterArchives,
  getActualPL,
  listAvailableMonths,
  listAvailableYears,
  machineRanking,
  summarize,
} from "../analysisSelectors.js";

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`FAIL [${name}]: ${e.message}`);
    failed++;
  }
}

// ──────────── 入力: 空配列 ────────────
test("empty: summarize で破綻しない", () => {
  const s = summarize([], {});
  assert.strictEqual(s.totalPL, 0);
  assert.strictEqual(s.days, 0);
  assert.strictEqual(s.sessions, 0);
  assert.strictEqual(s.recoverRate, null);
  assert.strictEqual(s.winRate, null);
  assert.strictEqual(s.hasActual, false);
});
test("empty: machineRanking が空配列を返す", () => {
  assert.deepStrictEqual(machineRanking([], { limit: 5 }), []);
});
test("empty: aggregateByDay/Month/Year が空配列を返す", () => {
  assert.deepStrictEqual(aggregateByDay([], "2026-05"), []);
  assert.deepStrictEqual(aggregateByMonth([], "2026"), []);
  assert.deepStrictEqual(aggregateByYear([]), []);
});

// ──────────── 入力: 不正データ混在 ────────────
test("invalid: date 欠落の archive は無視される", () => {
  const list = [{ investYen: 100, recoveryYen: 200 }, { date: "2026-05-01", investYen: 1000, recoveryYen: 500 }];
  const s = summarize(list, {});
  assert.strictEqual(s.sessions, 1);
  assert.strictEqual(s.totalPL, -500);
});
test("invalid: 数値が文字列でも算術的に処理される", () => {
  const list = [{ date: "2026-05-01", investYen: "100", recoveryYen: "300" }];
  const s = summarize(list, {});
  assert.strictEqual(s.totalPL, 200);
  assert.strictEqual(s.hasActual, true);
});
test("invalid: workAmount が NaN でも 0 扱い", () => {
  const list = [{ date: "2026-05-01", investYen: 0, recoveryYen: 0, stats: { workAmount: NaN } }];
  const s = summarize(list, {});
  assert.strictEqual(s.evAmount, 0);
});

// ──────────── 実損益なしの archive ────────────
test("noActual: 投資・回収ゼロは hasActual=false / 勝率対象外", () => {
  const list = [
    { date: "2026-05-01", investYen: 0, recoveryYen: 0, stats: { workAmount: 1000 } },
  ];
  const s = summarize(list, {});
  assert.strictEqual(s.hasActual, false);
  assert.strictEqual(s.totalPL, 0);
  assert.strictEqual(s.winRate, null);
  assert.strictEqual(s.evAmount, 1000);
});
test("noActual: 実損益あり・なしの混在で勝率は実損益記録のみで計算", () => {
  const list = [
    { date: "2026-05-01", investYen: 1000, recoveryYen: 2000 }, // +1000 (win)
    { date: "2026-05-02", investYen: 3000, recoveryYen: 1000 }, // -2000 (lose)
    { date: "2026-05-03", investYen: 0,    recoveryYen: 0    }, // skip
  ];
  const s = summarize(list, {});
  assert.strictEqual(s.realSessions, 2);
  assert.strictEqual(s.winCount, 1);
  assert.strictEqual(s.winRate, 50);
});

// ──────────── 期間フィルタ ────────────
test("filter: month フィルタが効く", () => {
  const list = [
    { date: "2026-04-30", investYen: 100, recoveryYen: 200 },
    { date: "2026-05-01", investYen: 100, recoveryYen: 300 },
    { date: "2026-05-31", investYen: 100, recoveryYen: 400 },
    { date: "2026-06-01", investYen: 100, recoveryYen: 500 },
  ];
  const filtered = filterArchives(list, { month: "2026-05" });
  assert.strictEqual(filtered.length, 2);
});
test("filter: year フィルタが効く", () => {
  const list = [
    { date: "2025-12-31", investYen: 100, recoveryYen: 200 },
    { date: "2026-01-01", investYen: 100, recoveryYen: 300 },
    { date: "2026-12-31", investYen: 100, recoveryYen: 400 },
    { date: "2027-01-01", investYen: 100, recoveryYen: 500 },
  ];
  assert.strictEqual(filterArchives(list, { year: "2026" }).length, 2);
});

// ──────────── 日／月／年集計 ────────────
test("aggregate: 同一日複数 archive が日別で合算される", () => {
  const list = [
    { date: "2026-05-01", investYen: 1000, recoveryYen: 2000 }, // +1000
    { date: "2026-05-01", investYen: 500,  recoveryYen: 100  }, // -400
    { date: "2026-05-02", investYen: 100,  recoveryYen: 200  }, // +100
  ];
  const days = aggregateByDay(list, "2026-05");
  assert.strictEqual(days.length, 2);
  assert.strictEqual(days[0].date, "2026-05-01");
  assert.strictEqual(days[0].actualPL, 600);
  assert.strictEqual(days[0].sessions, 2);
});
test("aggregate: 月別 / 年別が一致する", () => {
  const list = [
    { date: "2026-05-01", investYen: 1000, recoveryYen: 1500 },
    { date: "2026-06-01", investYen: 1000, recoveryYen: 500  },
  ];
  const months = aggregateByMonth(list, "2026");
  const year = aggregateByYear(list);
  const yearTotal = year.find((y) => y.year === "2026");
  const monthsTotal = months.reduce((s, m) => s + m.actualPL, 0);
  assert.strictEqual(yearTotal.actualPL, monthsTotal);
});

// ──────────── 機種別 TOP5 ────────────
test("machineRanking: 実損益のある機種が優先、降順", () => {
  const list = [
    { date: "2026-05-01", machineName: "A", investYen: 1000, recoveryYen: 5000, settings: { synthDenom: 319 } }, // +4000
    { date: "2026-05-02", machineName: "B", investYen: 2000, recoveryYen: 1000, settings: { synthDenom: 319 } }, // -1000
    { date: "2026-05-03", machineName: "C", investYen: 0,    recoveryYen: 0,    settings: { synthDenom: 319 }, stats: { workAmount: 999999 } }, // EV only
  ];
  const top = machineRanking(list, { limit: 5 });
  assert.strictEqual(top[0].machineName, "A");
  assert.strictEqual(top[1].machineName, "B");
  // 実損益のないものは末尾
  assert.strictEqual(top[2].machineName, "C");
});
test("machineRanking: limit が効く", () => {
  const list = Array.from({ length: 10 }, (_, i) => ({
    date: "2026-05-01",
    machineName: `M${i}`,
    investYen: 1000,
    recoveryYen: 1000 + i * 100,
    settings: { synthDenom: 319 },
  }));
  const top = machineRanking(list, { limit: 3 });
  assert.strictEqual(top.length, 3);
});

// ──────────── 稼働日数・回収率 ────────────
test("summary: 稼働日数はユニーク日付", () => {
  const list = [
    { date: "2026-05-01", investYen: 100, recoveryYen: 200 },
    { date: "2026-05-01", investYen: 100, recoveryYen: 200 },
    { date: "2026-05-02", investYen: 100, recoveryYen: 200 },
  ];
  assert.strictEqual(summarize(list, {}).days, 2);
});
test("summary: 回収率は invest > 0 のときのみ", () => {
  const list = [{ date: "2026-05-01", investYen: 1000, recoveryYen: 1213 }];
  const s = summarize(list, {});
  assert.ok(Math.abs(s.recoverRate - 121.3) < 0.0001);
});
test("summary: invest=0 の場合は recoverRate=null", () => {
  const list = [{ date: "2026-05-01", investYen: 0, recoveryYen: 1000 }];
  assert.strictEqual(summarize(list, {}).recoverRate, null);
});

// ──────────── グラフ ────────────
test("chart: 実損益のない日はチャートに出ない", () => {
  const list = [
    { date: "2026-05-01", investYen: 1000, recoveryYen: 2000 },
    { date: "2026-05-02", investYen: 0,    recoveryYen: 0    },
  ];
  const pts = buildDailyChartPoints(list, "2026-05");
  assert.strictEqual(pts.length, 1);
  assert.strictEqual(pts[0].label, "5/1");
});
test("chart: 月別ポイントのラベルが '5月' 形式", () => {
  const list = [{ date: "2026-05-01", investYen: 1000, recoveryYen: 1500 }];
  const pts = buildMonthlyChartPoints(list, "2026");
  assert.strictEqual(pts[0].label, "5月");
});
test("chart: 年別ポイントのラベルが '2026年' 形式", () => {
  const list = [{ date: "2026-05-01", investYen: 1000, recoveryYen: 1500 }];
  const pts = buildYearlyChartPoints(list);
  assert.strictEqual(pts[0].label, "2026年");
});

// ──────────── 期間一覧 ────────────
test("listAvailable: 月・年がソート済み・重複なしで返る", () => {
  const list = [
    { date: "2026-06-15" },
    { date: "2026-05-01" },
    { date: "2025-12-31" },
    { date: "2026-05-31" },
  ];
  assert.deepStrictEqual(listAvailableMonths(list), ["2025-12", "2026-05", "2026-06"]);
  assert.deepStrictEqual(listAvailableYears(list), ["2025", "2026"]);
});

// ──────────── 個別関数 ────────────
test("getActualPL: 投資・回収どちらも 0 のとき null", () => {
  assert.strictEqual(getActualPL({ investYen: 0, recoveryYen: 0 }), null);
});
test("getActualPL: 数値計算が正しい", () => {
  assert.strictEqual(getActualPL({ investYen: 3000, recoveryYen: 5000 }), 2000);
});

// ──────────── 極端値 ────────────
test("extreme: 大きな数値で破綻しない", () => {
  const big = 1e9;
  const list = [{ date: "2026-05-01", investYen: big, recoveryYen: big * 2 }];
  const s = summarize(list, {});
  assert.strictEqual(s.totalPL, big);
});
test("extreme: 負の収支も正しく扱う", () => {
  const list = [{ date: "2026-05-01", investYen: 5000, recoveryYen: 1000 }];
  const s = summarize(list, {});
  assert.strictEqual(s.totalPL, -4000);
  assert.strictEqual(s.winRate, 0);
});

console.log(`${passed} passed / ${failed} failed`);
if (failed > 0) process.exit(1);
