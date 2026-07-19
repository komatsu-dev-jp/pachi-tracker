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
  archiveWorkMinutes,
  buildDailyChartPoints,
  buildMonthlyChartPoints,
  buildYearlyChartPoints,
  filterArchives,
  getActualPL,
  getArchiveGameType,
  getChodamaPL,
  getEvAmount,
  getMachineHamariList,
  isFilterActive,
  listAvailableMachines,
  listAvailableMonths,
  listAvailableStores,
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
test("filter: 旧記録と不明な種別はパチンコとして扱う", () => {
  assert.strictEqual(getArchiveGameType({}), "pachinko");
  assert.strictEqual(getArchiveGameType({ gameType: "other" }), "pachinko");
  assert.strictEqual(getArchiveGameType({ gameType: "slot" }), "slot");
});
test("filter: gameType でパチンコ・スロットを絞り込める", () => {
  const list = [
    { date: "2026-05-01", machineName: "旧パチンコ記録" },
    { date: "2026-05-02", gameType: "pachinko", machineName: "パチンコ" },
    { date: "2026-05-03", gameType: "slot", machineName: "スロット" },
  ];
  assert.deepStrictEqual(
    filterArchives(list, { gameType: "pachinko" }).map((a) => a.machineName),
    ["旧パチンコ記録", "パチンコ"],
  );
  assert.deepStrictEqual(
    filterArchives(list, { gameType: "slot" }).map((a) => a.machineName),
    ["スロット"],
  );
  assert.strictEqual(filterArchives(list, { gameType: "all" }).length, 3);
  assert.strictEqual(filterArchives(list, { gameType: "" }).length, 3);
});
test("slot: 種別変更前のパチンコ期待値・回転・貯玉を集計しない", () => {
  const staleSlot = {
    date: "2026-05-04",
    gameType: "slot",
    playMinutes: 120,
    chodamaYen: 5000,
    settings: { rotPerHour: 250 },
    stats: { netRot: 1000, workAmount: 3000, effectiveWorkAmount: 4000 },
  };

  assert.strictEqual(getEvAmount(staleSlot), 0);
  assert.strictEqual(archiveWorkMinutes(staleSlot), 120);
  assert.strictEqual(getChodamaPL(staleSlot), 0);

  const summary = summarize([staleSlot]);
  assert.strictEqual(summary.evAmount, 0);
  assert.strictEqual(summary.workHours, 2);
  assert.strictEqual(summary.totalChodamaPL, 0);
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
test("aggregate: 全種別を合算し、スロット収支だけでも集計できる", () => {
  const list = [
    { date: "2026-05-01", investYen: 1000, recoveryYen: 3000 }, // 旧パチンコ +2000
    { date: "2026-05-01", gameType: "slot", investYen: 5000, recoveryYen: 2000 }, // スロット -3000
  ];
  const all = aggregateByDay(list, "2026-05");
  assert.strictEqual(all[0].actualPL, -1000);
  assert.strictEqual(all[0].realPL, -1000);
  assert.strictEqual(all[0].sessions, 2);

  const slot = aggregateByDay(list, "2026-05", { gameType: "slot" });
  assert.strictEqual(slot[0].actualPL, -3000);
  assert.strictEqual(slot[0].realPL, -3000);
  assert.strictEqual(slot[0].sessions, 1);
});
test("aggregate: realPL は貯玉を含み、貯玉だけでも hasActual=true", () => {
  const list = [
    { date: "2026-05-01", investYen: 1000, recoveryYen: 3000, chodamaYen: 1000 },
    { date: "2026-05-02", investYen: 0, recoveryYen: 0, chodamaYen: 3000 },
  ];
  const days = aggregateByDay(list, "2026-05");
  assert.strictEqual(days[0].actualPL, 2000);
  assert.strictEqual(days[0].realPL, 1000);
  assert.strictEqual(days[1].actualPL, 0);
  assert.strictEqual(days[1].realPL, -3000);
  assert.strictEqual(days[1].hasActual, true);

  const month = aggregateByMonth(list, "2026")[0];
  assert.strictEqual(month.actualPL, 2000);
  assert.strictEqual(month.realPL, -2000);
  assert.strictEqual(month.hasActual, true);

  const year = aggregateByYear(list)[0];
  assert.strictEqual(year.actualPL, 2000);
  assert.strictEqual(year.realPL, -2000);
  assert.strictEqual(year.hasActual, true);
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

// ──────────── 拡張フィルタ（店舗・機種・日付範囲・曜日） ────────────
test("filter: storeName で絞り込める", () => {
  const list = [
    { date: "2026-05-01", storeName: "ホールA", investYen: 100, recoveryYen: 200 },
    { date: "2026-05-02", storeName: "ホールB", investYen: 100, recoveryYen: 300 },
    { date: "2026-05-03", storeName: "ホールA", investYen: 100, recoveryYen: 400 },
  ];
  const filtered = filterArchives(list, { storeName: "ホールA" });
  assert.strictEqual(filtered.length, 2);
  assert.strictEqual(filtered[0].date, "2026-05-01");
  assert.strictEqual(filtered[1].date, "2026-05-03");
});
test("filter: 空文字の storeName は全件返す", () => {
  const list = [{ date: "2026-05-01", storeName: "" }, { date: "2026-05-02", storeName: "A" }];
  assert.strictEqual(filterArchives(list, { storeName: "" }).length, 2);
});
test("filter: machineName で絞り込める", () => {
  const list = [
    { date: "2026-05-01", machineName: "Pエヴァ", investYen: 100, recoveryYen: 200 },
    { date: "2026-05-02", machineName: "Pうみ", investYen: 100, recoveryYen: 200 },
  ];
  assert.strictEqual(filterArchives(list, { machineName: "Pエヴァ" }).length, 1);
});
test("filter: dateStart / dateEnd の両端は含む", () => {
  const list = [
    { date: "2026-05-01" }, { date: "2026-05-15" },
    { date: "2026-05-20" }, { date: "2026-05-31" },
  ];
  const filtered = filterArchives(list, { dateStart: "2026-05-15", dateEnd: "2026-05-20" });
  assert.strictEqual(filtered.length, 2);
  assert.strictEqual(filtered[0].date, "2026-05-15");
  assert.strictEqual(filtered[1].date, "2026-05-20");
});
test("filter: dateStart のみ指定でも効く", () => {
  const list = [{ date: "2026-04-30" }, { date: "2026-05-01" }, { date: "2026-05-02" }];
  assert.strictEqual(filterArchives(list, { dateStart: "2026-05-01" }).length, 2);
});
test("filter: dateEnd のみ指定でも効く", () => {
  const list = [{ date: "2026-04-30" }, { date: "2026-05-01" }, { date: "2026-05-02" }];
  assert.strictEqual(filterArchives(list, { dateEnd: "2026-04-30" }).length, 1);
});
test("filter: weekdays で曜日絞り込み", () => {
  // 2026-05-01 = 金, 02 = 土, 03 = 日, 04 = 月
  const list = [
    { date: "2026-05-01" }, { date: "2026-05-02" },
    { date: "2026-05-03" }, { date: "2026-05-04" },
  ];
  const filtered = filterArchives(list, { weekdays: [0, 6] }); // 日と土
  assert.strictEqual(filtered.length, 2);
  assert.deepStrictEqual(filtered.map((a) => a.date).sort(), ["2026-05-02", "2026-05-03"]);
});
test("filter: weekdays が空配列なら全曜日通す", () => {
  const list = [{ date: "2026-05-01" }, { date: "2026-05-02" }];
  assert.strictEqual(filterArchives(list, { weekdays: [] }).length, 2);
});
test("filter: 複数フィルタを AND で結合", () => {
  const list = [
    { date: "2026-05-01", storeName: "A", machineName: "X" }, // 金、A、X
    { date: "2026-05-02", storeName: "A", machineName: "Y" }, // 土、A、Y
    { date: "2026-05-08", storeName: "A", machineName: "X" }, // 金、A、X
    { date: "2026-05-08", storeName: "B", machineName: "X" }, // 金、B、X
  ];
  const filtered = filterArchives(list, {
    storeName: "A", machineName: "X", weekdays: [5], // 金
  });
  assert.strictEqual(filtered.length, 2); // 05-01 と 05-08（store=A, machine=X, 金）
});
test("filter: 既存 month と 拡張フィルタの AND 結合", () => {
  const list = [
    { date: "2026-04-30", storeName: "A" },
    { date: "2026-05-01", storeName: "A" },
    { date: "2026-05-02", storeName: "B" },
  ];
  const filtered = filterArchives(list, { month: "2026-05", storeName: "A" });
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].date, "2026-05-01");
});

// ──────────── 拡張フィルタが集計関数に伝搬すること ────────────
test("summarize: 拡張フィルタ（storeName）が反映される", () => {
  const list = [
    { date: "2026-05-01", storeName: "A", investYen: 1000, recoveryYen: 2000 }, // +1000
    { date: "2026-05-02", storeName: "B", investYen: 1000, recoveryYen: 500  }, // -500
  ];
  const s = summarize(list, { storeName: "A" });
  assert.strictEqual(s.sessions, 1);
  assert.strictEqual(s.totalPL, 1000);
});
test("machineRanking: 拡張フィルタ（dateStart/End）が反映される", () => {
  const list = [
    { date: "2026-04-01", machineName: "X", investYen: 1000, recoveryYen: 9999, settings: { synthDenom: 319 } },
    { date: "2026-05-01", machineName: "X", investYen: 1000, recoveryYen: 1500, settings: { synthDenom: 319 } },
  ];
  const top = machineRanking(list, { dateStart: "2026-05-01", limit: 5 });
  assert.strictEqual(top.length, 1);
  assert.strictEqual(top[0].actualPL, 500);
});
test("buildDailyChartPoints: 拡張フィルタが反映される", () => {
  // 2026-05-01 = 金, 02 = 土
  const list = [
    { date: "2026-05-01", investYen: 1000, recoveryYen: 2000 },
    { date: "2026-05-02", investYen: 1000, recoveryYen: 500  },
  ];
  const pts = buildDailyChartPoints(list, "2026-05", { weekdays: [6] }); // 土だけ
  assert.strictEqual(pts.length, 1);
  assert.strictEqual(pts[0].label, "5/2");
});

// ──────────── listAvailableStores / listAvailableMachines ────────────
test("listAvailableStores: 一意・昇順・空文字除外", () => {
  const list = [
    { storeName: "ホールC" }, { storeName: "ホールA" },
    { storeName: "" }, { storeName: "ホールA" }, { storeName: "ホールB" },
  ];
  const stores = listAvailableStores(list);
  assert.strictEqual(stores.length, 3);
  // localeCompare("ja") は実行環境依存だが、少なくとも重複が除去されていること
  assert.ok(stores.includes("ホールA"));
  assert.ok(stores.includes("ホールB"));
  assert.ok(stores.includes("ホールC"));
});
test("listAvailableMachines: 一意・空文字除外", () => {
  const list = [{ machineName: "X" }, { machineName: "Y" }, { machineName: "X" }];
  assert.strictEqual(listAvailableMachines(list).length, 2);
});

// ──────────── isFilterActive ────────────
test("isFilterActive: 全空なら false", () => {
  assert.strictEqual(isFilterActive({}), false);
  assert.strictEqual(isFilterActive({ storeName: "", machineName: "", dateStart: "", dateEnd: "", weekdays: [] }), false);
});
test("isFilterActive: 1つでも条件があれば true", () => {
  assert.strictEqual(isFilterActive({ storeName: "A" }), true);
  assert.strictEqual(isFilterActive({ machineName: "X" }), true);
  assert.strictEqual(isFilterActive({ dateStart: "2026-01-01" }), true);
  assert.strictEqual(isFilterActive({ dateEnd: "2026-01-01" }), true);
  assert.strictEqual(isFilterActive({ weekdays: [0] }), true);
});

// ──────────── 貯玉消費分の収支（getChodamaPL / summarize） ────────────
test("getChodamaPL: chodamaYen 未設定は 0", () => {
  assert.strictEqual(getChodamaPL({}), 0);
  assert.strictEqual(getChodamaPL({ chodamaYen: 0 }), 0);
});
test("getChodamaPL: 貯玉消費はマイナス（コスト）", () => {
  assert.strictEqual(getChodamaPL({ chodamaYen: 10000 }), -10000);
});
test("summarize: 貯玉未使用なら hasChodama=false / 実質総収支=現金収支", () => {
  const list = [{ date: "2026-05-01", investYen: 1000, recoveryYen: 3000 }]; // +2000
  const s = summarize(list, {});
  assert.strictEqual(s.hasChodama, false);
  assert.strictEqual(s.totalChodamaPL, 0);
  assert.strictEqual(s.totalPL, 2000);
  assert.strictEqual(s.totalRealPL, 2000);
});
test("summarize: 貯玉消費分が実質総収支に合算される", () => {
  // 現金収支 +2000、貯玉消費 10000円分 → 実質総収支 -8000
  const list = [
    { date: "2026-05-01", investYen: 1000, recoveryYen: 3000, chodamaYen: 10000, chodamaNetBalls: -2500 },
  ];
  const s = summarize(list, {});
  assert.strictEqual(s.hasChodama, true);
  assert.strictEqual(s.totalPL, 2000);
  assert.strictEqual(s.totalChodamaPL, -10000);
  assert.strictEqual(s.totalRealPL, -8000);
});
test("summarize: 現金記録ゼロ・貯玉のみのセッションも実質総収支に反映", () => {
  // 投資・回収ゼロ（hasActual=false）だが貯玉 5000円分消費
  const list = [
    { date: "2026-05-01", investYen: 0, recoveryYen: 0, chodamaYen: 5000 },
  ];
  const s = summarize(list, {});
  assert.strictEqual(s.hasActual, false);
  assert.strictEqual(s.totalPL, 0);
  assert.strictEqual(s.hasChodama, true);
  assert.strictEqual(s.totalChodamaPL, -5000);
  assert.strictEqual(s.totalRealPL, -5000);
});
test("summarize: 貯玉あり・なし混在の合算", () => {
  const list = [
    { date: "2026-05-01", investYen: 1000, recoveryYen: 2000 },                    // 現金+1000、貯玉なし
    { date: "2026-05-02", investYen: 0,    recoveryYen: 4000, chodamaYen: 3000 },  // 現金+4000、貯玉-3000
  ];
  const s = summarize(list, {});
  assert.strictEqual(s.totalPL, 5000);
  assert.strictEqual(s.totalChodamaPL, -3000);
  assert.strictEqual(s.totalRealPL, 2000);
  assert.strictEqual(s.hasChodama, true);
});

// ──────────── getMachineHamariList ────────────
{
  // テスト用ヘルパー: rotRows を構築
  const makeRotRows = (finalCumRot, lastStartCumRot = 0) => [
    { type: "start", cumRot: lastStartCumRot },
    { type: "data",  cumRot: finalCumRot, thisRot: finalCumRot - lastStartCumRot },
  ];
  // テスト用ヘルパー: jpLog (完了チェーン) を構築
  const makeChain = (hitThisRot) => ({
    hitThisRot,
    completed: true,
    hits: [{ rounds: 10 }],
  });

  // アーカイブ雛形
  const archBase = (machine, jpLog, netRot, rotRows) => ({
    date: "2026-05-01",
    machineName: machine,
    settings: { synthDenom: "319.6" },
    jpLog: jpLog || [],
    stats: { netRot: netRot || 0 },
    rotRows: rotRows || [],
    investYen: 0,
    recoveryYen: 0,
  });

  test("getMachineHamariList: 空配列で空を返す", () => {
    assert.deepStrictEqual(getMachineHamariList([]), []);
  });

  test("getMachineHamariList: 大当たりなしセッション → hasData=false", () => {
    const archives = [archBase("テスト機種A", [], 300, makeRotRows(300, 0))];
    const res = getMachineHamariList(archives);
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].hasData, false);
    assert.strictEqual(res[0].totalJPCount, 0);
    assert.strictEqual(res[0].totalHamariRot, 0);
  });

  test("getMachineHamariList: トータルハマり = hitThisRot の合計", () => {
    const archives = [
      { ...archBase("テスト機種A"), date: "2026-05-01",
        jpLog: [makeChain(200), makeChain(150)],
        stats: { netRot: 400 },
        rotRows: makeRotRows(50, 0) },
    ];
    const res = getMachineHamariList(archives);
    assert.strictEqual(res[0].totalHamariRot, 350); // 200 + 150
  });

  test("getMachineHamariList: 複数セッション合算", () => {
    const archives = [
      { ...archBase("テスト機種A"), date: "2026-05-01",
        jpLog: [makeChain(200)], stats: { netRot: 250 }, rotRows: makeRotRows(50, 0) },
      { ...archBase("テスト機種A"), date: "2026-05-02",
        jpLog: [makeChain(100)], stats: { netRot: 130 }, rotRows: makeRotRows(30, 0) },
    ];
    const res = getMachineHamariList(archives);
    assert.strictEqual(res[0].totalHamariRot, 300); // 200 + 100
    assert.strictEqual(res[0].sessions, 2);
  });

  test("getMachineHamariList: 直近5回のハマり = 最新5セッションのみ", () => {
    const makeA = (date, hitThisRot) => ({
      ...archBase("テスト機種A"), date,
      jpLog: [makeChain(hitThisRot)],
      stats: { netRot: hitThisRot + 10 },
      rotRows: makeRotRows(10, 0),
    });
    // 6セッション: 古い順に 100, 200, 300, 400, 500, 600
    const archives = [
      makeA("2026-01-01", 100),
      makeA("2026-02-01", 200),
      makeA("2026-03-01", 300),
      makeA("2026-04-01", 400),
      makeA("2026-05-01", 500),
      makeA("2026-06-01", 600),
    ];
    const res = getMachineHamariList(archives);
    // 直近5 = 200+300+400+500+600 = 2000
    assert.strictEqual(res[0].recentHamariRot, 2000);
    assert.strictEqual(res[0].recentCount, 5);
  });

  test("getMachineHamariList: sinceLastJP - 最後の大当たりから後のセッションを含む", () => {
    // セッション1: 大当たりあり、最後のJPから50回転後終了
    const s1 = {
      ...archBase("テスト機種A"), date: "2026-05-01",
      jpLog: [makeChain(200)],
      stats: { netRot: 250 },
      rotRows: makeRotRows(50, 0),
    };
    // セッション2: 大当たりなし、100回転
    const s2 = {
      ...archBase("テスト機種A"), date: "2026-05-02",
      jpLog: [],
      stats: { netRot: 100 },
      rotRows: makeRotRows(100, 0),
    };
    const res = getMachineHamariList([s1, s2]);
    // sinceLastJP = 50 (s1後) + 100 (s2全部) = 150
    assert.strictEqual(res[0].sinceLastJPRot, 150);
  });

  test("getMachineHamariList: 大当たりが一度もない場合 sinceLastJP = 全回転数", () => {
    const archives = [
      { ...archBase("テスト機種A"), date: "2026-05-01", jpLog: [], stats: { netRot: 300 }, rotRows: [] },
      { ...archBase("テスト機種A"), date: "2026-05-02", jpLog: [], stats: { netRot: 200 }, rotRows: [] },
    ];
    const res = getMachineHamariList(archives);
    assert.strictEqual(res[0].sinceLastJPRot, 500); // 300 + 200
  });

  test("getMachineHamariList: 複数機種を sinceLastJP 降順でソート", () => {
    const archives = [
      { ...archBase("機種A"), date: "2026-05-01", jpLog: [], stats: { netRot: 100 }, rotRows: [] },
      { ...archBase("機種B"), date: "2026-05-01", jpLog: [], stats: { netRot: 300 }, rotRows: [] },
    ];
    const res = getMachineHamariList(archives);
    assert.strictEqual(res[0].machineName, "機種B");
    assert.strictEqual(res[1].machineName, "機種A");
  });
}

console.log(`${passed} passed / ${failed} failed`);
if (failed > 0) process.exit(1);
