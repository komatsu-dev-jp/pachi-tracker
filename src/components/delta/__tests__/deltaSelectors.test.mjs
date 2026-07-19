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
  validateNumberAssignment,
  validateDeltaRows,
  islandToNumbers,
  buildSegmentsNumbers,
  pruneScans,
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

test("parseTaiData: 差玉つき8列を台番号ごとに認識", () => {
  const text =
    "2026/02/13\tスーパーキスケPAO\t北斗島\tP北斗SSPA\t267\t-4,500\t1239\t12\n" +
    "2026/02/13\tスーパーキスケPAO\t北斗島\tP北斗SSPA\t268\t８２００\t204\t2";
  const { rows, skipped } = parseTaiDataText(text);
  assert.strictEqual(skipped.length, 0);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].val, -4500);
  assert.strictEqual(rows[1].val, 8200);
  assert.strictEqual(rows[0].normalSpins, 1239);
  assert.strictEqual(rows[0].totalStarts, 12);
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

test("assignNumbers: 番号不足を無関係な連番で埋めない", () => {
  const out = assignNumbers([{ val: 0, px: 0 }, { val: 0, px: 0 }], ["7"]);
  assert.strictEqual(out[0].num, "7");
  assert.strictEqual(out[1].num, "");
});

test("parseTaiData: Unicodeマイナスの符号を保持し、小数の桁結合を拒否", () => {
  const unicodeMinus = "2026/02/13\t店A\t島A\t機種A\t818\t−4,500\t1239\t12";
  const parsed = parseTaiDataText(unicodeMinus);
  assert.strictEqual(parsed.rows[0].val, -4500);

  const decimal = "2026/02/13\t店A\t島A\t機種A\t819\t12.5\t1239\t12";
  const rejected = parseTaiDataText(decimal);
  assert.strictEqual(rejected.rows.length, 0);
  assert.strictEqual(rejected.skipped[0].reason, "数値が数値化できない");
});

test("assignNumbers: 読み取り失敗のnullと診断情報を保持する", () => {
  const slot = {
    val: null,
    px: 0,
    status: "failed",
    reasonCodes: ["missing-series"],
    source: { imageIndex: 2, row: 4, column: 1 },
  };
  const [row] = assignNumbers([slot], ["814"]);
  assert.strictEqual(row.val, null);
  assert.strictEqual(row.rank, null);
  assert.strictEqual(row.status, "failed");
  assert.deepStrictEqual(row.reasonCodes, ["missing-series"]);
  assert.deepStrictEqual(row.source, slot.source);
});

test("validateNumberAssignment: 件数・空欄・重複を拒否する", () => {
  assert.strictEqual(validateNumberAssignment([{}, {}], ["810", "811"]).valid, true);
  const mismatch = validateNumberAssignment([{}, {}, {}], ["810", "810"]);
  assert.strictEqual(mismatch.valid, false);
  assert.deepStrictEqual(mismatch.errors.sort(), ["count-mismatch", "duplicate-number"]);
  const blank = validateNumberAssignment([{}], [""]);
  assert.deepStrictEqual(blank.errors, ["blank-number"]);
});

test("validateNumberAssignment: 数字以外と表記だけ異なる重複を拒否する", () => {
  const invalid = validateNumberAssignment([{}], ["ABC"]);
  assert.deepStrictEqual(invalid.errors, ["invalid-number"]);
  assert.deepStrictEqual(invalid.invalidNumberIndices, [0]);

  const duplicate = validateNumberAssignment([{}, {}], ["0810", "810"]);
  assert.deepStrictEqual(duplicate.errors, ["duplicate-number"]);
  assert.deepStrictEqual(duplicate.duplicateNumbers, ["810"]);
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

test("mergeTaiData: AI差玉は未読取グラフの確定値に昇格させない", () => {
  const rows = [{ num: "818", val: null, rank: null, status: "failed", reasonCodes: ["missing-series"] }];
  const tai = [{ num: "818", val: 26000, normalSpins: 1000, totalStarts: 15 }];
  const { rows: merged, matched, unverifiedDeltaNumbers } = mergeTaiData(rows, tai);
  assert.strictEqual(matched, 1);
  assert.strictEqual(merged[0].val, null);
  assert.strictEqual(merged[0].rank, null);
  assert.strictEqual(merged[0].status, "failed");
  assert.strictEqual(merged[0].normalSpins, 1000);
  assert.deepStrictEqual(merged[0].reasonCodes, ["missing-series"]);
  assert.deepStrictEqual(unverifiedDeltaNumbers, ["818"]);
});

test("mergeTaiData: 重複行と明らかな異常差玉を確定値にしない", () => {
  const source = [
    { num: "818", val: null, rank: null, status: "failed" },
    { num: "819", val: null, rank: null, status: "failed" },
  ];
  const imported = [
    { num: "818", val: 1000 },
    { num: "0818", val: 2000 },
    { num: "819", val: 999999999999 },
  ];
  const result = mergeTaiData(source, imported);
  assert.deepStrictEqual(result.duplicateNumbers, ["818"]);
  assert.deepStrictEqual(result.invalidDeltaNumbers, ["819"]);
  assert.strictEqual(result.rows[0].val, null);
  assert.strictEqual(result.rows[0].status, "failed");
  assert.strictEqual(result.rows[1].val, null);
  assert.strictEqual(result.rows[1].status, "failed");
});

test("mergeTaiData: 確定済みグラフ差玉をAI取り込み値で上書きしない", () => {
  const source = [{ num: "810", val: -8500, rank: getRank(-8500).rank, status: "ok", confidence: 0.967 }];
  const result = mergeTaiData(source, [{ num: "810", val: 8500, normalSpins: 1200, totalStarts: 10 }]);
  assert.deepStrictEqual(result.conflictNumbers, ["810"]);
  assert.strictEqual(result.rows[0].val, -8500);
  assert.strictEqual(result.rows[0].rank, getRank(-8500).rank);
  assert.strictEqual(result.rows[0].confidence, 0.967);
  assert.strictEqual(result.rows[0].normalSpins, 1200);
});

test("validateDeltaRows: 未読取・要確認・重複番号があれば保存不可", () => {
  const valid = validateDeltaRows([
    { num: "810", val: 0, status: "ok" },
    { num: "811", val: -4500, status: "ok" },
  ]);
  assert.strictEqual(valid.valid, true);
  assert.strictEqual(valid.resolvedCount, 2);

  const invalid = validateDeltaRows([
    { num: "810", val: null, status: "failed" },
    { num: "810", val: 500, status: "review" },
  ]);
  assert.strictEqual(invalid.valid, false);
  assert.strictEqual(invalid.unresolvedCount, 2);
  assert.deepStrictEqual(invalid.duplicateNumbers, ["810"]);
  assert.deepStrictEqual(invalid.errors.sort(), ["duplicate-number", "unresolved-delta"]);
});

test("validateDeltaRows: statusはokだけを確定扱いにし、台番号を正規化して検証", () => {
  const invalid = validateDeltaRows([
    { num: "ABC", val: 500, status: "ok" },
    { num: "0810", val: 500, status: "ok" },
    { num: "810", val: 500, status: "bogus" },
  ]);
  assert.strictEqual(invalid.valid, false);
  assert.deepStrictEqual(invalid.invalidNumberIndices, [0]);
  assert.deepStrictEqual(invalid.duplicateNumbers, ["810"]);
  assert.deepStrictEqual(invalid.unresolvedIndices, [2]);
  assert.deepStrictEqual(invalid.errors.sort(), ["duplicate-number", "invalid-number", "unresolved-delta"]);
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

test("islandToNumbers: 複数行と欠けを考慮して実在番号だけ返す", () => {
  const ranges = islandToNumbers({
    ranges: [{ start: 509, end: 499 }, { start: 479, end: 490 }, { start: 546, end: 548 }],
  });
  assert.strictEqual(ranges.length, 26);
  assert.strictEqual(ranges[0], "479");
  assert.strictEqual(ranges[11], "490");
  assert.strictEqual(ranges[12], "499");
  assert.strictEqual(ranges.at(-1), "548");

  const withGap = islandToNumbers({ start: 499, end: 509, gaps: [505] });
  assert.strictEqual(withGap.length, 10);
  assert.ok(!withGap.includes("505"));
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

// ---- pruneScans（スキャン保持ポリシー） ----
test("pruneScans: 期限内・件数内はそのまま保持する", () => {
  const now = new Date("2026-07-14T12:00:00Z");
  const scans = [
    { id: "a", date: "2026-07-01", createdAt: "2026-07-01T10:00:00Z" },
    { id: "b", date: "2026-07-10", createdAt: "2026-07-10T10:00:00Z" },
  ];
  const result = pruneScans(scans, { now });
  assert.strictEqual(result.length, 2);
});

test("pruneScans: 90日より古いスキャンを落とす", () => {
  const now = new Date("2026-07-14T12:00:00Z");
  const scans = [
    { id: "old", date: "2026-01-01", createdAt: "2026-01-01T10:00:00Z" },
    { id: "new", date: "2026-07-10", createdAt: "2026-07-10T10:00:00Z" },
  ];
  const result = pruneScans(scans, { now });
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].id, "new");
});

test("pruneScans: 件数超過は古い日付から落とす", () => {
  const now = new Date("2026-07-14T12:00:00Z");
  const scans = Array.from({ length: 5 }, (_, i) => ({
    id: `s${i}`,
    date: `2026-07-${String(i + 1).padStart(2, "0")}`,
    createdAt: `2026-07-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
  }));
  const result = pruneScans(scans, { now, maxCount: 3 });
  assert.strictEqual(result.length, 3);
  assert.deepStrictEqual(result.map((s) => s.id), ["s2", "s3", "s4"]);
});

test("pruneScans: 配列以外や null 要素も安全に扱う", () => {
  assert.deepStrictEqual(pruneScans(null), []);
  assert.deepStrictEqual(pruneScans([null, undefined]), []);
});
