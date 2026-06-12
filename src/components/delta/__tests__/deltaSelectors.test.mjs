// src/components/delta/__tests__/deltaSelectors.test.mjs
// 実行: node --test src/components/delta/__tests__/deltaSelectors.test.mjs
//
// 差玉解析セレクタ＋ランク判定の境界値テスト。

import { test } from "node:test";
import assert from "node:assert";
import {
  parseTaiDataText,
  assignNumbers,
  mergeTaiData,
  islandToNumbers,
  buildSegmentsNumbers,
} from "../deltaSelectors.js";
import { getRank, RANKS } from "../deltaEngine.js";

// ──────────── parseTaiDataText ────────────

test("parseTaiData: 正常なタブ区切り2行", () => {
  const text =
    "2026/02/13\tスーパーキスケPAO\tP北斗SSPA島\tP北斗SSPA\t267\t1239\t12\n" +
    "2026/02/13\tスーパーキスケPAO\tP北斗SSPA島\tP北斗SSPA\t268\t204\t2";
  const { rows, skipped } = parseTaiDataText(text);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(skipped.length, 0);
  assert.deepStrictEqual(rows[0], {
    date: "2026/02/13",
    store: "スーパーキスケPAO",
    island: "P北斗SSPA島",
    machineName: "P北斗SSPA",
    num: "267",
    normalSpins: 1239,
    totalStarts: 12,
  });
});

test("parseTaiData: 連続空白区切りで7列になる行を再試行で拾う", () => {
  const text = "2026/02/13 店A 島A 機種A 818 1580 15";
  const { rows, skipped } = parseTaiDataText(text);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(skipped.length, 0);
  assert.strictEqual(rows[0].num, "818");
  assert.strictEqual(rows[0].normalSpins, 1580);
});

test("parseTaiData: タブと空白の混在（行ごとに方式が違う）", () => {
  const text =
    "2026/02/13\t店A\t島A\t機種A\t100\t1000\t5\n" +
    "2026/02/13 店A 島A 機種A 101 2000 8";
  const { rows } = parseTaiDataText(text);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].num, "100");
  assert.strictEqual(rows[1].num, "101");
});

test("parseTaiData: カンマ区切り数値を許容", () => {
  const text = "2026/02/13\t店A\t島A\t機種A\t818\t1,239\t12";
  const { rows } = parseTaiDataText(text);
  assert.strictEqual(rows[0].normalSpins, 1239);
});

test("parseTaiData: 全角数字を半角化", () => {
  const text = "2026/02/13\t店A\t島A\t機種A\t８１８\t１２３９\t１２";
  const { rows } = parseTaiDataText(text);
  assert.strictEqual(rows[0].num, "818");
  assert.strictEqual(rows[0].normalSpins, 1239);
  assert.strictEqual(rows[0].totalStarts, 12);
});

test("parseTaiData: 列数不足はスキップ理由付き", () => {
  const text = "2026/02/13\t店A\t島A\t機種A\t818\t1239"; // 6列
  const { rows, skipped } = parseTaiDataText(text);
  assert.strictEqual(rows.length, 0);
  assert.strictEqual(skipped.length, 1);
  assert.strictEqual(skipped[0].reason, "列数不足");
});

test("parseTaiData: 台番号が数値化できない行はスキップ", () => {
  const text = "2026/02/13\t店A\t島A\t機種A\tABC\t1239\t12";
  const { rows, skipped } = parseTaiDataText(text);
  assert.strictEqual(rows.length, 0);
  assert.strictEqual(skipped.length, 1);
  assert.strictEqual(skipped[0].reason, "台番号が数値化できない");
});

test("parseTaiData: 回転数が数値化できない行はスキップ", () => {
  const text = "2026/02/13\t店A\t島A\t機種A\t818\tーー\t12";
  const { rows, skipped } = parseTaiDataText(text);
  assert.strictEqual(rows.length, 0);
  assert.strictEqual(skipped.length, 1);
  assert.strictEqual(skipped[0].reason, "数値が数値化できない");
});

test("parseTaiData: 空文字・空行は静かに無視", () => {
  assert.deepStrictEqual(parseTaiDataText(""), { rows: [], skipped: [] });
  const { rows, skipped } = parseTaiDataText("\n\n  \n");
  assert.strictEqual(rows.length, 0);
  assert.strictEqual(skipped.length, 0);
});

// ──────────── assignNumbers ────────────

test("assignNumbers: 台番号リストを順に割り当てランク付与", () => {
  const slots = [{ val: 24500, px: 100 }, { val: -12000, px: 80 }];
  const out = assignNumbers(slots, ["818", "824"]);
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[0].num, "818");
  assert.strictEqual(out[0].rank, "S+");
  assert.strictEqual(out[1].num, "824");
  assert.strictEqual(out[1].rank, "E+");
});

test("assignNumbers: 番号不足は index+1 フォールバック", () => {
  const out = assignNumbers([{ val: 0, px: 0 }, { val: 0, px: 0 }], ["7"]);
  assert.strictEqual(out[0].num, "7");
  assert.strictEqual(out[1].num, "2");
});

// ──────────── mergeTaiData ────────────

test("mergeTaiData: 台番号一致で回転数等をマージ", () => {
  const rows = [
    { num: "818", val: 24500, rank: getRank(24500).rank },
    { num: "824", val: -12000, rank: getRank(-12000).rank },
  ];
  const tai = [{ num: "818", island: "島A", machineName: "機種A", normalSpins: 1239, totalStarts: 12 }];
  const { rows: merged, matched } = mergeTaiData(rows, tai);
  assert.strictEqual(matched, 1);
  assert.strictEqual(merged[0].normalSpins, 1239);
  assert.strictEqual(merged[0].machineName, "機種A");
  assert.strictEqual(merged[1].normalSpins, undefined);
});

test("mergeTaiData: 不一致はマッチ0で元行を保つ", () => {
  const rows = [{ num: "1", val: 0 }];
  const tai = [{ num: "999", normalSpins: 100, totalStarts: 1 }];
  const { rows: merged, matched } = mergeTaiData(rows, tai);
  assert.strictEqual(matched, 0);
  assert.strictEqual(merged[0].val, 0);
});

// ──────────── islandToNumbers ────────────

test("islandToNumbers: start〜end の連番", () => {
  assert.deepStrictEqual(islandToNumbers({ start: 816, end: 819 }), ["816", "817", "818", "819"]);
});

test("islandToNumbers: start>end は昇順に正規化、無効は空", () => {
  assert.deepStrictEqual(islandToNumbers({ start: 5, end: 3 }), ["3", "4", "5"]);
  assert.deepStrictEqual(islandToNumbers({}), []);
  assert.deepStrictEqual(islandToNumbers(null), []);
});

// ──────────── buildSegmentsNumbers ────────────

test("buildSegmentsNumbers: 飛び番号の複数区間", () => {
  const segs = [{ start: "901", count: "3" }, { start: "910", count: "2" }];
  assert.deepStrictEqual(buildSegmentsNumbers(segs), ["901", "902", "903", "910", "911"]);
});

test("buildSegmentsNumbers: 無効区間はスキップ", () => {
  const segs = [{ start: "", count: "3" }, { start: "5", count: "0" }, { start: "10", count: "2" }];
  assert.deepStrictEqual(buildSegmentsNumbers(segs), ["10", "11"]);
});

// ──────────── getRank 境界値 ────────────

test("getRank: 境界値 25000 は SS", () => {
  assert.strictEqual(getRank(25000).rank, "SS");
});
test("getRank: 0 は C", () => {
  assert.strictEqual(getRank(0).rank, "C");
});
test("getRank: -2500 は C-", () => {
  assert.strictEqual(getRank(-2500).rank, "C-");
});
test("getRank: 極小値は G", () => {
  assert.strictEqual(getRank(-9999999).rank, "G");
  assert.strictEqual(getRank(-Infinity).rank, "G");
});
test("getRank: 極大値は SS / RANKS は21定義", () => {
  assert.strictEqual(getRank(999999).rank, "SS");
  assert.strictEqual(RANKS.length, 21);
});
